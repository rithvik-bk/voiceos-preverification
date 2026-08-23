/* ─────────────────────── tier-aware routing floor (AUDIT finding #2 / B38) ──────────────────────
 *
 * The fix: the lattice min-rank on a routing param is TIER-AWARE. A Tier-1 read is fail-open on
 * rank (S5.1/S19.2 — the safety on a read is that it RESOLVES to a real target, not that the
 * grounding source outranks a threshold), so a channel that only matches known_state at rank 2 is
 * a legitimate read target. This is the B38 false-block.
 *
 * THE FIREWALL MUST STAY INTACT. These tests are also the guard that the fix did NOT weaken the
 * Tier-3 destination/amount/permission rule: a body-sourced destination still BLOCKS
 * (provenance_mismatch), a too-low-rank Tier-3 destination still BLOCKS (insufficient_provenance),
 * and the amount number-twin still HOLDS.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GroundingStore } from '../src/grounding.ts';
import { minRankForRouting } from '../src/provenance.ts';
import type { Target } from '../src/resolve.ts';
import { SEND_MESSAGE, REFUND, runGate, type ToolCall, type ToolContract } from '../src/gate.ts';
import { finalizeUtterance } from '../src/transcript.ts';
import { storeWithInjectedReferent, INJECTED_ADDRESS, refundStore } from './fixtures.ts';

/* ── the B38 shape: a Tier-1 read whose channel matches known_state at rank 2 → PASS ── */

const READ_CHANNEL_HISTORY: ToolContract = {
  tool: 'read_channel_history',
  tier: 1,
  params: {
    // Tier-1 read: a plain routing param (no destination slot — S11.2 is a Tier-3 rule).
    channel: { class: 'routing', required: true },
  },
};

/** Known-state channels (rank 2), the way B38 grounds them — NOT read this session, just workspace state. */
function knownStateChannels(): GroundingStore {
  const store = new GroundingStore();
  const channels: Target[] = [
    { id: 'C_ENG', label: '#eng', kind: 'channel', aliases: ['eng'] },
    { id: 'C_DESIGN', label: '#design', kind: 'channel', aliases: ['design'] },
  ];
  store.rememberTargets(channels, { kind: 'known_state', tool: 'known_state' });
  return store;
}

test('(a) B38: a Tier-1 read resolving to a rank-2 known_state channel PASSES (no block, no card)', () => {
  const store = knownStateChannels();
  const call: ToolCall = {
    tool: 'read_channel_history',
    args: { channel: 'C_ENG' },
    transcript: finalizeUtterance('u1', 'what did i miss in eng'),
  };

  const verdict = runGate(call, READ_CHANNEL_HISTORY, store);

  assert.equal(verdict.verdict, 'pass', 'a Tier-1 read at rank 2 must auto-fire — gating a read is a budget violation');
  assert.ok(verdict.verdict === 'pass');
  const channel = verdict.receipt.params['channel']!;
  assert.equal(channel.resolved?.id, 'C_ENG');
  // The grounding source it passed on is the rank-2 known_state entry — proof the floor dropped for the read.
  const knownState = channel.sources.find((s) => s.kind === 'known_state');
  assert.ok(knownState !== undefined && knownState.rank === 2);
});

test('the same rank-2 grounding on a Tier-3 send STILL blocks (insufficient_provenance) — floor only drops for reads', () => {
  // Identical grounding (rank-2 known_state), but now the tool is a Tier-3 write. The floor is 3.
  const store = knownStateChannels();
  const call: ToolCall = {
    tool: 'send_message',
    args: { target: 'C_ENG', text: 'deploying now' },
    transcript: finalizeUtterance('u1', 'send deploying now to eng'),
  };

  const verdict = runGate(call, { ...SEND_MESSAGE, tool: 'send_message' }, store);

  assert.equal(verdict.verdict, 'block', 'a Tier-3 destination grounded only at rank 2 must not pass');
  assert.ok(verdict.verdict === 'block');
  // It is the rank floor that catches it (rank 2 < required 3), the crown-jewel BLOCK code.
  assert.equal(verdict.code, 'insufficient_provenance');
  assert.equal(verdict.detail['required_rank'], 3);
  assert.equal(verdict.detail['rank'], 2);
});

/* ── (b) FIREWALL INTACT: a Tier-3 destination sourced from read content STILL BLOCKS ── */

test('(b) firewall intact: a Tier-3 send to a body-sourced destination STILL blocks (provenance_mismatch)', () => {
  const store = storeWithInjectedReferent();
  const call: ToolCall = {
    tool: 'send_message',
    args: { target: 'evil@corp.com', text: "you're invited to standup" },
    transcript: finalizeUtterance('u1', 'read the latest message in general'),
  };

  const verdict = runGate(call, SEND_MESSAGE, store);

  assert.equal(verdict.verdict, 'block');
  assert.ok(verdict.verdict === 'block');
  assert.equal(verdict.code, 'provenance_mismatch');
  assert.equal(verdict.detail['found'], 'tool_output');
  assert.equal(verdict.detail['required'], 'transcript_span');
});

/* ── (c) FIREWALL INTACT: a Tier-3 destination at too-low rank STILL BLOCKS ── */

test('(c) firewall intact: a Tier-3 destination grounded only at rank 1 (screen) STILL blocks (insufficient_provenance)', () => {
  const store = new GroundingStore();
  // A destination that only ever appeared on screen (rank 1) — below the Tier-3 floor of 3.
  store.rememberTargets(
    [{ id: 'U0SCREEN', label: 'Screen Bob', kind: 'person', aliases: ['bob'] }],
    { kind: 'screen' },
  );
  const call: ToolCall = {
    tool: 'send_message',
    args: { target: 'bob', text: 'hi' },
    transcript: finalizeUtterance('u1', 'send hi to bob'),
  };

  const verdict = runGate(call, SEND_MESSAGE, store);

  assert.equal(verdict.verdict, 'block', 'a rank-1 screen source can never license a Tier-3 destination');
  assert.ok(verdict.verdict === 'block');
  assert.equal(verdict.code, 'insufficient_provenance');
  assert.equal(verdict.detail['rank'], 1);
  assert.equal(verdict.detail['required_rank'], 3);
});

/* ── (d) FIREWALL INTACT: the amount number-twin STILL HOLDS ── */

test('(d) firewall intact: a Tier-3 amount not in the spoken number-set STILL holds (amount_not_in_speech)', () => {
  const store = refundStore();
  const call: ToolCall = {
    tool: 'refund',
    // Spoken "$54.79"; model re-typed 54.99. The amount is not in the spoken number-set.
    args: { recipient: 'dan', amount: '54.99' },
    transcript: finalizeUtterance('u1', 'refund dan fifty four seventy nine'),
  };

  const verdict = runGate(call, REFUND, store);

  assert.equal(verdict.verdict, 'block', 'a fabricated amount must never pass, regardless of tier changes');
  assert.ok(verdict.verdict === 'block');
  assert.equal(verdict.code, 'amount_not_in_speech');
  assert.equal(verdict.detail['required'], 'transcript_span');
  assert.equal(verdict.detail['required_rank'], 4);
});

/* ── the pure function itself: the tier ladder is exactly as specified ── */

test('minRankForRouting: Tier-1 fail-open (0); Tier-2 and Tier-3 keep the rank-3 lattice floor', () => {
  assert.equal(minRankForRouting(1), 0);
  assert.equal(minRankForRouting(2), 3);
  assert.equal(minRankForRouting(3), 3);
});
