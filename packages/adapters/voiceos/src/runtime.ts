/* ─────────────────────────── the per-step plan runtime gate ────────────────────────────────
 *
 * verifyPlan (plan.ts) produces a ProofTree — the whole plan classified before anything fires.
 * This module is what a runtime DOES with that tree: it turns each node's proof verdict into a
 * runtime decision through the autonomy dial, and emits ONE receipt per step (the seam to Arav's
 * post-verifier). It is the multi-step analogue of withPreflight's OBSERVE/ENFORCE split.
 *
 *   OBSERVE (default, safe) — shadow. Every step is treated as run (the executor forwards); a
 *     flagged step records `observeWouldHold`/`observeWouldBlock` but is NEVER actually withheld.
 *     This is how the trust layer ships on top of VoiceOS's DORMANT DAG engine with zero product
 *     risk: it watches the plan run and lights up the proof-tree without changing behavior.
 *   ENFORCE — the autonomy policy is applied for real: `auto_run` green steps fire, `hold` steps
 *     stop for one spoken confirmation, `block` steps are refused, `deferred` (poisoned) steps do
 *     not fire. No green downstream of a hole.
 *
 * EXECUTION is optional and out of lane by default: we do PRE-verification. If the caller supplies
 * `handlers` (tool name → fn), a step that the policy says `auto_run` (and, in observe, every
 * forwarded step) is actually invoked; otherwise `ran` is the policy decision alone and no
 * downstream is touched. The receipt is emitted regardless.
 *
 * Deterministic library path: no clock of its own — `now` is injected (default Date.now, pinned
 * in tests). Same tree + same options ⇒ byte-identical decisions.
 */

import {
  actionFor,
  metaFor,
  type AutonomyAction,
  type AutonomyLevel,
  type AutonomyMeta,
  type LicensedBy,
  type NodeVerdict,
  type ProofNode,
  type ProofTree,
} from '../../../core/src/index.ts';

import { paramsFromReceipt, type ContentParamReceipt, type RoutingParamReceipt } from './receipt.ts';

/** The immutable per-step audit line — the plan-level PreflightReceipt (seam to post-verification). */
export interface PlanStepReceipt {
  interactionId: string;
  serverId: string;
  stepId: string;
  toolName: string;
  mode: 'observe' | 'enforce';
  autonomyLevel: AutonomyLevel;
  /** the proof-tree verdict this step's decision rests on. */
  verdict: NodeVerdict;
  /** the dial's action for (level × verdict). */
  action: AutonomyAction;
  /** did the step actually fire (policy decision; true for every forwarded step in observe). */
  ran: boolean;
  /** observe-only: the gate WOULD have held (auto_run was denied by the proof). */
  observeWouldHold?: boolean;
  /** observe-only: the gate WOULD have blocked (a firewall refusal). */
  observeWouldBlock?: boolean;
  /** raw core wire code + detail, when the node did not cleanly pass. */
  coreCode?: string;
  detail?: Record<string, unknown>;
  /** the composition provenance: a destination licensed by an earlier step's surfaced output. */
  licensedBy?: LicensedBy[];
  routingParams: RoutingParamReceipt[];
  contentParams: ContentParamReceipt[];
  dependsOn: string[];
  firedAt: number;
}

/** One step's runtime outcome. */
export interface PlanStepDecision {
  stepId: string;
  toolName: string;
  verdict: NodeVerdict;
  action: AutonomyAction;
  ran: boolean;
  receipt: PlanStepReceipt;
  /** the downstream return value, iff a handler was supplied AND the step actually ran. */
  downstream?: unknown;
}

export interface PlanRunResult {
  decisions: PlanStepDecision[];
  summary: ProofTree['summary'];
  meta: AutonomyMeta;
  level: AutonomyLevel;
  mode: 'observe' | 'enforce';
}

