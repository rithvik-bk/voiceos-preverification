# Preflight

Preflight is a **deterministic pre-verification layer for voice-agent tool calls.** Before any
action fires, it tries to construct a proof that every *routing* parameter — who / where / when /
how-much — traces to a licensed source, ranked `SPEECH` > `PRIOR_TOOL_OUTPUT` (read back) >
`STATE` > `SCREEN`. Screen and content can license *what to say*, but **never** license routing —
that one rule is the injection firewall. A complete proof fires (`PASS`); an incomplete one is
completed by a single spoken question (`HOLD`), a routing target sourced only from read content is
refused (`BLOCK`, injection only), and a content discrepancy is surfaced, not blocked (`SURFACE`).
There is **zero LLM in the hot path** — the checks are set membership, decimal equality, and
integer cardinality, so the gate is deterministic and runs in microseconds. Post-verification is a
separate layer (Arav's); Preflight defines only the `PreflightReceipt` seam it hands off to.

## Honest scope (read this first)

- **What it catches:** *model-drift* (the model silently changed a value your transcript got
  right, e.g. you said `$54.79`, the call is set to `$54.99`) and *screen/content injection* (a
  routing target pulled from what was read on screen, not from what was said).
- **What it does NOT catch:** **ASR-mishear.** If the recognizer writes `54.99` when you said
  `54.79`, the transcript itself is wrong and Preflight faithfully grounds the wrong words. That is
  a read-back-confirmation problem in a different layer. Preflight grounds *what was transcribed*;
  it does not second-guess transcription.
- **Coverage:** only *annotated* tools are gated. Unannotated tools are fail-open (pass through).
  The 13 shipped Slack contracts are a demo library, not whole-app coverage.
- **The injection firewall needs the transcript.** Inside VoiceOS at zero-mod the tool boundary
  carries only `{name, arguments}`, so the args-only checks (schema, placeholder, idempotency,
  ambiguity vs. queryable state) run fully, but injection-vs-speech / number-twin / span-licensing
  need one field — the transcript — threaded into the tool context. The firewall runs 100%
  deterministically in this repo's harness (sources are pre-labeled); running it live in-app is a
  one-field seam, not a claim that it already runs live at zero-mod.

## Repository layout

| Package | What it is | Build model |
| --- | --- | --- |
| `packages/core` | The gate: provenance lattice, grounding store, verdicts, receipts, shadow mode. **Zero runtime deps, zero LLM, zero network.** | Real `tsc` emit to `dist/` (with `.d.ts`) for external consumers. |
| `packages/contracts` | The tool-annotation format + the CI lint that fails unannotated writes + the coverage number. | Pure `.mjs` + JSON — nothing to compile; `build` syntax-checks the tool. |
| `packages/eval` | The eval harness: per-corpus runner (self / blind / replay, **reported separately, never blended**), capability-honest adapter, fixture generator. | Run-from-source CLI; `build` typechecks (`tsc --noEmit`). |
| `packages/demo` | Offline flagship-beat demo (built separately). | — |
| `packages/adapters/*` | VoiceOS / Slack integration adapters (built separately). | — |

Every package's **canonical execution model is Node's native TypeScript type-stripping**
(Node ≥ 23.6): the code runs and the tests execute directly from `.ts` source with **zero installs**.
`tsc` is used only to emit `@preflight/core` for outside consumers and to typecheck the harness — it
is never required to *run* the code.

## Quickstart (from a clean checkout)

Requires **Node ≥ 23.6** (24.x recommended — needed for native type-stripping).

```bash
# 1. install (root lockfile drives all workspaces; only dev tooling is installed)
npm install

# 2. build (core -> dist with types; eval typecheck; contracts syntax-check)
npm run build

# 3. test (SCOPED per package — see "Reproduce" below for why this matters)
npm test

# 4. lint the tool contracts (annotation coverage)
npm run lint

# 5. run the eval harness (deterministic: timestamp is a required arg, no Date.now in libs)
cd packages/eval
node src/cli.ts --timestamp 2026-08-23T00:00:00-07:00 --corpora self,blind,replay --outdir results
cd ../..

# 6. run the offline demo (flagship beats: injection BLOCK, ambiguity HOLD, number-twin HOLD)
#    The demo package is built in parallel; if packages/demo is empty in your checkout, skip this.
node packages/demo/demo.js
```

## Reproduce (CONTRIBUTING)

**Why tests are scoped per package.** The repo vendors a frozen snapshot of universal-voiceos-oauth
under `vendor/uvo/` (with its own `node_modules` and ~20 Slack/OAuth test files). A repo-wide
`node --test` would collect those and blend the counts. `npm test` therefore delegates to
`npm run test --workspaces`, which runs each package's own `node --test` **inside that package's
directory** — the vendored tree under `vendor/` is never a workspace and is never collected.

Run each package's suite directly (exact commands — each is prefixed with `cd`):

```bash
# core — 16 tests (provenance lattice, gate, act-1 injection firewall, zero-dep enforcement)
cd packages/core && node --test 'test/**/*.test.ts'; cd ../..

# contracts — 13 tests + the live annotation lint
cd packages/contracts && node --test 'test/**/*.test.mjs' && node src/lint.mjs catalogs/slack.annotations.json; cd ../..

# eval — 20 tests (runner, adapter capability-honesty, fixture generator)
cd packages/eval && node --test 'test/**/*.test.ts'; cd ../..
```

Benchmark the gate latency (not part of `npm test`):

```bash
cd packages/core && node bench/bench.ts; cd ../..
```

**Determinism guarantee.** The eval libraries contain no `Date.now` on any path — the run
timestamp is a required CLI argument — so *same corpus + same code = byte-identical output,
forever*. `report.ts` has no cross-corpus aggregation (the tests assert its absence): you cannot
print a blended "N% accurate" number. Corpora are reported separately: **self** (the floor, never
the headline) · **blind / held-out** (authored from the spec before the code) · **replay-of-real-bugs**
(each citing a real community failure).

## The receipt seam (handoff to post-verification)

Preflight emits a `PreflightReceipt { interactionId, serverId, toolName, args, verdict,
routingParams[{name, value, source, transcriptSpan?}], contentParams, transcriptSnapshot, firedAt }`
keyed on the executionId VoiceOS already round-trips. Preflight builds **none** of
post-verification — it only defines and emits this object.
