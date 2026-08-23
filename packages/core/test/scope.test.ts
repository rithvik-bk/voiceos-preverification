/* ─────────────────────── honest scope in code: registry · firewall · seam ─────────────────────
 *
 * Task 3: the reason-code registry is the authoritative PF_* list with dispositions; ASR-mishear
 *         is out of scope (no code exists for it); SCREEN/CONTENT can NEVER license routing.
 * Task 4: the transcript seam is clean — a transcript-present path (full checks) and a
 *         transcript-absent args-only path (degraded), and the receipt says which mode ran.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { REASON_CODES, dispositionFor, pfNameFor } from '../src/codes.ts';
import { MIN_RANK, RANK } from '../src/provenance.ts';
import { SEND_MESSAGE, runGate, type ToolCall } from '../src/gate.ts';
import { finalizeUtterance } from '../src/transcript.ts';
import { groundedStore, storeWithInjectedReferent } from './fixtures.ts';

/* ── the reason-code registry (Task 3) ── */

test('every reason code has a canonical PF_* name and a valid disposition', () => {
  const dispositions = new Set(['PASS', 'HOLD', 'BLOCK', 'SURFACE']);
  for (const [key, entry] of Object.entries(REASON_CODES)) {
    assert.equal(entry.code, key, `code field must match its key (${key})`);
    assert.ok(entry.pf.startsWith('PF_'), `${key} needs a PF_* alias`);
    assert.ok(dispositions.has(entry.disposition), `${key} has an invalid disposition`);
    assert.ok(entry.summary.length > 0, `${key} needs a summary`);
  }
});

test('the two firewall codes are the only BLOCK dispositions (injection is never a HOLD)', () => {
  const blocks = Object.values(REASON_CODES).filter((entry) => entry.disposition === 'BLOCK').map((entry) => entry.code).sort();
  assert.deepEqual(blocks, ['insufficient_provenance', 'provenance_mismatch']);
  // The injection firewall's canonical name is explicit about the cause.
  assert.equal(pfNameFor('provenance_mismatch'), 'PF_INJECTION_ROUTING_FROM_CONTENT');
});

test('ASR-mishear is out of scope: no reason code names the transcription/ASR class', () => {
  // Preflight grounds what was TRANSCRIBED; it never second-guesses the ear. No code may name the
  // ASR/transcription class. (target_not_found may say "misheard TARGET" — a name that grounds to
  // nothing, which IS caught — but nothing claims to catch a mis-transcribed VALUE like 79→99.)
  for (const entry of Object.values(REASON_CODES)) {
    const pf = entry.pf.toLowerCase();
    const haystack = `${entry.code} ${pf} ${entry.summary}`.toLowerCase();
    assert.ok(!pf.includes('asr') && !pf.includes('transcription') && !pf.includes('mishear'),
      `${entry.code} must not name the ASR class in its PF alias`);
    assert.ok(!haystack.includes('asr') && !haystack.includes('transcription'),
      `${entry.code} must not claim an ASR/transcription catch — that class is out of scope`);
  }
});

/* ── the injection firewall: SCREEN/CONTENT can NEVER license routing (Task 3) ── */

test('firewall (structural): routing minimum rank is above both screen and model-composed', () => {
  // The lattice makes it impossible for screen (1) or model_composed (0) to satisfy routing (3).
  assert.ok(RANK.screen < MIN_RANK.routing, 'screen must rank below the routing minimum');
  assert.ok(RANK.model_composed < MIN_RANK.routing, 'model output must rank below the routing minimum');
});

test('firewall (behavioral): a screen-sourced routing target is refused even if it resolves perfectly', () => {
  const store = groundedStore();
  store.rememberTargets([{ id: 'CSCRAPE', label: '#from-screen', kind: 'channel' }], { kind: 'screen' });
  const verdict = runGate(
    {
      tool: 'send_message',
      args: { target: 'from-screen', text: 'hello' },
      transcript: finalizeUtterance('u1', 'send hello to from screen'),
    },
    SEND_MESSAGE,
    store,
  );
  assert.equal(verdict.verdict, 'block');
  assert.ok(verdict.verdict === 'block');
  assert.equal(dispositionFor(verdict.code), 'BLOCK');
});

/* ── the transcript seam (Task 4): transcript-present vs args-only degraded ── */

test('transcript-present: all transcript-dependent checks ran (mode + checksRun)', () => {
  const store = groundedStore();
  const verdict = runGate(
    {
      tool: 'send_message',
      args: { target: 'eng backend', text: 'deploy is done' },
      transcript: finalizeUtterance('u1', 'send deploy is done to eng backend'),
    },
    SEND_MESSAGE,
    store,
  );
  assert.ok(verdict.verdict === 'pass');
  assert.equal(verdict.receipt.mode, 'transcript_present');
  assert.deepEqual(verdict.receipt.checksRun, {
    schema: true, ambiguity: true, injectionFirewall: true, numberTwin: true, misbinding: true,
  });
});

test('args-only degraded: schema + ambiguity run, but the firewall/number-twin/misbinding do NOT', () => {
  const store = groundedStore();
  // No transcript — the zero-mod subprocess sees only {name, arguments}.
  const call: ToolCall = { tool: 'send_message', args: { target: 'eng backend', text: 'deploy is done' } };
  const verdict = runGate(call, SEND_MESSAGE, store);
  assert.ok(verdict.verdict === 'pass');
  assert.equal(verdict.receipt.mode, 'args_only');
  assert.deepEqual(verdict.receipt.checksRun, {
    schema: true, ambiguity: true, injectionFirewall: false, numberTwin: false, misbinding: false,
  });
});

test('args-only HONESTY: an injection that BLOCKS with the transcript PASSES args-only (firewall cannot run)', () => {
  const store = storeWithInjectedReferent();
  const args = { target: 'evil@corp.com', text: "you're invited" };

  // With the transcript: the firewall fires (the address was never spoken).
  const withTranscript = runGate(
    { tool: 'send_message', args, transcript: finalizeUtterance('u1', 'read the latest message in general') },
    SEND_MESSAGE,
    store,
  );
  assert.equal(withTranscript.verdict, 'block');
  assert.ok(withTranscript.verdict === 'block');
  assert.equal(withTranscript.code, 'provenance_mismatch');

  // Args-only: the same call PASSES — we never claim to catch injection at zero-mod. The receipt
  // is the honest disclosure: injectionFirewall did not run.
  const argsOnly = runGate({ tool: 'send_message', args }, SEND_MESSAGE, store);
  assert.equal(argsOnly.verdict, 'pass');
  assert.ok(argsOnly.verdict === 'pass');
  assert.equal(argsOnly.receipt.mode, 'args_only');
  assert.equal(argsOnly.receipt.checksRun.injectionFirewall, false);
});

test('args-only still catches what args alone can prove: ambiguity against queryable state', () => {
  const store = groundedStore();
  // Two "Arav"s in the workspace — cardinality ≥ 2 needs no transcript to catch.
  const verdict = runGate({ tool: 'send_message', args: { target: 'arav', text: 'hi' } }, SEND_MESSAGE, store);
  assert.equal(verdict.verdict, 'block');
  assert.ok(verdict.verdict === 'block');
  assert.equal(verdict.code, 'ambiguous_target');
});
