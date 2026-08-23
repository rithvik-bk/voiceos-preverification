/* ──────────────────────────────────────── eval CLI ─────────────────────────────────────────
 *
 * Usage:
 *   node src/cli.ts --timestamp 2026-08-21T18:00:00-07:00 [--corpora blind,replay,self] [--outdir results]
 *
 * --timestamp is REQUIRED and comes from the caller: no Date.now in any code path that lands
 * in the artifact (determinism rule). Prints one table per corpus (never blended) and writes
 * one JSON artifact under results/.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCorpus, runCorpus, type CorpusRun } from './runner.ts';
import { artifactFileName, buildArtifact, renderTable } from './report.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

const timestamp = argValue('--timestamp');
if (timestamp === undefined || timestamp === '') {
  console.error('missing required --timestamp <ISO 8601> (the run timestamp comes from the caller; no Date.now here)');
  process.exit(2);
}

const corporaArg = argValue('--corpora') ?? 'self,blind,replay';
const outDir = join(PACKAGE_ROOT, argValue('--outdir') ?? 'results');

const runs: CorpusRun[] = [];
for (const name of corporaArg.split(',').map((s) => s.trim()).filter((s) => s !== '')) {
  const dir = join(PACKAGE_ROOT, 'corpora', name);
  if (!existsSync(join(dir, 'cases.json'))) {
    console.error(`corpus "${name}" not found at ${dir}/cases.json — skipped (named, not silent)`);
    continue;
  }
  const run = runCorpus(loadCorpus(dir));
  runs.push(run);
  console.log(renderTable(run));
  console.log('');
}

if (runs.length === 0) {
  console.error('no corpora ran');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const artifact = buildArtifact(runs, timestamp);
const outPath = join(outDir, artifactFileName(timestamp));
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`artifact: ${outPath}`);
