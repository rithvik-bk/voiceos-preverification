/* Runner + report tests. The two invariants with a VETO behind them:
 *   1. per-corpus numbers only — no code path produces a blended catch/false-block number;
 *   2. no case is ever silently dropped — results.length === cases.length, and every
 *      not-runnable case names at least one missing capability. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { loadCorpus, runCorpus } from '../src/runner.ts';
import { buildArtifact, renderTable, artifactFileName } from '../src/report.ts';
import type { Corpus, CorpusCase } from '../src/schema.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

const channelRead = (name: string, id: string) => ({
  referent_id: `r_${id}`,
  tool: 'list_channels',
  ts: '2026-08-21T16:40:00-07:00',
  structural: { type: 'channel', name, channel_id: id },
  free_text: null,
});

function miniCorpus(): Corpus {
  const cases: CorpusCase[] = [
    {
      // gate passes, expected PASS → pass_ok
      id: 'M1',
      transcript: { tokens: ['send', 'hi', 'to', 'eng', 'backend'] },
      prior_tool_outputs: [channelRead('eng-backend', 'C0ENGB')],
      proposed_call: { tool: 'send_message', tier: 3, params: { channel: 'eng backend', text: 'hi' } },
      expected: { verdict: 'PASS' },
    },
    {
      // known-state grounding rank 2 → insufficient_provenance, expected PASS → false_block
      id: 'M2',
      transcript: { tokens: ['whats', 'new', 'in', 'eng'] },
      known_state: { workspace_channels: [{ name: 'eng', channel_id: 'C_ENG' }] },
      proposed_call: { tool: 'read_channel_history', tier: 1, params: { channel: 'C_ENG', limit: 5 } },
      expected: { verdict: 'PASS' },
    },
    {
      // nothing grounds the target → target_not_found, expected BLOCK → catch (+code match)
      id: 'M3',
      transcript: { tokens: ['send', 'hi', 'to', 'the', 'team'] },
      prior_tool_outputs: [channelRead('general', 'C0GEN')],
      proposed_call: { tool: 'send_message', tier: 3, params: { channel: 'C_TRIAGE', text: 'hi' } },
      expected: { verdict: 'BLOCK', code: 'target_not_found' },
    },
    {
      // spoken + grounded → gate passes, but expected BLOCK → miss
      id: 'M4',
      transcript: { tokens: ['send', 'hi', 'to', 'eng', 'backend'] },
      prior_tool_outputs: [channelRead('eng-backend', 'C0ENGB')],
      proposed_call: { tool: 'send_message', tier: 3, params: { channel: 'eng backend', text: 'hi' } },
      expected: { verdict: 'BLOCK', code: 'imaginary_code' },
    },
    {
      // CARD-expected → not runnable, capability named
      id: 'M5',
      transcript: { tokens: ['remind', 'me', 'in', 'five'] },
      proposed_call: { tool: 'schedule_reminder', tier: 2, params: { delay_s: 300, text: 'r' } },
      expected: { verdict: 'CARD', card_question: 'minutes or hours?' },
    },
  ];
  return { meta: { name: 'mini' }, cases };
}

test('runner scores catch / miss / pass_ok / false_block / not_runnable correctly', () => {
  const run = runCorpus(miniCorpus());
  assert.equal(run.results.length, 5, 'no case may be dropped');
  const status = Object.fromEntries(run.results.map((r) => [r.id, r.status]));
  assert.deepEqual(status, {
    M1: 'pass_ok',
    M2: 'false_block',
    M3: 'catch',
    M4: 'miss',
    M5: 'not_runnable',
  });

  const s = run.summary;
  assert.equal(s.total, 5);
  assert.equal(s.runnable, 4);
  assert.equal(s.not_runnable, 1);
  assert.equal(s.harness_errors, 0);
  assert.deepEqual(s.block_expected, { runnable: 2, caught: 1, missed: 1, catch_rate: 0.5 });
  assert.deepEqual(s.pass_expected, { runnable: 2, ok: 1, false_blocked: 1, false_block_rate: 0.5 });
  assert.equal(run.results.find((r) => r.id === 'M3')?.code_match, true);
  const m5 = run.results.find((r) => r.id === 'M5');
  assert.ok((m5?.missing_capabilities?.length ?? 0) > 0, 'not-runnable must name its capability');
});

test('rates are null (rendered n/a), never fabricated, when a bucket has zero runnable cases', () => {
  const corpus = miniCorpus();
  corpus.cases = corpus.cases.filter((c) => c.expected.verdict !== 'BLOCK');
  const run = runCorpus(corpus);
  assert.equal(run.summary.block_expected.catch_rate, null);
  assert.ok(renderTable(run).includes('catch rate            n/a'));
});

test('artifact is per-corpus only: no blended number, timestamp comes from the caller', () => {
  const runA = runCorpus(miniCorpus());
  const runB = runCorpus({ ...miniCorpus(), meta: { name: 'mini-b' } });
  const artifact = buildArtifact([runA, runB], '2026-08-21T18:00:00-07:00');

  assert.equal(artifact.generated_at, '2026-08-21T18:00:00-07:00'); // injected, not Date.now
  assert.deepEqual(Object.keys(artifact.corpora).sort(), ['mini', 'mini-b']);
  // The veto: nothing in the artifact aggregates across corpora.
  const keys = Object.keys(artifact as unknown as Record<string, unknown>);
  for (const forbidden of ['overall', 'combined', 'total', 'blended', 'aggregate']) {
    assert.ok(!keys.includes(forbidden), `blended key "${forbidden}" must not exist`);
  }
  assert.throws(() => buildArtifact([runA], ''), /explicit timestamp/);
  assert.equal(artifactFileName('2026-08-21T18:00:00-07:00'), 'eval-run-2026-08-21T18-00-00-07-00.json');
});

test('the real blind corpus loads, no case silently dropped, every NR case names a capability', () => {
  const corpus = loadCorpus(join(PACKAGE_ROOT, 'corpora', 'blind'));
  const run = runCorpus(corpus);
  assert.equal(run.results.length, corpus.cases.length);
  for (const result of run.results) {
    if (result.status === 'not_runnable') {
      assert.ok(
        (result.missing_capabilities?.length ?? 0) > 0,
        `${result.id} is not_runnable without a named capability`,
      );
    }
    assert.notEqual(result.status, 'harness_error', `${result.id}: ${result.error ?? ''}`);
  }
});

test('the replay corpus loads with the source doc split: 5 verbatim-report + 6 reconstructed', () => {
  const corpus = loadCorpus(join(PACKAGE_ROOT, 'corpora', 'replay'));
  assert.equal(corpus.cases.length, 11);
  const verbatim = corpus.cases.filter((c) => c.provenance === 'verbatim-report').length;
  const reconstructed = corpus.cases.filter((c) => c.provenance === 'reconstructed').length;
  assert.equal(verbatim, 5);
  assert.equal(reconstructed, 6);
  for (const c of corpus.cases) assert.ok(typeof c.source === 'string' && c.source.length > 0, `${c.id} lacks source`);
  const run = runCorpus(corpus);
  assert.equal(run.results.length, 11);
  // R1 is the headline and must stay honestly not-runnable until core grows screen + time.
  const r1 = run.results.find((r) => r.id === 'R1');
  assert.equal(r1?.status, 'not_runnable');
  assert.ok(r1?.missing_capabilities?.some((m) => m.capability === 'screen-observations'));
});
