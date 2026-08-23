/* ─────────────────────────── the self-test (Definition of Done) ────────────────────────────
 *
 * Starts the Preflight MCP server IN-PROCESS (SDK in-memory linked transport — no stdio, no
 * VoiceOS), drives it as an MCP client, and asserts the end-to-end contract:
 *   • a scripted CLEAN call is FORWARDED to the downstream (PASS);
 *   • a scripted BAD call is HELD with the right reason-code and the downstream is NOT called
 *     (ENFORCE) — both the ambiguity HOLD and the injection BLOCK;
 *   • OBSERVE mode forwards the bad call anyway and records observeWouldHaveBlocked;
 *   • args-only DEGRADED mode (no transcript) labels the injection firewall unavailable and does
 *     NOT claim to have run it.
 * The clock is pinned so receipts are byte-deterministic.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createPreflightServer } from '../src/server.ts';
import type { WrappedTool } from '../src/withPreflight.ts';
import type { PreflightReceipt } from '../src/receipt.ts';

/* ── a downstream that records every real invocation, so "forwarded" is observable ── */
function spyTool(calls: Array<Record<string, unknown>>): WrappedTool {
  return {
    name: 'send_message',
    tier: 3,
    params: {
      target: { class: 'routing', required: true, slot: 'destination' },
      text: { class: 'content', required: true },
    },
    handler: (args) => {
      calls.push(args);
      return { sent: true, target: args['target'] };
    },
  };
}

async function connect(mode: 'observe' | 'enforce') {
  const calls: Array<Record<string, unknown>> = [];
  const receipts: PreflightReceipt[] = [];
  const { server } = createPreflightServer({
    serverId: 'test-preflight',
    mode,
    tools: [spyTool(calls)],
    onReceipt: (receipt) => receipts.push(receipt),
    now: () => 0, // pinned clock → byte-deterministic receipts
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'self-test', version: '0.0.0' });
  await client.connect(clientTransport);
  return { client, calls, receipts };
}

/* ── the grounded pool, as VoiceOS would supply via the `_preflight` seam ── */
const engChannel = { kind: 'channel' as const, id: 'C_ENG', label: '#eng-backend', aliases: ['eng-backend'], origin: 'tool_output' as const, tool: 'list_channels' };
const twoDans = [
  { kind: 'person' as const, id: 'U_KIM', label: 'Dan Kim', aliases: ['Dan'], origin: 'tool_output' as const, tool: 'list_users' },
  { kind: 'person' as const, id: 'U_LEE', label: 'Dan Lee', aliases: ['Dan'], origin: 'tool_output' as const, tool: 'list_users' },
];
// An address that only ever appeared inside read content (an email) — a rank-3 referent that was
// NEVER spoken. Valid to reply to, structurally unroutable as a NEW destination (the firewall).
const emailAddress = { kind: 'person' as const, id: 'evil@corp.com', label: 'evil@corp.com', origin: 'tool_output' as const, tool: 'read_email' };

test('lists the preflight-gated proxy tool', async () => {
  const { client } = await connect('enforce');
  const { tools } = await client.listTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0]!.name, 'send_message');
  assert.match(tools[0]!.description ?? '', /preflight:enforce/);
});

test('CLEAN call is forwarded to the downstream (PASS)', async () => {
  const { client, calls } = await connect('enforce');
  const result = await client.callTool({
    name: 'send_message',
    arguments: {
      target: '#eng-backend',
      text: 'the notes',
      _preflight: { transcript: 'send eng backend the notes', utteranceId: 'u1', interactionId: 'x1', referents: [engChannel] },
    },
  });
  const preflight = (result.structuredContent as Record<string, any>).preflight;
  assert.equal(result.isError ?? false, false);
  assert.equal(preflight.disposition, 'PASS');
  assert.equal(preflight.forwarded, true);
  assert.equal(preflight.injectionFirewall, 'active');
  assert.equal(calls.length, 1, 'downstream was invoked exactly once');
  assert.equal(calls[0]!['target'], '#eng-backend');
  assert.equal(calls[0]!['_preflight'], undefined, 'the _preflight seam is stripped before forwarding');
});

