/* ───────────────────────── the taint firewall: the invariant, in isolation ─────────────────────
 *
 * The proof-tree tests exercise taint end-to-end; these pin the invariant itself:
 *   THE INVARIANT — no tainted value reaches a routing sink.
 * plus label propagation and the conservative value normalization. The final `todo` names the ONE
 * residual honestly: an undeclared launder (a structured step that copies a tainted value into its
 * output without declaring `derivedFrom`) is a classifier-trust gap, not caught at this data layer.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PreflightBlock } from '../src/block.ts';
import { REFUND, SEND_MESSAGE, THREAD_REPLY, type ToolCall } from '../src/gate.ts';
import {
  TaintLedger,
  assertNoTaintedRoutingSink,
  normalizeValue,
  taintedRoutingSink,
} from '../src/taint.ts';

test('INVARIANT: a tainted value in a destination sink is a firewall BLOCK', () => {
  const ledger = new TaintLedger();
  ledger.taint(['scammer@evil.com']);
  const call: ToolCall = { tool: 'send_message', args: { target: 'scammer@evil.com', text: 'hi' } };

  const violation = taintedRoutingSink(call, SEND_MESSAGE, ledger);
  assert.deepEqual(violation, { param: 'target', slot: 'destination', value: 'scammer@evil.com' });

  assert.throws(
    () => assertNoTaintedRoutingSink(call, SEND_MESSAGE, ledger),
    (error: unknown) =>
      error instanceof PreflightBlock &&
      error.code === 'provenance_mismatch' &&
      error.detail.taint === true,
  );
});

test('INVARIANT: a tainted value is fine in a NON-sink routing target (thread/reply is a read-back, not a new destination)', () => {
  const ledger = new TaintLedger();
  ledger.taint(['C0THREAD']);
  // THREAD_REPLY.target has no slot → not a sink. Replying to a read message is legitimate.
  const call: ToolCall = { tool: 'thread_reply', args: { target: 'C0THREAD', text: 'ok' } };
  assert.equal(taintedRoutingSink(call, THREAD_REPLY, ledger), null);
  assert.doesNotThrow(() => assertNoTaintedRoutingSink(call, THREAD_REPLY, ledger));
});

test('INVARIANT: a tainted AMOUNT is also a sink violation (money is a routing sink too)', () => {
  const ledger = new TaintLedger();
  ledger.taint(['54.99']);
  const call: ToolCall = { tool: 'refund', args: { recipient: 'Dan', amount: '54.99' } };
  const violation = taintedRoutingSink(call, REFUND, ledger);
  assert.equal(violation?.slot, 'amount');
});

test('INVARIANT: a clean value passes the sink check untouched', () => {
  const ledger = new TaintLedger();
  ledger.taint(['someone-else@evil.com']);
  const call: ToolCall = { tool: 'send_message', args: { target: 'eng backend', text: 'hi' } };
  assert.equal(taintedRoutingSink(call, SEND_MESSAGE, ledger), null);
});

test('PROPAGATION: derive-from-tainted taints the produced values; a clean derivation stays clean', () => {
  const ledger = new TaintLedger();
  ledger.taint(['raw@evil.com']);

  assert.equal(ledger.propagate(['raw@evil.com'], ['launder@evil.com']), true);
  assert.equal(ledger.isTainted('launder@evil.com'), true);

  assert.equal(ledger.propagate(['a-clean-source'], ['a-clean-output']), false);
  assert.equal(ledger.isTainted('a-clean-output'), false);
});

test('PROPAGATION is transitive across hops (raw → mid → final all tainted)', () => {
  const ledger = new TaintLedger();
  ledger.taint(['raw']);
  ledger.propagate(['raw'], ['mid']);
  ledger.propagate(['mid'], ['final']);
  assert.deepEqual(ledger.snapshot(), ['final', 'mid', 'raw']);
});

test('normalizeValue: routing sigils and case do not let a tainted value slip past the check', () => {
  assert.equal(normalizeValue('  $54.99 '), '54.99');
  assert.equal(normalizeValue('#Eng-Backend'), 'eng-backend');
  const ledger = new TaintLedger();
  ledger.taint(['@Evil']);
  assert.equal(ledger.isTainted('evil'), true); // '@Evil' and 'evil' collapse to the same key
});

/*
 * HONEST RESIDUAL (never faked): taint follows the DECLARED derivedFrom edges. A structured step
 * that copies a tainted value into its output WITHOUT declaring derivedFrom — an undeclared launder
 * / confused-deputy — is not caught at this pure-data layer, because nothing links its output to the
 * tainted input. This is a classifier-trust gap (the step lied about its provenance), not a hole in
 * the invariant itself. Closing it needs value-level dataflow from the executor (out of the pre-
 * verification lane). Marked todo so the gap is visible, not papered over.
 */
test('TODO: undeclared launder (structured output copies a tainted value with no derivedFrom edge) is NOT caught here', { todo: true }, () => {
  const ledger = new TaintLedger();
  ledger.taint(['raw@evil.com']);
  // The step OUTPUTS the tainted address but declares no derivedFrom — so the ledger cannot know.
  ledger.propagate([], ['raw@evil.com-relabeled-clean']);
  assert.equal(ledger.isTainted('raw@evil.com-relabeled-clean'), true); // FAILS today: this is the residual
});
