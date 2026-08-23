/* ─────────────────────── proof-tree composition + autonomy dial (the new layer) ────────────────
 *
 * The six locked scenarios (AUTONOMY-BUILD-SPEC): (1) email the top lead you FOUND → PASS via a
 * surfaced structured prior-step output; (2) read the billing email and PAY it → BLOCK (content-
 * tainted value into a destination sink); (3) taint propagation across ≥2 hops; (4) poison — a
 * step after a held step is deferred; (5) a clean 4-step plan all green; (6) the autonomy policy
 * table at L1 vs L3. All reuse the built single-step gate; no gate logic is re-implemented.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SEND_MESSAGE, THREAD_REPLY, REFUND, type ToolContract } from '../src/gate.ts';
import { verifyPlan } from '../src/compose.ts';
import { actionFor, metaFor, type AutonomyLevel } from '../src/autonomy.ts';
import { finalizeUtterance } from '../src/transcript.ts';
import type { Plan } from '../src/plan.ts';
import type { Target } from '../src/resolve.ts';
import { groundedStore, refundStore } from './fixtures.ts';

/* A lead a search tool RETURNS as structured data — its label IS its address (a person target). */
const LEAD: Target = { id: 'lead@acme.com', label: 'lead@acme.com', kind: 'person' };

/* Read/search tool contracts: content-only, no routing sink — they pass and produce outputs. */
const SEARCH_LEADS: ToolContract = { tool: 'search_leads', tier: 1, params: { query: { class: 'content' } } };
const READ_EMAIL: ToolContract = { tool: 'read_email', tier: 1, params: { mailbox: { class: 'content' } } };
const EXTRACT_ADDRESS: ToolContract = { tool: 'extract_address', tier: 1, params: { source: { class: 'content' } } };

/* ── (1) "email the top lead you found" — surfaced structured output licenses a later destination ── */

test('COMPOSITION: email the top lead you FOUND → PASS (prior surfaced structured output licenses the destination)', () => {
  const plan: Plan = {
    steps: [
      {
        id: 's1',
        contract: SEARCH_LEADS,
        dependsOn: [],
        call: { tool: 'search_leads', args: { query: 'top lead' }, transcript: finalizeUtterance('u1', 'find the top lead') },
        output: { kind: 'structured', surfaced: true, provides: [LEAD], values: ['lead@acme.com'] },
      },
      {
        id: 's2',
        contract: SEND_MESSAGE,
        dependsOn: ['s1'],
        // The user NEVER spoke the address — only "the top lead you found".
        call: { tool: 'send_message', args: { target: 'lead@acme.com', text: 'hi there' }, transcript: finalizeUtterance('u2', 'email the top lead you found') },
      },
    ],
  };

  const tree = verifyPlan(plan, groundedStore());
  assert.deepEqual(tree.summary, { steps: 2, green: 2, held: 0, blocked: 0, deferred: 0 });
  const send = tree.nodes.find((n) => n.id === 's2')!;
  assert.equal(send.verdict, 'pass');
  assert.deepEqual(send.licensedBy, [{ stepId: 's1', kind: 'prior_step', surfaced: true }]);
});

test('COMPOSITION control: an UNSURFACED structured output does NOT license a destination → the send BLOCKS', () => {
  const plan: Plan = {
    steps: [
      {
        id: 's1',
        contract: SEARCH_LEADS,
        dependsOn: [],
        call: { tool: 'search_leads', args: { query: 'top lead' }, transcript: finalizeUtterance('u1', 'find the top lead') },
        output: { kind: 'structured', surfaced: false, provides: [LEAD], values: ['lead@acme.com'] },
      },
      {
        id: 's2',
        contract: SEND_MESSAGE,
        dependsOn: ['s1'],
        call: { tool: 'send_message', args: { target: 'lead@acme.com', text: 'hi there' }, transcript: finalizeUtterance('u2', 'email the top lead you found') },
      },
    ],
  };
  const tree = verifyPlan(plan, groundedStore());
  const send = tree.nodes.find((n) => n.id === 's2')!;
  // Not surfaced ⇒ never admitted to the licensing pool ⇒ the address is ungrounded here.
  assert.equal(send.verdict, 'hold'); // target_not_found (never read back to the user)
  assert.equal(send.block?.code, 'target_not_found');
  assert.equal(send.licensedBy, undefined);
});

/* ── (2) "read the billing email and pay it" — content-tainted value into a destination sink ── */

