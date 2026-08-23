/* ─────────────────────────────── the Preflight MCP server ──────────────────────────────────
 *
 * A local stdio MCP server VoiceOS launches via `custom-mcp:add {command,args,env}`
 * (SOLUTION.md, L31725/L21142). It exposes one proxy tool per wrapped downstream tool; on
 * callTool it runs `makeRunCall` (the gate) and maps the CallResult onto an MCP CallToolResult:
 *   PASS / SURFACE → the downstream result (forwarded), structuredContent.preflight carries the
 *                    verdict + receipt so the card can show the proof.
 *   HOLD           → NOT forwarded (ENFORCE): structuredContent.preflight carries reasonCode +
 *                    discrepancy + spoken repair; content text = the repair line. isError=false
 *                    (a HOLD is "needs one answer", not a failure).
 *   BLOCK          → NOT forwarded (ENFORCE): same payload, isError=true (a hard refusal — the
 *                    injection firewall).
 * In OBSERVE the call is always forwarded; the would-have verdict rides in structuredContent.
 *
 * The low-level `Server` (not the Zod-schema McpServer) is used on purpose: the proxy must pass
 * arbitrary args — including the reserved `_preflight` seam field — through UNTOUCHED, and must
 * control isError / structuredContent precisely. No Zod input schema is imposed on the caller.
 *
 * stdout is the MCP wire — receipts are emitted through the injected `onReceipt` sink ONLY
 * (bin.ts routes it to a file or stderr). Nothing here ever writes to stdout.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { makeRunCall, type CallResult, type WrappedTool } from './withPreflight.ts';
import type { PreflightReceipt } from './receipt.ts';
import { verifyPlan, type AdapterPlan, type PlanState } from './plan.ts';
import { runPlan, type PlanStepReceipt } from './runtime.ts';
import type { AutonomyLevel } from '../../../core/src/index.ts';

export interface PreflightServerConfig {
  serverId?: string;
  /** default 'observe' — the safe mode. */
  mode?: 'observe' | 'enforce';
  tools: WrappedTool[];
  /** receipt sink; MUST NOT write to stdout (that is the MCP wire). Default: no-op. */
  onReceipt?: (receipt: PreflightReceipt) => void;
  /** clock seam for firedAt; default Date.now. Pin it in tests for byte-determinism. */
  now?: () => number;
  /**
   * Expose the multi-step `verify_plan` tool (the trust runtime: proof-tree + taint + autonomy).
   * Off by default so the default tool listing is exactly the wrapped downstreams. When on, one
   * extra tool `verify_plan` appears; it verifies a whole plan and (optionally) applies the dial.
   */
  exposePlanVerification?: boolean;
  /** plan-step receipt sink for verify_plan runs. MUST NOT write to stdout. Default: no-op. */
  onPlanReceipt?: (receipt: PlanStepReceipt) => void;
}

/** The MCP arguments the `verify_plan` tool accepts (all plain JSON). */
interface VerifyPlanArgs {
  plan: AdapterPlan;
  transcript?: string;
  state?: PlanState;
  /** apply the autonomy dial + per-step receipts on top of the tree. */
  run?: { level?: AutonomyLevel; mode?: 'observe' | 'enforce' };
}

const VERIFY_PLAN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: true,
  required: ['plan'],
  properties: {
    plan: { type: 'object', description: 'AdapterPlan: { steps: [{ id, tool:{name,tier,params}, args, transcript?, dependsOn?, output? }] }' },
    transcript: { type: 'string', description: 'Session fallback utterance for steps that omit their own.' },
    state: { type: 'object', description: 'Grounded pool: { referents: [{ kind, id, label, aliases?, origin, tool? }] }' },
    run: { type: 'object', description: 'Optional autonomy application: { level: 0..3, mode: observe|enforce }.' },
  },
};

const DEFAULT_INPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: true,
  properties: {
    _preflight: {
      type: 'object',
      description:
        'Optional VoiceOS context seam: { transcript, utteranceId, interactionId, referents[] }. ' +
        'Present ⇒ full checks (injection firewall + span licensing). Absent ⇒ args-only degraded mode.',
    },
  },
};

