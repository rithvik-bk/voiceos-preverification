# @preflight/eval

The eval harness. It runs corpora of proposed tool calls through the **real** `@preflight/core`
gate (the verdict always comes from gate code, never from harness logic) and scores each case as
catch / miss / pass_ok / false_block / not_runnable. Two disciplines are load-bearing: **corpora are
reported separately, never blended** — self-generated, blind (authored from the spec alone), and
replay each get their own table with their own catch and false-block rates, and there is no code
path that aggregates across them (S18.3). And it is **capability-honest**: a case that touches
something today's core cannot represent is scored NOT-RUNNABLE-YET with the missing capability named
and counted — never bent into a fake pass or a fake catch. Zero runtime deps; runs from source. This
is a **prototype** harness.

## Files

| File | What it does |
|---|---|
| `src/cli.ts` | The CLI: parses `--timestamp` (required), `--corpora`, `--outdir`; runs each corpus, prints one table per corpus (never blended), and writes one JSON artifact under `results/`. |
| `src/runner.ts` | Loads one corpus and runs every runnable case through `runGate`; scores per S18.3 (expected BLOCK→catch/miss, expected PASS→pass_ok/false_block, capability gap→not_runnable); computes catch/false-block rate per corpus. |
| `src/adapter.ts` | Two jobs kept separate: `assessCase` decides whether today's core can honestly evaluate a case (naming every missing capability), and `buildGateInput` reconstructs the gate context verbatim for runnable cases — passing the model's emitted params unchanged. |
| `src/catalog.ts` | The no-silent-caps registry: what core can and cannot represent as of the read date, with a note per capability gap, so not-runnable is always explained. |
| `src/schema.ts` | The `cases.json` type shape as defined by the blind-corpus author in `corpora/blind/SCHEMA.md`, plus the replay/self extensions. |
| `src/report.ts` | Per-corpus tables and the JSON artifact builder — deliberately with no cross-corpus total, no weighted average, no "overall" row (the tests assert that absence). |
| `src/fixturegen.ts` | The S18.1 self-growing loop: turns a shadow-log `would_have_blocked` record into an anonymized corpus case (deterministic pseudonyms that preserve the resolver's exact/normalized/substring relations), so block → fixture → regression case. |

## Run the harness

`--timestamp` is **required** — the run timestamp comes from the caller because no `Date.now` is
allowed in any library path (determinism rule):

```
cd packages/eval
node src/cli.ts --timestamp 2026-08-21T18:00:00-07:00
node src/cli.ts --timestamp 2026-08-21T18:00:00-07:00 --corpora blind,replay,self --outdir results
```

A missing/empty `--timestamp` exits 2; a named-but-absent corpus is skipped loudly, never silently.

## Run the tests

```
cd packages/eval
node --test 'test/**/*.test.ts'          # 20 tests, all pass
npm run build                            # tsc --noEmit typecheck (does NOT emit dist/)
```
