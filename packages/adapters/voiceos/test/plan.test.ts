/* ─────────────────────── plan verification (the trust runtime, adapter side) ───────────────
 *
 * The adapter's multi-step twin of the single-call gate. Asserts the drop-in contract for whole
 * PLANS: the library `verifyPlan` delegates to core and returns a proof-tree; the per-step runtime
 * gate applies the autonomy dial + emits a receipt per step; and the same runs through the MCP
 * `verify_plan` tool over the in-memory transport (as VoiceOS would call it). Three flagship
 * scenarios per the task: a clean plan all-green, "email the lead you found" PASS, "pay the email
 * address" BLOCK. The clock is pinned so receipts are byte-deterministic.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { verifyPlan, type AdapterPlan } from '../src/plan.ts';
import { runPlan, type PlanStepReceipt } from '../src/runtime.ts';
import { createPreflightServer } from '../src/server.ts';

/* ── tool specs (the §20 annotation seed) ── */
const SEND = { name: 'send_message', tier: 3, params: { target: { class: 'routing', required: true, slot: 'destination' }, text: { class: 'content', required: true } } };
const SEARCH = { name: 'search_leads', tier: 1, params: { query: { class: 'content' } } };
const READ = { name: 'read_email', tier: 1, params: { mailbox: { class: 'content' } } };
const REFUND_TOOL = { name: 'refund', tier: 3, params: { recipient: { class: 'routing', required: true, slot: 'destination' }, amount: { class: 'routing', required: true, slot: 'amount' } } };

/* ── grounded pool a VoiceOS session would supply as `state.referents` ── */
const engChannel = { kind: 'channel', id: 'C_ENG', label: '#eng-backend', aliases: ['eng-backend'], origin: 'tool_output', tool: 'list_channels' };

/* A lead a search tool RETURNS as structured data — its label IS its address. */
const LEAD = { id: 'lead@acme.com', label: 'lead@acme.com', kind: 'person' };

/* ────────────────────────────── (A) library verifyPlan ────────────────────────────────────── */

test('CLEAN plan → all green (a search that passes, then a SPOKEN send to a grounded channel)', () => {
  const plan: AdapterPlan = {
    steps: [
      { id: 's1', tool: SEARCH, args: { query: 'top lead' }, transcript: 'find the top lead' },
      { id: 's2', tool: SEND, args: { target: '#eng-backend', text: 'the notes' }, transcript: 'send eng backend the notes', dependsOn: ['s1'] },
    ],
  };
  const tree = verifyPlan(plan, undefined, { referents: [engChannel] });
  assert.deepEqual(tree.summary, { steps: 2, green: 2, held: 0, blocked: 0, deferred: 0 });
  assert.equal(tree.nodes.find((n) => n.id === 's2').verdict, 'pass');
});

test('COMPOSITION: email the top lead you FOUND → PASS (surfaced structured output licenses the destination)', () => {
  const plan: AdapterPlan = {
    steps: [
      {
        id: 's1',
        tool: SEARCH,
        args: { query: 'top lead' },
        transcript: 'find the top lead',
        output: { kind: 'structured', surfaced: true, provides: [LEAD], values: ['lead@acme.com'] },
      },
      {
        // the user NEVER spoke the address — only "the top lead you found".
        id: 's2',
        tool: SEND,
        args: { target: 'lead@acme.com', text: 'hi there' },
        transcript: 'email the top lead you found',
        dependsOn: ['s1'],
      },
    ],
  };
  const tree = verifyPlan(plan, undefined, { referents: [] });
  assert.deepEqual(tree.summary, { steps: 2, green: 2, held: 0, blocked: 0, deferred: 0 });
  const send = tree.nodes.find((n) => n.id === 's2');
  assert.equal(send.verdict, 'pass');
  assert.deepEqual(send.licensedBy, [{ stepId: 's1', kind: 'prior_step', surfaced: true }]);
});

