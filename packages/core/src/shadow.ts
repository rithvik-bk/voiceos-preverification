/* ─────────────────────────────────────── shadow mode ──────────────────────────────────────
 *
 * SPEC-v4 §19: rollout is staged — `shadow` (observe and log what would have been blocked,
 * change NOTHING), then `warn`, then `enforce`. Shadow mode is the entire reason this can
 * ship with zero product risk. Phase 2 builds ONLY shadow.
 *
 * The contract of `shadowGate`: it NEVER throws, it NEVER stops the call. It runs the real
 * gate, writes one ShadowRecord, and hands back the verdict as data. The host proceeds with
 * the call exactly as if the gate did not exist. Nothing here is enforcement.
 */

import type { GroundingStore } from './grounding.ts';
import { runGate, type Receipt, type ToolCall, type ToolContract } from './gate.ts';

export interface ShadowRecord {
  mode: 'shadow';
  seq: number;
  /** ms epoch from the injected clock (test seam, ported idea: tools-t2.ts `useClock`). */
  at: number;
  tool: string;
  utterance_id: string;
  decision: 'would_have_blocked' | 'would_have_passed';
  /** present iff would_have_blocked: the machine code + evidence a founder reads in the log. */
  code?: string;
  detail?: Record<string, unknown>;
  /** present iff would_have_passed: the full provenance receipt (§17). */
  receipt?: Receipt;
}

export interface ShadowOutcome {
  /** Always false in shadow mode — the record IS the output; the call is untouched. */
  enforced: false;
  decision: 'would_have_blocked' | 'would_have_passed';
  record: ShadowRecord;
}

export class ShadowLog {
  readonly records: ShadowRecord[] = [];
  private seq = 0;
  private readonly now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? Date.now;
  }

  append(record: Omit<ShadowRecord, 'mode' | 'seq' | 'at'>): ShadowRecord {
    this.seq += 1;
    const full: ShadowRecord = { mode: 'shadow', seq: this.seq, at: this.now(), ...record };
    this.records.push(full);
    return full;
  }

  /** JSONL, one record per line — what the demo tails and what a founder is shown. */
  toJsonl(): string {
    return this.records.map((record) => JSON.stringify(record)).join('\n');
  }
}

export function shadowGate(
  call: ToolCall,
  contract: ToolContract,
  store: GroundingStore,
  log: ShadowLog,
): ShadowOutcome {
  const verdict = runGate(call, contract, store);
  if (verdict.verdict === 'pass') {
    const record = log.append({
      tool: call.tool,
      utterance_id: call.transcript?.utterance_id ?? '',
      decision: 'would_have_passed',
      receipt: verdict.receipt,
    });
    return { enforced: false, decision: 'would_have_passed', record };
  }
  const record = log.append({
    tool: call.tool,
    utterance_id: call.transcript.utterance_id,
    decision: 'would_have_blocked',
    code: verdict.code,
    detail: verdict.detail,
  });
  return { enforced: false, decision: 'would_have_blocked', record };
}
