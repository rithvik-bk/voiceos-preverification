/* ────────────────────────────────── the withPreflight wrapper ──────────────────────────────
 *
 * The production drop-in pattern: wrap a downstream tool so that every call runs the core gate
 * on its args FIRST, then either forwards to the downstream (PASS/SURFACE) or refuses
 * (HOLD/BLOCK) — all deterministic, zero LLM in the hot path. This module is transport-agnostic:
 * it returns a `runCall(args)` an MCP server (server.ts) hangs a proxy tool on.
 *
 * TWO MODES (env-selected in bin.ts; default OBSERVE, the safe one):
 *   OBSERVE — shadow. NEVER refuses a real call. Runs the gate, records observeWouldHaveBlocked,
 *             then forwards to the downstream regardless. This is how it ships with zero product
 *             risk (core/shadow.ts §19).
 *   ENFORCE — on a gate refusal, returns the structured HOLD/BLOCK to VoiceOS and does NOT call
 *             the downstream. On pass, forwards.
 *
 * TWO TRANSCRIPT MODES (auto-detected from the context, never assumed):
 *   full              — a transcript is present (VoiceOS seam wired at L28076): the injection
 *                       firewall + span attribution run. Destination slots keep their S11.2 rule.
 *   args_only_degraded — no transcript (zero-mod {name,arguments} boundary, L21045): the slot
 *                       rule is STRIPPED from the contract (an empty transcript would false-block
 *                       every destination as injection). Ambiguity / resolution / rank checks
 *                       still run against the pool. The receipt labels injectionFirewall
 *                       'unavailable_no_transcript'. We NEVER claim the firewall ran here.
 */

import {
  runGate,
  type ParamSpec,
  type ToolCall,
  type ToolContract,
} from '../../../core/src/index.ts';

import { buildGroundingStore, buildTranscript, hasTranscript, type PreflightContext } from './context.ts';
import { refusalFrom, type Disposition, type Refusal } from './repair.ts';
import { paramsFromReceipt, type PreflightReceipt } from './receipt.ts';

/** The reserved arguments key that carries the VoiceOS context seam. */
export const PREFLIGHT_ARG_KEY = '_preflight';

/** A downstream tool wrapped by Preflight. */
export interface WrappedTool {
  name: string;
  description?: string;
  /** JSON Schema advertised to VoiceOS for this proxy tool's arguments. */
  inputSchema?: Record<string, unknown>;
  tier?: 1 | 2 | 3;
  /** routing/content classification of each param — the ToolContract seed (§20 annotation). */
  params: Record<string, ParamSpec>;
  /** the real downstream call. Only invoked on PASS/SURFACE (always in OBSERVE). */
  handler: (args: Record<string, unknown>) => unknown | Promise<unknown>;
  /**
   * Optional context provider. If the VoiceOS seam is not wired, supply the grounding pool (and,
   * where available, the transcript) here — e.g. query the downstream for its channel/user list.
   * A provider return overrides any inline `_preflight` field.
   */
  context?: (args: Record<string, unknown>) => PreflightContext | undefined | Promise<PreflightContext | undefined>;
}

export interface CallResult {
  /** the product disposition; PASS/SURFACE forwarded, HOLD/BLOCK refused (ENFORCE only). */
  disposition: Disposition;
  /** true iff the downstream was actually invoked. */
  forwarded: boolean;
  /** the downstream return value, iff forwarded. */
  downstream?: unknown;
  /** the refusal payload, iff the gate refused (present even in OBSERVE, where it is advisory). */
  refusal?: Refusal;
  receipt: PreflightReceipt;
}

export interface WrapOptions {
  serverId: string;
  mode: 'observe' | 'enforce';
  now: () => number;
}

/** Pull the `_preflight` context field out of the args; return the cleaned args + the context. */
function extractSeamContext(args: Record<string, unknown>): {
  clean: Record<string, unknown>;
  inline: PreflightContext | undefined;
} {
  const clean: Record<string, unknown> = {};
  let inline: PreflightContext | undefined;
  for (const [key, value] of Object.entries(args)) {
    if (key === PREFLIGHT_ARG_KEY) {
      if (value !== null && typeof value === 'object') inline = value as PreflightContext;
      continue;
    }
    clean[key] = value;
  }
  return { clean, inline };
}

/** Drop the S11.2 destination/amount/permission slot rule from a contract (degraded mode). */
function stripSlots(params: Record<string, ParamSpec>): Record<string, ParamSpec> {
  const out: Record<string, ParamSpec> = {};
  for (const [name, spec] of Object.entries(params)) {
    const copy: ParamSpec = { class: spec.class, ...(spec.required !== undefined ? { required: spec.required } : {}) };
    out[name] = copy; // slot deliberately omitted
  }
  return out;
}