test('COMPOSITION control: UNSURFACED structured output does NOT license the destination', () => {
  const plan: AdapterPlan = {
    steps: [
      { id: 's1', tool: SEARCH, args: { query: 'top lead' }, transcript: 'find the top lead', output: { kind: 'structured', surfaced: false, provides: [LEAD], values: ['lead@acme.com'] } },
      { id: 's2', tool: SEND, args: { target: 'lead@acme.com', text: 'hi there' }, transcript: 'email the top lead you found', dependsOn: ['s1'] },
    ],
  };
  const tree = verifyPlan(plan, undefined, { referents: [] });
  const send = tree.nodes.find((n) => n.id === 's2');
  assert.equal(send.verdict, 'hold');
  assert.equal(send.block?.code, 'target_not_found');
});

test('TAINT: read the billing email and PAY it → BLOCK (content-read address cannot reach a destination sink)', () => {
  const plan: AdapterPlan = {
    steps: [
      { id: 's1', tool: READ, args: { mailbox: 'billing' }, transcript: 'read the billing email', output: { kind: 'content_read', values: ['scammer@evil.com'] } },
      { id: 's2', tool: REFUND_TOOL, args: { recipient: 'scammer@evil.com', amount: '54.79' }, transcript: 'pay the billing email fifty four seventy nine', dependsOn: ['s1'] },
    ],
  };
  const tree = verifyPlan(plan, undefined, { referents: [] });
  assert.deepEqual(tree.summary, { steps: 2, green: 1, held: 0, blocked: 1, deferred: 0 });
  const pay = tree.nodes.find((n) => n.id === 's2');
  assert.equal(pay.verdict, 'block');
  assert.equal(pay.block?.code, 'provenance_mismatch'); // the firewall, discovered across steps
  assert.equal(pay.block?.detail.taint, true);
  assert.equal(pay.block?.detail.param, 'recipient');
});

test('POISON: a step depending on a blocked step is DEFERRED (no green downstream of a hole)', () => {
  const plan: AdapterPlan = {
    steps: [
      { id: 's1', tool: READ, args: { mailbox: 'billing' }, transcript: 'read the billing email', output: { kind: 'content_read', values: ['scammer@evil.com'] } },
      { id: 's2', tool: REFUND_TOOL, args: { recipient: 'scammer@evil.com', amount: '54.79' }, transcript: 'pay it', dependsOn: ['s1'] },
      { id: 's3', tool: SEND, args: { target: '#eng-backend', text: 'done' }, transcript: 'tell eng backend done', dependsOn: ['s2'] },
    ],
  };
  const tree = verifyPlan(plan, undefined, { referents: [engChannel] });
  assert.equal(tree.nodes.find((n) => n.id === 's2').verdict, 'block');
  assert.equal(tree.nodes.find((n) => n.id === 's3').verdict, 'deferred');
});

/* ────────────────────────────── (B) per-step runtime gate ─────────────────────────────────── */

test('RUNTIME (L1 enforce): green steps auto_run and fire; receipts emitted per step', async () => {
  const plan: AdapterPlan = {
    steps: [
      { id: 's1', tool: SEARCH, args: { query: 'top lead' }, transcript: 'find the top lead', output: { kind: 'structured', surfaced: true, provides: [LEAD], values: ['lead@acme.com'] } },
      { id: 's2', tool: SEND, args: { target: 'lead@acme.com', text: 'hi' }, transcript: 'email the top lead you found', dependsOn: ['s1'] },
    ],
  };
  const tree = verifyPlan(plan, undefined, { referents: [] });
  const receipts: PlanStepReceipt[] = [];
  const argsByStep = { s1: plan.steps[0].args, s2: plan.steps[1].args };
  const result = await runPlan(tree, argsByStep, { level: 1, mode: 'enforce', now: () => 0, onReceipt: (r) => receipts.push(r) });
  assert.equal(receipts.length, 2, 'one receipt per step');
  for (const d of result.decisions) {
    assert.equal(d.action, 'auto_run');
    assert.equal(d.ran, true);
  }
  // the composed licensing rides into the receipt seam
  assert.deepEqual(receipts.find((r) => r.stepId === 's2').licensedBy, [{ stepId: 's1', kind: 'prior_step', surfaced: true }]);
});