test('TAINT: read the billing email and PAY it → BLOCK (content-read address cannot reach a destination sink)', () => {
  const plan: Plan = {
    steps: [
      {
        id: 's1',
        contract: READ_EMAIL,
        dependsOn: [],
        call: { tool: 'read_email', args: { mailbox: 'billing' }, transcript: finalizeUtterance('u1', 'read the billing email') },
        output: { kind: 'content_read', values: ['scammer@evil.com'] },
      },
      {
        id: 's2',
        contract: REFUND,
        dependsOn: ['s1'],
        call: { tool: 'refund', args: { recipient: 'scammer@evil.com', amount: '54.79' }, transcript: finalizeUtterance('u2', 'pay the billing email fifty four seventy nine') },
      },
    ],
  };

  const tree = verifyPlan(plan, refundStore());
  assert.deepEqual(tree.summary, { steps: 2, green: 1, held: 0, blocked: 1, deferred: 0 });
  const pay = tree.nodes.find((n) => n.id === 's2')!;
  assert.equal(pay.verdict, 'block');
  assert.equal(pay.block?.code, 'provenance_mismatch'); // the firewall — same code, discovered across steps
  assert.equal(pay.block?.detail.taint, true);
  assert.equal(pay.block?.detail.param, 'recipient');
});

/* ── (3) taint propagation across ≥2 hops: read → extract → pay ── */

test('TAINT PROPAGATION (≥2 hops): read→extract→pay blocks; a structured step derived from tainted data stays tainted', () => {
  const LAUNDERED: Target = { id: 'launder@evil.com', label: 'launder@evil.com', kind: 'person' };
  const plan: Plan = {
    steps: [
      {
        id: 's1',
        contract: READ_EMAIL,
        dependsOn: [],
        call: { tool: 'read_email', args: { mailbox: 'billing' }, transcript: finalizeUtterance('u1', 'read the billing email') },
        output: { kind: 'content_read', values: ['raw@evil.com'] },
      },
      {
        id: 's2',
        contract: EXTRACT_ADDRESS,
        dependsOn: ['s1'],
        // A "structured" tool — but its output is DERIVED from the tainted read, so taint propagates.
        call: { tool: 'extract_address', args: { source: 'the email body' }, transcript: finalizeUtterance('u2', 'extract the address') },
        output: { kind: 'structured', surfaced: true, provides: [LAUNDERED], values: ['launder@evil.com'], derivedFrom: ['raw@evil.com'] },
      },
      {
        id: 's3',
        contract: REFUND,
        dependsOn: ['s2'],
        call: { tool: 'refund', args: { recipient: 'launder@evil.com', amount: '54.79' }, transcript: finalizeUtterance('u3', 'pay it fifty four seventy nine') },
      },
    ],
  };

  const tree = verifyPlan(plan, refundStore());
  assert.deepEqual(tree.summary, { steps: 3, green: 2, held: 0, blocked: 1, deferred: 0 });
  const extract = tree.nodes.find((n) => n.id === 's2')!;
  assert.equal(extract.verdict, 'pass'); // reading/extracting is fine
  const pay = tree.nodes.find((n) => n.id === 's3')!;
  assert.equal(pay.verdict, 'block'); // taint rode 2 hops — the "surfaced" flag can't launder it
  assert.equal(pay.block?.detail.taint, true);
  assert.equal(pay.licensedBy, undefined); // the tainted structured output was NEVER admitted to licensing
});

/* ── (4) poison: a step after a held step is deferred, and the hole propagates ── */

test('POISON: the step after a HELD step is deferred, and deferral propagates downstream', () => {
  const plan: Plan = {
    steps: [
      {
        id: 's1',
        contract: SEND_MESSAGE,
        dependsOn: [],
        // "Arav" is ambiguous (Arav Patel vs Arav Kumar) → HOLD.
        call: { tool: 'send_message', args: { target: 'Arav', text: 'hi' }, transcript: finalizeUtterance('u1', 'message Arav hi') },
      },
      {
        id: 's2',
        contract: SEND_MESSAGE,
        dependsOn: ['s1'],
        call: { tool: 'send_message', args: { target: 'eng backend', text: 'ok' }, transcript: finalizeUtterance('u2', 'send ok to eng backend') },
      },
      {
        id: 's3',
        contract: SEND_MESSAGE,
        dependsOn: ['s2'],
        call: { tool: 'send_message', args: { target: 'general', text: 'done' }, transcript: finalizeUtterance('u3', 'send done to general') },
      },
    ],
  };

  const tree = verifyPlan(plan, groundedStore());
  assert.deepEqual(tree.summary, { steps: 3, green: 0, held: 1, blocked: 0, deferred: 2 });
  assert.equal(tree.nodes.find((n) => n.id === 's1')!.verdict, 'hold');
  assert.equal(tree.nodes.find((n) => n.id === 's2')!.verdict, 'deferred'); // depends on a hole
  assert.equal(tree.nodes.find((n) => n.id === 's3')!.verdict, 'deferred'); // hole propagates
  // A deferred node never ran the gate: no receipt, no block.
  assert.equal(tree.nodes.find((n) => n.id === 's2')!.receipt, undefined);
});

