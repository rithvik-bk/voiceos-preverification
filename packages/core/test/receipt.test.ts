/* ─────────────────────────── the PreflightReceipt emitter (the seam to Arav) ──────────────────
 *
 * SOLUTION.md §"HOW IT SLOTS IN": emit exactly `{interactionId, voiceSessionId, serverId,
 * toolName, args, verdict, routingParams:[{name,value,source,transcriptSpan?}],
 * contentParams:[{name,consentSurfaced}], transcriptSnapshot, firedAt}`. Pure function of the
 * gate result — no clock (firedAt is passed in), no I/O, no post-verification.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SEND_MESSAGE, runGate, type ToolCall } from '../src/gate.ts';
import { emitReceipt, type ReceiptMeta } from '../src/receipt.ts';
import { finalizeUtterance } from '../src/transcript.ts';
import { groundedStore, storeWithInjectedReferent } from './fixtures.ts';

const META: ReceiptMeta = {
  interactionId: 'int-1',
  voiceSessionId: 'vs-1',
  serverId: 'preflight-slack',
  firedAt: Date.UTC(2026, 7, 23, 12, 0, 0),
};

const EXPECTED_FIELDS = [
  'interactionId', 'voiceSessionId', 'serverId', 'toolName', 'args',
  'verdict', 'code', 'routingParams', 'contentParams', 'transcriptSnapshot', 'firedAt',
];

test('emitReceipt on a PASS: exact SOLUTION shape, routing param cites its transcript span', () => {
  const store = groundedStore();
  const call: ToolCall = {
    tool: 'send_message',
    args: { target: 'eng backend', text: 'deploy is done' },
    transcript: finalizeUtterance('u1', 'send deploy is done to eng backend'),
  };
  const verdict = runGate(call, SEND_MESSAGE, store);
  const receipt = emitReceipt(call, SEND_MESSAGE, verdict, META);

  assert.deepEqual(Object.keys(receipt).sort(), [...EXPECTED_FIELDS].sort());
  assert.equal(receipt.interactionId, 'int-1');
  assert.equal(receipt.voiceSessionId, 'vs-1');
  assert.equal(receipt.serverId, 'preflight-slack');
  assert.equal(receipt.toolName, 'send_message');
  assert.deepEqual(receipt.args, { target: 'eng backend', text: 'deploy is done' });
  assert.equal(receipt.verdict, 'PASS');
  assert.equal(receipt.code, '');
  assert.equal(receipt.transcriptSnapshot, 'send deploy is done to eng backend');
  assert.equal(receipt.firedAt, META.firedAt);

  assert.deepEqual(receipt.routingParams, [
    { name: 'target', value: 'eng backend', source: 'transcript_span', transcriptSpan: 'u1.w5+u1.w6' },
  ]);
  assert.deepEqual(receipt.contentParams, [{ name: 'text', consentSurfaced: true }]);
});

test('emitReceipt on a BLOCK: verdict is the disposition, code is the wire code, offending source named', () => {
  const store = storeWithInjectedReferent();
  const call: ToolCall = {
    tool: 'send_message',
    args: { target: 'evil@corp.com', text: "you're invited" },
    transcript: finalizeUtterance('u1', 'read the latest message in general'),
  };
  const verdict = runGate(call, SEND_MESSAGE, store);
  const receipt = emitReceipt(call, SEND_MESSAGE, verdict, META);

  assert.equal(receipt.verdict, 'BLOCK'); // provenance_mismatch → BLOCK (the injection firewall)
  assert.equal(receipt.code, 'provenance_mismatch');
  // No transcript span (that is precisely why it blocked); the source is the offending one.
  assert.deepEqual(receipt.routingParams, [
    { name: 'target', value: 'evil@corp.com', source: 'tool_output' },
  ]);
  assert.equal(receipt.routingParams[0]!.transcriptSpan, undefined);
  assert.deepEqual(receipt.contentParams, [{ name: 'text', consentSurfaced: true }]);
});

test('emitReceipt is a pure, deterministic function (same inputs → byte-identical receipt)', () => {
  const call: ToolCall = {
    tool: 'send_message',
    args: { target: 'eng backend', text: 'deploy is done' },
    transcript: finalizeUtterance('u1', 'send deploy is done to eng backend'),
  };
  const a = emitReceipt(call, SEND_MESSAGE, runGate(call, SEND_MESSAGE, groundedStore()), META);
  const b = emitReceipt(call, SEND_MESSAGE, runGate(call, SEND_MESSAGE, groundedStore()), META);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