test('RUNTIME (L0 confirm-all): even a clean pass becomes a HOLD (dial safety floor)', async () => {
  const plan: AdapterPlan = { steps: [{ id: 's1', tool: SEND, args: { target: '#eng-backend', text: 'hi' }, transcript: 'send eng backend hi' }] };
  const tree = verifyPlan(plan, undefined, { referents: [engChannel] });
  const result = await runPlan(tree, { s1: plan.steps[0].args }, { level: 0, mode: 'enforce', now: () => 0 });
  assert.equal(tree.nodes[0].verdict, 'pass');
  assert.equal(result.decisions[0].action, 'hold');
  assert.equal(result.decisions[0].ran, false, 'L0 holds even a grounded pass');
});

test('RUNTIME (observe): a would-block step is forwarded (shadow) but labeled observeWouldBlock', async () => {
  const plan: AdapterPlan = {
    steps: [
      { id: 's1', tool: READ, args: { mailbox: 'billing' }, transcript: 'read the billing email', output: { kind: 'content_read', values: ['scammer@evil.com'] } },
      { id: 's2', tool: REFUND_TOOL, args: { recipient: 'scammer@evil.com', amount: '54.79' }, transcript: 'pay it', dependsOn: ['s1'] },
    ],
  };
  const tree = verifyPlan(plan, undefined, { referents: [] });
  const result = await runPlan(tree, { s1: plan.steps[0].args, s2: plan.steps[1].args }, { level: 3, mode: 'observe', now: () => 0 });
  const pay = result.decisions.find((d) => d.stepId === 's2');
  assert.equal(pay.action, 'block');
  assert.equal(pay.ran, true, 'observe never withholds a real call');
  assert.equal(pay.receipt.observeWouldBlock, true);
  assert.equal(pay.receipt.coreCode, 'provenance_mismatch');
});

/* ────────────────────────────── (C) the verify_plan MCP tool ──────────────────────────────── */

async function connectPlanServer() {
  const { server } = createPreflightServer({ serverId: 'test-plan', mode: 'enforce', tools: [], exposePlanVerification: true, now: () => 0 });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'plan-self-test', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

test('MCP: verify_plan is listed only when exposed', async () => {
  const client = await connectPlanServer();
  const { tools } = await client.listTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'verify_plan');
});

test('MCP: verify_plan over the wire → the pay-the-email plan is BLOCKED (isError, blocked=1)', async () => {
  const client = await connectPlanServer();
  const plan: AdapterPlan = {
    steps: [
      { id: 's1', tool: READ, args: { mailbox: 'billing' }, transcript: 'read the billing email', output: { kind: 'content_read', values: ['scammer@evil.com'] } },
      { id: 's2', tool: REFUND_TOOL, args: { recipient: 'scammer@evil.com', amount: '54.79' }, transcript: 'pay it', dependsOn: ['s1'] },
    ],
  };
  const result = await client.callTool({ name: 'verify_plan', arguments: { plan, state: { referents: [] }, run: { level: 3, mode: 'enforce' } } });
  const sc = result.structuredContent;
  assert.equal(result.isError, true);
  assert.deepEqual(sc.tree.summary, { steps: 2, green: 1, held: 0, blocked: 1, deferred: 0 });
  assert.equal(sc.run.decisions.find((d) => d.stepId === 's2').action, 'block');
});

test('MCP: verify_plan over the wire → email-the-lead PASSES all green', async () => {
  const client = await connectPlanServer();
  const plan: AdapterPlan = {
    steps: [
      { id: 's1', tool: SEARCH, args: { query: 'top lead' }, transcript: 'find the top lead', output: { kind: 'structured', surfaced: true, provides: [LEAD], values: ['lead@acme.com'] } },
      { id: 's2', tool: SEND, args: { target: 'lead@acme.com', text: 'hi there' }, transcript: 'email the top lead you found', dependsOn: ['s1'] },
    ],
  };
  const result = await client.callTool({ name: 'verify_plan', arguments: { plan, state: { referents: [] } } });
  const sc = result.structuredContent;
  assert.equal(result.isError ?? false, false);
  assert.deepEqual(sc.tree.summary, { steps: 2, green: 2, held: 0, blocked: 0, deferred: 0 });
});
