/* ─────────────────────────────────── the autonomy dial ────────────────────────────────────
 *
 * SOLUTION.md §"THE AUTONOMY DIAL": flip from confirm-everything (Siri) to just-do-it-stop-only-
 * when-unprovable (Jarvis). This is a PURE POLICY TABLE — (level × node-verdict) → action — no
 * model, no clock. The runtime reads a node's proof-tree verdict and this table to decide whether
 * to fire it silently, ask one question, or refuse.
 *
 * THE SAFETY INVARIANT (tested): raising autonomy never weakens safety. `block` → 'block' and
 * `hold` → 'hold' at EVERY level; only the `pass` row relaxes (L0 confirms even grounded passes;
 * L1+ auto-runs them). You cannot dial your way into firing an ungrounded or tainted action.
 * The plan-level META is where the higher levels actually differ (tree pre-approval, receipts).
 */

import type { NodeVerdict } from './plan.ts';

/** L0 confirm-all · L1 hold-flagged · L2 approve-tree-then-auto · L3 full-auto (+receipt). */
export type AutonomyLevel = 0 | 1 | 2 | 3;

/** auto_run — fire silently · hold — fire after one spoken confirmation · block — never fire. */
export type AutonomyAction = 'auto_run' | 'hold' | 'block';

/**
 * The table. Read it top to bottom as the dial turning up:
 *   L0 CONFIRM_ALL  — nothing fires without a nod: even a clean `pass` becomes 'hold'.
 *   L1 HOLD_FLAGGED — grounded passes auto-run; only flagged (hold/deferred) stop; blocks refused.
 *   L2 APPROVE_TREE — same per-node policy as L1, gated by upfront whole-plan approval (see meta).
 *   L3 FULL_AUTO    — same per-node policy as L1, no upfront approval, every action leaves a receipt.
 * block and hold are level-invariant — the safety floor the dial cannot lower.
 */
export const AUTONOMY_POLICY: Record<AutonomyLevel, Record<NodeVerdict, AutonomyAction>> = {
  0: { pass: 'hold', hold: 'hold', block: 'block', deferred: 'hold' },
  1: { pass: 'auto_run', hold: 'hold', block: 'block', deferred: 'hold' },
  2: { pass: 'auto_run', hold: 'hold', block: 'block', deferred: 'hold' },
  3: { pass: 'auto_run', hold: 'hold', block: 'block', deferred: 'hold' },
};

/** Plan-level behavior that varies by level but is not a per-node action — where L0/L2/L3 differ. */
export interface AutonomyMeta {
  /** L0: every action is confirmed, even grounded passes. */
  confirmAll: boolean;
  /** L2: the whole proof-tree must be approved once, upfront, before any auto_run. */
  requiresPlanApproval: boolean;
  /** L3: every fired action emits an immutable receipt (the audit trail / drift-map feed). */
  emitsReceipt: boolean;
}

export const AUTONOMY_META: Record<AutonomyLevel, AutonomyMeta> = {
  0: { confirmAll: true, requiresPlanApproval: false, emitsReceipt: false },
  1: { confirmAll: false, requiresPlanApproval: false, emitsReceipt: false },
  2: { confirmAll: false, requiresPlanApproval: true, emitsReceipt: false },
  3: { confirmAll: false, requiresPlanApproval: false, emitsReceipt: true },
};

/** The action for a single node verdict at a given level — the whole dial, in one lookup. */
export function actionFor(level: AutonomyLevel, verdict: NodeVerdict): AutonomyAction {
  return AUTONOMY_POLICY[level][verdict];
}

export function metaFor(level: AutonomyLevel): AutonomyMeta {
  return AUTONOMY_META[level];
}