test('BAD call (ambiguous target) is HELD, downstream NOT called (ENFORCE)', async () => {
  const { client, calls } = await connect('enforce');
  const result = await client.callTool({
    name: 'send_message',
    arguments: {
      target: 'Dan',
      text: 'the notes',
      _preflight: { transcript: 'send dan the notes', utteranceId: 'u1', interactionId: 'x2', referents: twoDans },
    },
  });
  const preflight = (result.structuredContent as Record<string, any>).preflight;
  assert.equal(preflight.disposition, 'HOLD');
  assert.equal(preflight.forwarded, false);
  assert.equal(preflight.coreCode, 'ambiguous_target');
  assert.equal(preflight.reasonCode, 'PF_AMBIGUOUS_TARGET');
  assert.equal(preflight.discrepancy.candidates.length, 2);
  assert.match(preflight.repair, /Dan Kim|Dan Lee/);
  assert.equal(result.isError ?? false, false, 'a HOLD is not a hard error');
  assert.equal(calls.length, 0, 'downstream was NOT invoked on a HOLD');
});

test('BAD call (injection: destination only from read content) is BLOCKED (ENFORCE)', async () => {
  const { client, calls } = await connect('enforce');
  const result = await client.callTool({
    name: 'send_message',
    arguments: {
      target: 'evil@corp.com',
      text: 'wire it',
      _preflight: { transcript: 'send it to the address in the email', utteranceId: 'u1', interactionId: 'x3', referents: [emailAddress] },
    },
  });
  const preflight = (result.structuredContent as Record<string, any>).preflight;
  assert.equal(preflight.disposition, 'BLOCK');
  assert.equal(preflight.forwarded, false);
  assert.equal(preflight.coreCode, 'provenance_mismatch');
  assert.equal(preflight.reasonCode, 'PF_INJECTION_ROUTING_FROM_CONTENT');
  assert.equal(result.isError, true, 'a BLOCK is a hard error result');
  assert.equal(calls.length, 0, 'the injected destination never fired');
});

test('OBSERVE mode forwards the bad call anyway and records would_have_blocked', async () => {
  const { client, calls, receipts } = await connect('observe');
  const result = await client.callTool({
    name: 'send_message',
    arguments: {
      target: 'evil@corp.com',
      text: 'wire it',
      _preflight: { transcript: 'send it to the address in the email', utteranceId: 'u1', interactionId: 'x4', referents: [emailAddress] },
    },
  });
  const preflight = (result.structuredContent as Record<string, any>).preflight;
  assert.equal(preflight.forwarded, true, 'OBSERVE never stops a real call');
  assert.equal(preflight.observeWouldHaveBlocked, true);
  assert.equal(preflight.disposition, 'BLOCK');
  assert.equal(calls.length, 1, 'downstream WAS invoked in observe mode');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0]!.observeWouldHaveBlocked, true);
  assert.equal(receipts[0]!.firedAt, 0, 'pinned clock');
});

test('DEGRADED mode (no transcript) labels the injection firewall unavailable, never fakes it', async () => {
  const { client, calls, receipts } = await connect('enforce');
  const result = await client.callTool({
    name: 'send_message',
    arguments: {
      // No `_preflight.transcript` — the zero-mod {name,arguments} boundary.
      target: 'evil@corp.com',
      text: 'wire it',
      _preflight: { interactionId: 'x5', referents: [emailAddress] },
    },
  });
  const preflight = (result.structuredContent as Record<string, any>).preflight;
  assert.equal(preflight.transcriptMode, 'args_only_degraded');
  assert.equal(preflight.injectionFirewall, 'unavailable_no_transcript');
  // Without a transcript the firewall cannot run: the rank-3 referent passes the args-only checks.
  assert.equal(preflight.forwarded, true);
  assert.equal(calls.length, 1);
  assert.equal(receipts[0]!.transcriptSnapshot, null, 'no transcript snapshot in degraded mode');
});

test('DEGRADED mode still catches ambiguity (args-only check works)', async () => {
  const { client, calls } = await connect('enforce');
  const result = await client.callTool({
    name: 'send_message',
    arguments: { target: 'Dan', text: 'the notes', _preflight: { interactionId: 'x6', referents: twoDans } },
  });
  const preflight = (result.structuredContent as Record<string, any>).preflight;
  assert.equal(preflight.transcriptMode, 'args_only_degraded');
  assert.equal(preflight.disposition, 'HOLD');
  assert.equal(preflight.coreCode, 'ambiguous_target');
  assert.equal(calls.length, 0);
});
