/* ────────────────────────────────────── report format ──────────────────────────────────────
 *
 * Per-corpus tables ONLY (S18.3 / TEST-ENG veto): each corpus renders its own table with its
 * own catch rate, false-block rate, and not-runnable count. There is no cross-corpus total,
 * no weighted average, no "overall" row — and the tests assert that absence.
 *
 * Determinism: the run timestamp is an argument. Nothing in this module reads a clock.
 */

import type { CaseResult, CorpusRun } from './runner.ts';

export interface Artifact {
  generated_at: string;
  policy: 'per-corpus only (S18.3): never blended';
  corpora: Record<
    string,
    {
      summary: CorpusRun['summary'];
      results: CaseResult[];
    }
  >;
}

function pct(rate: number | null): string {
  return rate === null ? 'n/a' : `${(rate * 100).toFixed(1)}%`;
}

export function renderTable(run: CorpusRun): string {
  const s = run.summary;
  const lines: string[] = [];
  lines.push(`CORPUS: ${s.corpus} — reported alone (S18.3); never blended`);
  lines.push(`  cases                 ${s.total}`);
  lines.push(`  runnable today        ${s.runnable}`);
  lines.push(`  not-runnable-yet      ${s.not_runnable}`);
  if (s.harness_errors > 0) lines.push(`  harness errors        ${s.harness_errors}  <-- investigate, not scored`);
  lines.push(
    `  catch rate            ${pct(s.block_expected.catch_rate)} (${s.block_expected.caught}/${s.block_expected.runnable} BLOCK-expected runnable; ${s.block_expected.missed} missed)`,
  );
  lines.push(
    `  false-block rate      ${pct(s.pass_expected.false_block_rate)} (${s.pass_expected.false_blocked}/${s.pass_expected.runnable} PASS-expected runnable)`,
  );
  lines.push(
    `  CARD-expected         ${s.card_expected.total} total, ${s.card_expected.runnable} runnable (core has no card surface)`,
  );
  const caps = Object.entries(s.missing_capability_counts).sort((a, b) => b[1] - a[1]);
  if (caps.length > 0) {
    lines.push('  missing capabilities (cases counted per capability; a case may need several):');
    for (const [capability, count] of caps) {
      lines.push(`    ${capability.padEnd(32)} ${count}`);
    }
  }
  const falseBlocks = run.results.filter((r) => r.status === 'false_block');
  if (falseBlocks.length > 0) {
    lines.push('  false blocks:');
    for (const r of falseBlocks) lines.push(`    ${r.id}: gate said ${r.gate?.code ?? '?'} (expected PASS)`);
  }
  const misses = run.results.filter((r) => r.status === 'miss');
  if (misses.length > 0) {
    lines.push('  misses:');
    for (const r of misses) lines.push(`    ${r.id}: gate passed a call expected to BLOCK`);
  }
  return lines.join('\n');
}

/** One JSON artifact per run. `timestamp` MUST come from the caller (CLI arg) — never a clock here. */
export function buildArtifact(runs: CorpusRun[], timestamp: string): Artifact {
  if (typeof timestamp !== 'string' || timestamp === '') {
    throw new Error('buildArtifact requires an explicit timestamp from the caller (no Date.now in library code)');
  }
  const corpora: Artifact['corpora'] = {};
  for (const run of runs) {
    corpora[run.name] = { summary: run.summary, results: run.results };
  }
  return { generated_at: timestamp, policy: 'per-corpus only (S18.3): never blended', corpora };
}

export function artifactFileName(timestamp: string): string {
  return `eval-run-${timestamp.replace(/[:.]/g, '-')}.json`;
}