/* ── (5) a clean 4-step plan, all green ── */

test('CLEAN 4-STEP PLAN: all green (spoken send, composed send, read-referent reply, all pass)', () => {
  const plan: Plan = {
    steps: [
      {
        id: 's1',
        contract: SEARCH_LEADS,
        dependsOn: [],
        call: { tool: 'search_leads', args: { query: 'top lead' }, transcript: finalizeUtterance('u1', 'find the top lead') },
        output: { kind: 'structured', surfaced: true, provides: [LEAD], values: ['lead@acme.com'] },
      },
      {
        id: 's2',
        contract: SEND_MESSAGE,
        dependsOn: [],
        call: { tool: 'send_message', args: { target: 'eng backend', text: 'deploy done' }, transcript: finalizeUtterance('u2', 'send deploy done to eng backend') },
      },
      {
        id: 's3',
        contract: SEND_MESSAGE,
        dependsOn: ['s1'],
        call: { tool: 'send_message', args: { target: 'lead@acme.com', text: 'welcome' }, transcript: finalizeUtterance('u3', 'email the top lead you found') },
      },
      {
        id: 's4',
        contract: THREAD_REPLY,
        dependsOn: [],
        call: { tool: 'thread_reply', args: { target: 'general', text: 'report attached' }, transcript: finalizeUtterance('u4', 'reply report attached to general') },
      },
    ],
  };

  const tree = verifyPlan(plan, groundedStore());
  assert.deepEqual(tree.summary, { steps: 4, green: 4, held: 0, blocked: 0, deferred: 0 });
  assert.ok(tree.nodes.every((n) => n.verdict === 'pass'));
  assert.ok(tree.nodes.every((n) => n.receipt !== undefined));
});

/* ── (6) the autonomy policy table: L1 vs L3, plus the dial core (L0) and the safety floor ── */

test('AUTONOMY: the dial core — L0 confirms even clean passes, L1 auto-runs them', () => {
  assert.equal(actionFor(0, 'pass'), 'hold'); // confirm-all
  assert.equal(actionFor(1, 'pass'), 'auto_run'); // hold-flagged
});

test('AUTONOMY: L1 vs L3 — per-node policy is IDENTICAL (raising autonomy never weakens safety)', () => {
  for (const verdict of ['pass', 'hold', 'block', 'deferred'] as const) {
    assert.equal(
      actionFor(1, verdict),
      actionFor(3, verdict),
      `L1 and L3 must agree on '${verdict}': the dial cannot turn a stop into a fire`,
    );
  }
  // The safety floor is level-invariant at EVERY level: a block is never auto-run, a hold always asks.
  for (const level of [0, 1, 2, 3] as const) {
    assert.equal(actionFor(level as AutonomyLevel, 'block'), 'block');
    assert.equal(actionFor(level as AutonomyLevel, 'hold'), 'hold');
  }
  // Where L1..L3 actually differ is the plan-level meta, not the per-node action.
  assert.equal(metaFor(2).requiresPlanApproval, true);
  assert.equal(metaFor(2).emitsReceipt, false);
  assert.equal(metaFor(3).requiresPlanApproval, false);
  assert.equal(metaFor(3).emitsReceipt, true); // full-auto leaves the audit trail
  assert.equal(metaFor(0).confirmAll, true);
});

test('AUTONOMY over a real tree: the clean 4-step plan auto-runs at L1/L3 but holds every step at L0', () => {
  const plan: Plan = {
    steps: [
      { id: 's2', contract: SEND_MESSAGE, dependsOn: [], call: { tool: 'send_message', args: { target: 'eng backend', text: 'x' }, transcript: finalizeUtterance('u2', 'send x to eng backend') } },
      { id: 's4', contract: THREAD_REPLY, dependsOn: [], call: { tool: 'thread_reply', args: { target: 'general', text: 'y' }, transcript: finalizeUtterance('u4', 'reply y to general') } },
    ],
  };
  const tree = verifyPlan(plan, groundedStore());
  assert.ok(tree.nodes.every((n) => n.verdict === 'pass'));
  assert.ok(tree.nodes.every((n) => actionFor(1, n.verdict) === 'auto_run'));
  assert.ok(tree.nodes.every((n) => actionFor(3, n.verdict) === 'auto_run'));
  assert.ok(tree.nodes.every((n) => actionFor(0, n.verdict) === 'hold'));
});