/** Turn one CallResult into the MCP CallToolResult VoiceOS receives. */
function toolResult(result: CallResult): {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
} {
  const preflight = {
    disposition: result.disposition,
    forwarded: result.forwarded,
    mode: result.receipt.mode,
    transcriptMode: result.receipt.transcriptMode,
    injectionFirewall: result.receipt.injectionFirewall,
    ...(result.receipt.observeWouldHaveBlocked !== undefined
      ? { observeWouldHaveBlocked: result.receipt.observeWouldHaveBlocked }
      : {}),
    ...(result.refusal !== undefined
      ? { reasonCode: result.refusal.discrepancy.reasonCode, coreCode: result.refusal.discrepancy.coreCode, discrepancy: result.refusal.discrepancy, repair: result.refusal.repair }
      : {}),
    receipt: result.receipt as unknown as Record<string, unknown>,
  };

  if (result.forwarded) {
    // PASS / SURFACE (or OBSERVE-forwarded): hand back the downstream payload.
    const text =
      typeof result.downstream === 'string' ? result.downstream : JSON.stringify(result.downstream ?? null);
    return { content: [{ type: 'text', text }], structuredContent: { preflight, downstream: result.downstream ?? null } };
  }

  // ENFORCE refusal: the downstream was NOT called. The card renders from `preflight`.
  const repair = result.refusal?.repair ?? 'Held for confirmation.';
  return {
    content: [{ type: 'text', text: repair }],
    structuredContent: { preflight },
    isError: result.disposition === 'BLOCK',
  };
}

/** Build (but do not connect) the Preflight MCP server. Caller attaches a transport. */
export function createPreflightServer(config: PreflightServerConfig): { server: Server; serverId: string; mode: 'observe' | 'enforce' } {
  const serverId = config.serverId ?? 'preflight-voiceos';
  const mode = config.mode ?? 'observe';
  const now = config.now ?? Date.now;
  const onReceipt = config.onReceipt ?? ((): void => {});
  const onPlanReceipt = config.onPlanReceipt ?? ((): void => {});
  const exposePlan = config.exposePlanVerification ?? false;

  const runners = new Map<string, (args: Record<string, unknown>) => Promise<CallResult>>();
  for (const tool of config.tools) {
    runners.set(tool.name, makeRunCall(tool, { serverId, mode, now }));
  }

  const server = new Server(
    { name: serverId, version: '0.0.1' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = config.tools.map((tool) => ({
      name: tool.name,
      description:
        (tool.description ?? `Preflight-gated proxy for ${tool.name}`) +
        ` [preflight:${mode}]`,
      inputSchema: (tool.inputSchema ?? DEFAULT_INPUT_SCHEMA) as { [key: string]: unknown },
    }));
    if (exposePlan) {
      tools.push({
        name: 'verify_plan',
        description:
          'Preflight trust runtime: verify a whole multi-step PLAN (a DAG) before any step fires. ' +
          'Returns a proof-tree (every step pass/hold/block/deferred) + optional autonomy-dial decisions. ' +
          `[preflight:${mode}]`,
        inputSchema: VERIFY_PLAN_SCHEMA as { [key: string]: unknown },
      });
    }
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;

    if (name === 'verify_plan' && exposePlan) {
      const args = (request.params.arguments ?? {}) as unknown as VerifyPlanArgs;
      if (args.plan === undefined || !Array.isArray(args.plan.steps)) {
        return { content: [{ type: 'text' as const, text: 'verify_plan requires { plan: { steps: [...] } }' }], isError: true };
      }
      const tree = verifyPlan(args.plan, args.transcript, args.state);
      let run: unknown;
      if (args.run !== undefined) {
        const argsByStep: Record<string, Record<string, unknown>> = {};
        for (const step of args.plan.steps) argsByStep[step.id] = step.args ?? {};
        const result = await runPlan(tree, argsByStep, {
          level: args.run.level,
          mode: args.run.mode ?? mode,
          serverId,
          now,
          onReceipt: onPlanReceipt,
        });
        run = result;
      }
      const text = `plan verified: ${tree.summary.green} green / ${tree.summary.held} held / ${tree.summary.blocked} blocked / ${tree.summary.deferred} deferred (of ${tree.summary.steps})`;
      return {
        content: [{ type: 'text' as const, text }],
        structuredContent: { tree: tree as unknown as Record<string, unknown>, ...(run !== undefined ? { run: run as Record<string, unknown> } : {}) },
        isError: tree.summary.blocked > 0,
      };
    }

    const runner = runners.get(name);
    if (runner === undefined) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const result = await runner(args);
    onReceipt(result.receipt);
    return toolResult(result);
  });

  return { server, serverId, mode };
}