/** Derive the product disposition of a PASS: SURFACE if any content param was model-composed. */
function passDisposition(contentSurfaced: boolean): Disposition {
  return contentSurfaced ? 'SURFACE' : 'PASS';
}

/** Build a runCall(args) closure for one wrapped tool. */
export function makeRunCall(tool: WrappedTool, options: WrapOptions): (args: Record<string, unknown>) => Promise<CallResult> {
  return async function runCall(rawArgs: Record<string, unknown>): Promise<CallResult> {
    const { clean, inline } = extractSeamContext(rawArgs ?? {});
    const provided = tool.context !== undefined ? await tool.context(clean) : undefined;
    // Merge, inline seam first: VoiceOS's `_preflight` carries the real transcript + referents
    // (authoritative); the provider FILLS GAPS (e.g. the grounded pool at true zero-mod when the
    // seam carried no referents). Never let a provider stub shadow a real transcript.
    const inlineReferents = inline?.referents;
    const mergedTranscript = inline?.transcript ?? provided?.transcript;
    const mergedUtteranceId = inline?.utteranceId ?? provided?.utteranceId;
    const mergedInteractionId = inline?.interactionId ?? provided?.interactionId;
    const context: PreflightContext = {
      ...(mergedTranscript !== undefined ? { transcript: mergedTranscript } : {}),
      ...(mergedUtteranceId !== undefined ? { utteranceId: mergedUtteranceId } : {}),
      ...(mergedInteractionId !== undefined ? { interactionId: mergedInteractionId } : {}),
      referents: inlineReferents !== undefined && inlineReferents.length > 0 ? inlineReferents : provided?.referents ?? [],
    };

    const full = hasTranscript(context);
    const transcriptMode: 'full' | 'args_only_degraded' = full ? 'full' : 'args_only_degraded';
    const injectionFirewall: 'active' | 'unavailable_no_transcript' = full ? 'active' : 'unavailable_no_transcript';

    const store = buildGroundingStore(context);
    const transcript = buildTranscript(context);
    const contractParams = full ? tool.params : stripSlots(tool.params);
    const contract: ToolContract = { tool: tool.name, tier: tool.tier ?? 3, params: contractParams };
    const call: ToolCall = { tool: tool.name, args: clean, transcript };

    const verdict = runGate(call, contract, store);
    const interactionId = context.interactionId ?? transcript.utterance_id;
    const firedAt = options.now();

    const baseReceipt = {
      interactionId,
      serverId: options.serverId,
      toolName: tool.name,
      args: clean,
      mode: options.mode,
      transcriptMode,
      injectionFirewall,
      transcriptSnapshot: full
        ? { utteranceId: transcript.utterance_id, text: transcript.text, spanIds: transcript.spans.map((s) => s.span_id) }
        : null,
      firedAt,
    };

    if (verdict.verdict === 'pass') {
      const { routingParams, contentParams } = paramsFromReceipt(verdict.receipt);
      const surfaced = contentParams.some((param) => param.surfaced);
      const disposition = passDisposition(surfaced);
      const downstream = await tool.handler(clean);
      const receipt: PreflightReceipt = { ...baseReceipt, verdict: disposition, routingParams, contentParams };
      return { disposition, forwarded: true, downstream, receipt };
    }

    // Gate refused. Build the product refusal + discrepancy + spoken repair.
    const refusal = refusalFrom(verdict);

    if (options.mode === 'observe') {
      // Shadow: record what WOULD have happened, then forward the real call untouched.
      const downstream = await tool.handler(clean);
      const receipt: PreflightReceipt = {
        ...baseReceipt,
        verdict: refusal.disposition,
        observeWouldHaveBlocked: true,
        coreCode: verdict.code,
        discrepancy: refusal.discrepancy,
        repair: refusal.repair,
        routingParams: [],
        contentParams: [],
      };
      return { disposition: refusal.disposition, forwarded: true, downstream, refusal, receipt };
    }

    // Enforce: refuse. The downstream is NOT called.
    const receipt: PreflightReceipt = {
      ...baseReceipt,
      verdict: refusal.disposition,
      coreCode: verdict.code,
      discrepancy: refusal.discrepancy,
      repair: refusal.repair,
      routingParams: [],
      contentParams: [],
    };
    return { disposition: refusal.disposition, forwarded: false, refusal, receipt };
  };
}