export interface PlanRunOptions {
  /** L0 confirm-all · L1 hold-flagged (default) · L2 approve-tree · L3 full-auto+receipt. */
  level?: AutonomyLevel;
  /** observe (default, shadow) | enforce. */
  mode?: 'observe' | 'enforce';
  serverId?: string;
  interactionId?: string;
  /** clock seam; default Date.now. Pin it in tests for byte-determinism. */
  now?: () => number;
  /** receipt sink, one call per step. Default: no-op. MUST NOT write to stdout. */
  onReceipt?: (receipt: PlanStepReceipt) => void;
  /** optional real downstreams; supplied ⇒ auto_run steps actually execute (out-of-lane opt-in). */
  handlers?: Record<string, (args: Record<string, unknown>) => unknown | Promise<unknown>>;
}

/**
 * Whether a step FIRES, given the dial action + mode.
 *   observe — always forwards (shadow), whatever the action; flagged steps only get labeled.
 *   enforce — only `auto_run` fires; hold/block/deferred do not.
 */
function fires(action: AutonomyAction, mode: 'observe' | 'enforce'): boolean {
  if (mode === 'observe') return true;
  return action === 'auto_run';
}

function receiptFor(
  node: ProofNode,
  args: Record<string, unknown>,
  action: AutonomyAction,
  ran: boolean,
  mode: 'observe' | 'enforce',
  level: AutonomyLevel,
  serverId: string,
  interactionId: string,
  firedAt: number,
): PlanStepReceipt {
  const routingParams: RoutingParamReceipt[] = [];
  const contentParams: ContentParamReceipt[] = [];
  if (node.receipt !== undefined) {
    const split = paramsFromReceipt(node.receipt);
    routingParams.push(...split.routingParams);
    contentParams.push(...split.contentParams);
  }

  const receipt: PlanStepReceipt = {
    interactionId,
    serverId,
    stepId: node.id,
    toolName: node.tool,
    mode,
    autonomyLevel: level,
    verdict: node.verdict,
    action,
    ran,
    routingParams,
    contentParams,
    dependsOn: node.dependsOn,
    firedAt,
  };

  // Observe honesty labels: the proof denied auto_run, but we forwarded anyway.
  if (mode === 'observe' && action !== 'auto_run') {
    if (action === 'block') receipt.observeWouldBlock = true;
    else receipt.observeWouldHold = true;
  }
  if (node.block !== undefined) {
    receipt.coreCode = node.block.code;
    receipt.detail = node.block.detail;
  }
  if (node.licensedBy !== undefined) receipt.licensedBy = node.licensedBy;
  void args; // args live on the plan step; the receipt keys by stepId to that plan (kept lean).
  return receipt;
}

/**
 * Apply the autonomy dial to a ProofTree and emit one receipt per step. This is the per-step
 * runtime gate. It does NOT re-run the gate — the tree already carries every verdict; the dial is
 * a pure lookup (autonomy.ts). Steps are processed in the tree's (declared) order.
 */
export async function runPlan(
  tree: ProofTree,
  argsByStep: Record<string, Record<string, unknown>>,
  options: PlanRunOptions = {},
): Promise<PlanRunResult> {
  const level: AutonomyLevel = options.level ?? 1;
  const mode = options.mode ?? 'observe';
  const serverId = options.serverId ?? 'preflight-voiceos';
  const interactionId = options.interactionId ?? 'plan';
  const now = options.now ?? Date.now;
  const onReceipt = options.onReceipt ?? ((): void => {});
  const meta = metaFor(level);

  const decisions: PlanStepDecision[] = [];
  for (const node of tree.nodes) {
    // L0 confirmAll turns even a clean pass into a hold — encoded in the policy table already.
    const action = actionFor(level, node.verdict);
    const ran = fires(action, mode);
    const args = argsByStep[node.id] ?? {};
    const firedAt = now();
    const receipt = receiptFor(node, args, action, ran, mode, level, serverId, interactionId, firedAt);
    onReceipt(receipt);

    const decision: PlanStepDecision = { stepId: node.id, toolName: node.tool, verdict: node.verdict, action, ran, receipt };
    const handler = options.handlers?.[node.tool];
    if (ran && handler !== undefined) {
      decision.downstream = await handler(args);
    }
    decisions.push(decision);
  }

  return { decisions, summary: tree.summary, meta, level, mode };
}
