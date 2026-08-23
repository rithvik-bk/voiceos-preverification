/* Phase-2 walking-skeleton tests (KICKOFF Phase 2 contract):
 *   (a) a clean call passes and emits a receipt naming every param's source;
 *   (b) misheard-target drift is caught; the shadow log records would-have-blocked with the
 *       machine code, and NOTHING is enforced;
 *   (+) the min-rank lattice is real, not decorative: a screen-sourced (rank 1) target that
 *       resolves perfectly is still refused for a routing slot.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SEND_MESSAGE, runGate, type ToolCall } from '../src/gate.ts';
import { ShadowLog, shadowGate } from '../src/shadow.ts';
import { finalizeUtterance } from '../src/transcript.ts';
import { groundedStore } from './fixtures.ts';

const FROZEN_NOW = Date.UTC(2026, 7, 21, 17, 0, 0); // deterministic clock seam

function call(utterance: string, target: string, text: string): ToolCall {
  return {
    tool: 'send_message',
    args: { target, text },
    transcript: finalizeUtterance('u1', utterance),
  };
}

/* ────────────────── (a) clean call: pass + receipt naming every source ────────────────── */

test('clean call passes and the receipt names every parameter source', () => {
  const store = groundedStore();
  const verdict = runGate(
    call('send deploy is done to eng backend', 'eng backend', 'deploy is done'),
    SEND_MESSAGE,
    store,
  );

  assert.equal(verdict.verdict, 'pass');
  assert.ok(verdict.verdict === 'pass');
  const receipt = verdict.receipt;
  assert.equal(receipt.tool, 'send_message');
  assert.equal(receipt.utterance_id, 'u1');

  // EVERY declared param appears in the receipt with at least one source.
  for (const name of Object.keys(SEND_MESSAGE.params)) {
    const param = receipt.params[name];
    assert.ok(param !== undefined, `receipt missing param ${name}`);
    assert.ok(param.sources.length > 0, `param ${name} cites no source`);
  }

  // target: routing, rank-gated, resolved to the real channel, dual-sourced —
  // the transcript spans that spoke it (rank 4) + the read that grounded it (rank 3).
  const target = receipt.params['target']!;
  assert.equal(target.class, 'routing');
  assert.equal(target.disposition, 'rank_gated');
  assert.deepEqual(target.resolved, { id: 'C0ENGB', label: '#eng-backend', via: 'normalized' });
  const kinds = target.sources.map((source) => source.kind);
  assert.ok(kinds.includes('transcript_span'), 'target should cite the transcript span');
  assert.ok(kinds.includes('tool_output'), 'target should cite the grounding read');
  const toolOutput = target.sources.find((source) => source.kind === 'tool_output')!;
  assert.equal(toolOutput.tool, 'list_channels');
  assert.equal(toolOutput.rank, 3);
  const span = target.sources.find((source) => source.kind === 'transcript_span')!;
  assert.equal(span.rank, 4);
  assert.equal(span.span_id, 'u1.w5+u1.w6'); // "eng backend" = words 5..6 of the utterance
  assert.equal(typeof span.text_hash, 'string'); // span refs + hash, never raw text (§17)

  // text: content — consent-surfaced, never rank-gated, source honestly named.
  const text = receipt.params['text']!;
  assert.equal(text.class, 'content');
  assert.equal(text.disposition, 'consent_surfaced');
  assert.equal(text.sources[0]!.kind, 'transcript_span'); // the user spoke these words
});

/* ─────── (b) misheard target: caught, shadow-logged as would-have-blocked, unenforced ─────── */

test('misheard target is caught; shadow log records would_have_blocked with the machine code', () => {
  const store = groundedStore();
  const log = new ShadowLog({ now: () => FROZEN_NOW });

  // ASR heard "ing backend" — a name that does not exist in the workspace. The v3 eval's
  // misheard_target family (preflight-eval.mjs:172). The gate must not guess.
  const drifted = call('send deploy is done to ing backend', 'ing backend', 'deploy is done');

  let hostExecuted = 0;
  const outcome = shadowGate(drifted, SEND_MESSAGE, store, log);
  // Shadow contract (§19): the host proceeds regardless. Simulate the host doing exactly that.
  hostExecuted += 1;

  assert.equal(outcome.decision, 'would_have_blocked');
  assert.equal(outcome.enforced, false);
  assert.equal(hostExecuted, 1, 'shadow mode must not stop the host');

  assert.equal(log.records.length, 1);
  const record = log.records[0]!;
  assert.equal(record.mode, 'shadow');
  assert.equal(record.decision, 'would_have_blocked');
  assert.equal(record.code, 'target_not_found'); // the machine code, in the log
  assert.equal(record.tool, 'send_message');
  assert.equal(record.utterance_id, 'u1');
  assert.equal(record.at, FROZEN_NOW);

  // Ambiguity-as-data, ported: the miss carries the REAL near name — never a silent pick.
  const detail = record.detail as { query: string; candidates: Array<{ name: string }> };
  assert.equal(detail.query, 'ing backend');
  assert.ok(
    detail.candidates.some((candidate) => candidate.name === '#eng-backend'),
    'candidates should surface the plausible real channel',
  );

  // And the record is a founder-readable JSONL line.
  const line = log.toJsonl();
  assert.ok(line.includes('"would_have_blocked"') && line.includes('"target_not_found"'));
});

test('clean call in shadow mode logs would_have_passed with the receipt attached', () => {
  const store = groundedStore();
  const log = new ShadowLog({ now: () => FROZEN_NOW });
  const outcome = shadowGate(
    call('send deploy is done to eng backend', 'eng backend', 'deploy is done'),
    SEND_MESSAGE,
    store,
    log,
  );
  assert.equal(outcome.decision, 'would_have_passed');
  assert.equal(outcome.enforced, false);
  assert.equal(log.records[0]!.receipt?.params['target']?.resolved?.id, 'C0ENGB');
});

/* ───────────── the lattice is a type rule: rank-1 screen evidence cannot route ───────────── */

test('a perfectly-resolving screen-sourced target is refused for a routing slot (min-rank)', () => {
  const store = groundedStore();
  store.rememberTargets([{ id: 'CSCRAPE', label: '#from-screen', kind: 'channel' }], { kind: 'screen' });

  const verdict = runGate(
    call('send hello to from screen', 'from-screen', 'hello'),
    SEND_MESSAGE,
    store,
  );
  assert.equal(verdict.verdict, 'block');
  assert.ok(verdict.verdict === 'block');
  assert.equal(verdict.code, 'insufficient_provenance');
  assert.equal(verdict.detail['rank'], 1);
  assert.equal(verdict.detail['required_rank'], 3);
});

/* ────────────── structural required-field check still blocks (missing_parameter) ────────────── */

test('a blank required field blocks with missing_parameter', () => {
  const store = groundedStore();
  const verdict = runGate(call('send it', '', 'deploy is done'), SEND_MESSAGE, store);
  assert.equal(verdict.verdict, 'block');
  assert.ok(verdict.verdict === 'block');
  assert.equal(verdict.code, 'missing_parameter');
  assert.equal(verdict.detail['field'], 'target');
});
