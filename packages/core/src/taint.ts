/* ─────────────────────────────────── the taint firewall ───────────────────────────────────
 *
 * SOLUTION.md §"THE TAINT FIREWALL": information-flow control (Denning, 1976). Every value the
 * plan handles carries a source label; a CONTENT_READ taints; and THE INVARIANT is:
 *
 *      no tainted value may reach a routing sink.
 *
 * This is the multi-step generalization of the built single-step firewall (SCREEN/CONTENT never
 * licenses routing). In one step, "the address only appeared in read content" is caught by the
 * gate's `provenance_mismatch` (no transcript span). Across steps, a value can be read in step 1,
 * passed through step 2, and reach a destination in step 3 — so the label must PROPAGATE. The
 * TaintLedger is that propagation; `assertNoTaintedRoutingSink` is the invariant, checked per step
 * BEFORE the gate so the block is explicit and independent of whether the tainted value was ever
 * admitted to the routing pool.
 *
 * Pure data, no clock/IO/LLM. Values compared under one conservative normalization.
 */

import { PreflightBlock } from './block.ts';
import type { ToolCall, ToolContract, Tier3Slot } from './gate.ts';

/** Conservative value normalization: trim, lowercase, drop leading routing sigils (#, @, $). */
export function normalizeValue(value: string): string {
  return value.trim().toLowerCase().replace(/^[#@$]+/, '');
}

/**
 * The accumulating information-flow label set for one plan run. A value is TAINTED once it (or
 * anything it was derived from) originated in a CONTENT_READ. Taint only ever grows within a run.
 */
export class TaintLedger {
  private readonly tainted = new Set<string>();

  /** Mark values tainted (a CONTENT_READ output, or a propagated derivation). */
  taint(values: readonly string[]): void {
    for (const value of values) {
      const key = normalizeValue(value);
      if (key !== '') this.tainted.add(key);
    }
  }

  isTainted(value: string): boolean {
    return this.tainted.has(normalizeValue(value));
  }

  /**
   * Propagation edge: if ANY value in `derivedFrom` is tainted, everything `produced` becomes
   * tainted too — regardless of the producing step's declared kind. This is what makes
   * read(email)→extract(address)→pay(address) block across ≥2 hops: the extract step is
   * "structured", but its output is derived from a tainted read, so the taint rides through.
   * Returns whether propagation fired (the produced values are now tainted).
   *
   * HONESTY (residual, named by a todo test): propagation follows the DECLARED derivedFrom edges.
   * A structured step that copies a tainted value into its output WITHOUT declaring derivedFrom
   * (an undeclared launder / confused-deputy) is not caught at this pure-data layer. That is a
   * classifier-trust gap, not a firewall gap — flagged, never faked.
   */
  propagate(derivedFrom: readonly string[], produced: readonly string[]): boolean {
    const carriesTaint = derivedFrom.some((value) => this.isTainted(value));
    if (carriesTaint) this.taint(produced);
    return carriesTaint;
  }

  /** Deterministic snapshot of the tainted set (sorted) — for receipts / drift data / assertions. */
  snapshot(): string[] {
    return [...this.tainted].sort();
  }
}

/** A routing sink = a routing param carrying a Tier-3 slot (destination / amount / permission). */
export interface TaintViolation {
  param: string;
  slot: Tier3Slot;
  value: string;
}

/**
 * The invariant, as a pure check: does any routing SINK of this call carry a tainted value?
 * Returns the first violation or null. Only slotted routing params are sinks — a thread/reply
 * routing target (no slot) is a read-back reply, not a new destination, so it is not a sink here.
 */
export function taintedRoutingSink(
  call: ToolCall,
  contract: ToolContract,
  ledger: TaintLedger,
): TaintViolation | null {
  for (const [name, spec] of Object.entries(contract.params)) {
    if (spec.class !== 'routing' || spec.slot === undefined) continue;
    const raw = call.args[name];
    if (typeof raw === 'string' && ledger.isTainted(raw)) {
      return { param: name, slot: spec.slot, value: raw };
    }
  }
  return null;
}

/**
 * Enforce the invariant. Throws the SAME firewall block the single-step gate uses for content→
 * routing (`provenance_mismatch`, disposition BLOCK) — a tainted value reaching a destination IS
 * routing-from-content, just discovered across steps. `detail.taint` marks the multi-step origin.
 */
export function assertNoTaintedRoutingSink(
  call: ToolCall,
  contract: ToolContract,
  ledger: TaintLedger,
): void {
  const violation = taintedRoutingSink(call, contract, ledger);
  if (violation === null) return;
  throw new PreflightBlock('provenance_mismatch', {
    param: violation.param,
    slot: violation.slot,
    query: violation.value,
    taint: true,
    found: 'content_read',
    found_rank: 0,
    required: 'transcript_span',
    required_rank: 4,
  });
}
