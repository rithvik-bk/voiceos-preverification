/* ─────────────────────────────────────── corpus runner ─────────────────────────────────────
 *
 * Loads one corpus, runs every runnable case through the REAL gate (@preflight/core runGate —
 * the verdict always comes from gate code, never from harness logic), and scores per S18.3:
 *
 *   expected BLOCK →  gate block = catch          · gate pass  = miss
 *   expected PASS  →  gate pass  = pass_ok        · gate block = false_block
 *   capability gap →  not_runnable (every missing capability named; counted on its own line)
 *   expected CARD  →  always not_runnable today (core has no card surface; scoring a hard
 *                     block as a catch would hide a repair-ladder defect — SCHEMA.md scores
 *                     that as a false block of the repair path, which we cannot measure yet)
 *
 * Catch rate and false-block rate are computed PER CORPUS. There is deliberately no function
 * here or in report.ts that aggregates across corpora (TEST-ENG veto / S18.3).
 * No Date.now anywhere: the runner is pure; timestamps come from the CLI caller.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runGate } from '../../core/src/index.ts';

import { assessCase, buildGateInput, type MissingCapability } from './adapter.ts';
import type { Corpus, CorpusCase } from './schema.ts';

export type CaseStatus = 'catch' | 'miss' | 'pass_ok' | 'false_block' | 'not_runnable' | 'harness_error';

export interface CaseResult {
  id: string;
  category?: string;
  expected: 'PASS' | 'BLOCK' | 'CARD';
  expected_code?: string;
  status: CaseStatus;
  gate?: { verdict: 'pass' | 'block'; code?: string; detail?: Record<string, unknown> };
  /** informational: did the machine code match the expected one (replay corpus carries codes). */
  code_match?: boolean;
  missing_capabilities?: MissingCapability[];
  unmodeled_params?: Array<{ param: string; note: string }>;
  error?: string;
}

export interface CorpusSummary {
  corpus: string;
  policy: 'per-corpus only (S18.3): catch/false-block rates are never blended across corpora';
  total: number;
  runnable: number;
  not_runnable: number;
  harness_errors: number;
  block_expected: { runnable: number; caught: number; missed: number; catch_rate: number | null };
  pass_expected: { runnable: number; ok: number; false_blocked: number; false_block_rate: number | null };
  card_expected: { total: number; runnable: number };
  /** capability → number of cases blocked on it (a case may count under several). */
  missing_capability_counts: Record<string, number>;
}

export interface CorpusRun {
  name: string;
  summary: CorpusSummary;
  results: CaseResult[];
}

export function loadCorpus(dir: string): Corpus {
  const raw = readFileSync(join(dir, 'cases.json'), 'utf8');
  const corpus = JSON.parse(raw) as Corpus;
  if (!Array.isArray(corpus.cases)) throw new Error(`${dir}/cases.json has no cases[]`);
  return corpus;
}

function runCase(corpusCase: CorpusCase): CaseResult {
  const base: CaseResult = {
    id: corpusCase.id,
    ...(corpusCase.category !== undefined ? { category: corpusCase.category } : {}),
    expected: corpusCase.expected.verdict,
    ...(corpusCase.expected.code !== undefined ? { expected_code: corpusCase.expected.code } : {}),
    status: 'not_runnable',
  };

  const assessment = assessCase(corpusCase);
  if (!assessment.runnable) {
    return { ...base, status: 'not_runnable', missing_capabilities: assessment.missing };
  }

  try {
    const { call, contract, store } = buildGateInput(corpusCase);
    const verdict = runGate(call, contract, store);
    const gate =
      verdict.verdict === 'pass'
        ? { verdict: 'pass' as const }
        : { verdict: 'block' as const, code: verdict.code, detail: verdict.detail };

    let status: CaseStatus;
    if (corpusCase.expected.verdict === 'BLOCK') {
      status = verdict.verdict === 'block' ? 'catch' : 'miss';
    } else if (corpusCase.expected.verdict === 'PASS') {
      status = verdict.verdict === 'pass' ? 'pass_ok' : 'false_block';
    } else {
      // Unreachable while CARD is capability-gated in assessCase; defensive against drift.
      return { ...base, status: 'not_runnable', missing_capabilities: assessment.missing };
    }

    const result: CaseResult = { ...base, status, gate };
    if (status === 'catch' && corpusCase.expected.code !== undefined) {
      result.code_match = corpusCase.expected.code === (verdict.verdict === 'block' ? verdict.code : undefined);
    }
    if (assessment.unmodeled.length > 0) result.unmodeled_params = assessment.unmodeled;
    return result;
  } catch (error) {
    // Defensive: core is being extended concurrently. A throw here is a harness/API mismatch,
    // reported on its own line — never folded into catch or false-block numbers.
    return { ...base, status: 'harness_error', error: error instanceof Error ? error.message : String(error) };
  }
}

export function runCorpus(corpus: Corpus): CorpusRun {
  const results = corpus.cases.map(runCase);
  if (results.length !== corpus.cases.length) {
    throw new Error('runner invariant violated: a case was dropped'); // no-silent-caps backstop
  }

  const byStatus = (status: CaseStatus): CaseResult[] => results.filter((r) => r.status === status);
  const blockExpectedRunnable = results.filter(
    (r) => r.expected === 'BLOCK' && r.status !== 'not_runnable' && r.status !== 'harness_error',
  );
  const passExpectedRunnable = results.filter(
    (r) => r.expected === 'PASS' && r.status !== 'not_runnable' && r.status !== 'harness_error',
  );

  const missingCounts: Record<string, number> = {};
  for (const result of byStatus('not_runnable')) {
    const seen = new Set<string>();
    for (const m of result.missing_capabilities ?? []) {
      if (seen.has(m.capability)) continue;
      seen.add(m.capability);
      missingCounts[m.capability] = (missingCounts[m.capability] ?? 0) + 1;
    }
  }

  const caught = byStatus('catch').length;
  const falseBlocked = byStatus('false_block').length;

  const summary: CorpusSummary = {
    corpus: corpus.meta.name,
    policy: 'per-corpus only (S18.3): catch/false-block rates are never blended across corpora',
    total: results.length,
    runnable: results.length - byStatus('not_runnable').length - byStatus('harness_error').length,
    not_runnable: byStatus('not_runnable').length,
    harness_errors: byStatus('harness_error').length,
    block_expected: {
      runnable: blockExpectedRunnable.length,
      caught,
      missed: byStatus('miss').length,
      catch_rate: blockExpectedRunnable.length > 0 ? caught / blockExpectedRunnable.length : null,
    },
    pass_expected: {
      runnable: passExpectedRunnable.length,
      ok: byStatus('pass_ok').length,
      false_blocked: falseBlocked,
      false_block_rate: passExpectedRunnable.length > 0 ? falseBlocked / passExpectedRunnable.length : null,
    },
    card_expected: {
      total: results.filter((r) => r.expected === 'CARD').length,
      runnable: results.filter((r) => r.expected === 'CARD' && r.status !== 'not_runnable' && r.status !== 'harness_error').length,
    },
    missing_capability_counts: missingCounts,
  };

  return { name: corpus.meta.name, summary, results };
}
