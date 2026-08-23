/* ─────────────────────────── check #5: misbinding (PF_MISBOUND_PARAM) ─────────────────────────
 *
 * SOLUTION.md check #5 (the adversary's hole). Both numbers are spoken, so the number-twin check
 * (#3) passes for each param individually — but the emitted PAIRING crosses a clause boundary.
 *
 *   spoken:  "refund Dan $50 and Sarah $30"
 *   emitted: refund(recipient: Dan, amount: $30)   ← Dan was paired with $50, not $30
 *
 * Dan's licensing span sits in clause 0 ("refund Dan $50"); $30's sits in clause 1 ("Sarah $30").
 * No common clause ⇒ the binding is crossed ⇒ HOLD `misbound_param`. The clean pairings pass.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { REFUND, runGate, type ToolCall } from '../src/gate.ts';
import { dispositionFor, pfNameFor } from '../src/codes.ts';
import { finalizeUtterance } from '../src/transcript.ts';
import { refundStore } from './fixtures.ts';

function refund(utterance: string, recipient: string, amount: string): ToolCall {
  return {
    tool: 'refund',
    args: { recipient, amount },
    transcript: finalizeUtterance('u1', utterance),
  };
}

/* ── the CAUGHT case: cross-clause pairing is held ── */

test('misbinding CAUGHT: recipient and amount from different clauses → misbound_param (HOLD)', () => {
  const store = refundStore();
  // Both "Dan" and "$30" are genuinely spoken → each param grounds; only the pairing is wrong.
  const verdict = runGate(refund('refund Dan $50 and Sarah $30', 'Dan', '$30'), REFUND, store);

  assert.equal(verdict.verdict, 'block');
  assert.ok(verdict.verdict === 'block');
  assert.equal(verdict.code, 'misbound_param');
  // It is a HOLD (ask which pairing), not a hard BLOCK — and its canonical name is PF_MISBOUND_PARAM.
  assert.equal(dispositionFor(verdict.code), 'HOLD');
  assert.equal(pfNameFor(verdict.code), 'PF_MISBOUND_PARAM');
  // The detail names the crossed clauses per param (the evidence a card would render).
  const params = verdict.detail['params'] as Array<{ param: string; clauses: number[] }>;
  const byName = Object.fromEntries(params.map((entry) => [entry.param, entry.clauses]));
  assert.deepEqual(byName['recipient'], [0]);
  assert.deepEqual(byName['amount'], [1]);
});

/* ── the CLEAN case that MUST pass: the correct pairing (same clause) fires ── */

test('misbinding CLEAN: recipient and amount from the SAME clause pass (must not over-block)', () => {
  const store = refundStore();
  // The correct pairing: Dan ↔ $50, both in clause 0. This must NOT be held — a false catch here
  // is exactly the nag SOLUTION.md §UX warns against.
  const verdict = runGate(refund('refund Dan $50 and Sarah $30', 'Dan', '$50'), REFUND, store);

  assert.equal(verdict.verdict, 'pass');
  assert.ok(verdict.verdict === 'pass');
  assert.equal(verdict.receipt.checksRun.misbinding, true);
  // Both routing params cite the transcript span that licensed them (rank 4).
  const recipient = verdict.receipt.params['recipient']!;
  const amount = verdict.receipt.params['amount']!;
  assert.ok(recipient.sources.some((s) => s.kind === 'transcript_span'));
  assert.ok(amount.sources.some((s) => s.kind === 'transcript_span'));
});

test('misbinding CLEAN: a single-clause utterance can never misbind', () => {
  const store = refundStore();
  const verdict = runGate(refund('refund Dan $30', 'Dan', '$30'), REFUND, store);
  assert.equal(verdict.verdict, 'pass');
});

/* ── the OTHER half of the number class: number-twin still fires on a not-spoken amount ── */

test('number-twin: an amount that was never spoken → amount_not_in_speech (HOLD)', () => {
  const store = refundStore();
  // The user said $30; the model emitted $99 — not in the spoken number-set.
  const verdict = runGate(refund('refund Dan $30', 'Dan', '$99'), REFUND, store);

  assert.equal(verdict.verdict, 'block');
  assert.ok(verdict.verdict === 'block');
  assert.equal(verdict.code, 'amount_not_in_speech');
  assert.equal(dispositionFor(verdict.code), 'HOLD');
  assert.equal(verdict.detail['value'], '$99');
  assert.equal(verdict.detail['required'], 'transcript_span');
});

test('number-twin: a spoken amount is licensed by its transcript span and passes', () => {
  const store = refundStore();
  const verdict = runGate(refund('refund Dan $30', 'Dan', '$30'), REFUND, store);
  assert.equal(verdict.verdict, 'pass');
  assert.ok(verdict.verdict === 'pass');
  const amount = verdict.receipt.params['amount']!;
  const span = amount.sources.find((s) => s.kind === 'transcript_span')!;
  assert.equal(span.rank, 4);
});
