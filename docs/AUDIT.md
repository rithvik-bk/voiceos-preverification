# Preflight — Engineering Audit

*Date: 2026-08-23. Scope: an honest engineering review of `/Users/rithvik/preflight`. Every concrete claim below traces to a file read or a command run this session. Framing: this is a clean, well-tested **prototype** with a defined integration path — not a deployed product. It is not "production-ready," "battle-tested," or "enterprise-grade," and this audit does not use that language.*

---

## 1. Inventory (what actually exists, per package)

Tests were run per package with `node --test`. Counts verified this session.

| Package | What it is | Tests | Result |
|---|---|---|---|
| `core` | The gate + trust runtime (pure compute, zero deps) | 51 | 50 pass, 0 fail, **1 todo** |
| `adapters/voiceos` | stdio MCP server wrapping tool calls with Preflight | 18 | 18 pass, 0 fail |
| `contracts` | Tool-annotation catalogs + linter + FORMAT.md | 13 | 13 pass, 0 fail |
| `eval` | Corpus runner, capability-honest adapter, fixture gen, report | 20 | 20 pass, 0 fail |
| **Total** | | **102** | **101 pass, 0 fail, 1 honest todo** |

`demo` carries runnable deterministic demos (`run.mjs`, `amount-catch.mjs`, `autonomy.mjs`, plus `setup.html` / `panel.html` / `autonomy.html`); it has no test suite of its own — the gate it drives is tested in `core`.

### `core` (2089 LOC across 16 files)

The heart is `gate.ts` (470 LOC: `preflight`/`runGate`). Supporting primitives:
- `provenance.ts` — the source-rank lattice (transcript_span 4 → tool_output 3 → known_state 2 → screen 1 → model_composed 0) and per-class min-rank rule. FNV-1a `textHash` inline so the core needs no imports at all.
- `transcript.ts` — finalize an utterance into stable word spans; `attributeToTranscript` (tight-normalized span-run match). Explicitly a **static fixture**: no streaming, no stability horizon (SPEC §6 deferred).
- `grounding.ts` — `GroundingStore` of known targets, each stamped with its source/rank. Ported from the prior Slack gate as an instance (not module-global).
- `resolve.ts` — tiered fuzzy resolution (id → exact → normalized → substring → nearest-names miss); Levenshtein orders suggestions only, never auto-picks; 2+ matches = ambiguity, never a coin flip.
- `licensing.ts` — the S11.2 arm (b) Referent Resolution Procedure: a *spoken descriptor* that uniquely resolves to the emitted id licenses the slot. This is the cure for the false-block where a model speaks "dan" but emits `U_DAN`.
- `misbinding.ts` — cross-clause pairing check (the "refund Dan $50 and Sarah $30" → `refund(Dan,$30)` case). Deterministic clause segmentation at connectives; biased to false-negative over false catch.
- `codes.ts` — the single reason-code registry (wire code ↔ PF_* alias ↔ disposition). One table, three readers (eval / repair ladder / receipt). Includes an explicit "structurally out of scope" note for ASR-mishear and wrong-tool.
- `block.ts`, `receipt.ts`, `shadow.ts` — refusal type, per-param receipt, shadow-mode log.
- **Multi-step prototype:** `plan.ts` + `compose.ts` (proof-tree composition, reusing `runGate` per node unmodified) + `taint.ts` (information-flow firewall, Denning-style) + `autonomy.ts` (a pure policy table, level × verdict → action).

### `adapters/voiceos`
`withPreflight.ts` is the drop-in wrapper: `makeRunCall` runs the gate on args first, then forwards (PASS/SURFACE) or refuses (HOLD/BLOCK). Two modes — **OBSERVE** (shadow; never refuses a real call, records `observeWouldHaveBlocked`, forwards anyway) and **ENFORCE**. Two transcript modes auto-detected — `full` (firewall active) vs `args_only_degraded` (slot rule stripped, `injectionFirewall: 'unavailable_no_transcript'`, never claims the firewall ran). Plus `server.ts`, `context.ts`, `runtime.ts`, `repair.ts`, `receipt.ts`, `bin.ts`.

### `contracts`
`lint.mjs` (zero deps) enforces the §20 annotation format: tier, per-param provenance/min_rank/taint, reversibility + inverse, with FAIL vs WARN separation and a printed COVERAGE line. Verified: both catalogs (`voiceos.annotations.json`, `slack.annotations.json`) lint at **COVERAGE 100.0%, verdict PASS**.

### `eval`
`runner.ts` runs every runnable case through the **real gate** (`runGate` — verdict authority never lives in harness logic) and scores per-corpus. `adapter.ts` is capability-honest: `assessCase` names and counts every missing capability; unrunnable cases score `not_runnable`, never a fake pass. Three corpora (self / blind / replay) are **reported separately and never blended** (enforced structurally — there is no cross-corpus aggregator). CLI requires a `--timestamp` arg; no `Date.now` in library paths.

Verified this session (`node src/cli.ts --timestamp …`):
- **self-generated-v0:** 7 cases, 7 runnable, catch rate 100% (7/7).
- **blind-adversarial-v1:** 40 cases, 5 runnable, 35 not-runnable-yet; false-block rate **20% (1/5)** — see gap B38 below.
- **replay-v1:** 11 cases, 5 runnable, 6 not-runnable-yet, catch rate 100% (5/5), codes matched.

---

## 2. Code-quality assessment

**Architecture / separation of concerns — strong.** The dependency direction is clean and one-way: lattice (`provenance`) ← grounding primitives (`transcript`, `grounding`, `resolve`, `licensing`) ← orchestration (`gate`) ← output/vocabulary (`codes`, `receipt`, `shadow`, `block`). The multi-step runtime (`compose`) sits *on top* and reuses the single-step gate per node without duplicating any gate logic — the taint firewall and proof-tree are genuinely additive. The adapter is transport-agnostic (`makeRunCall` returns a closure the MCP server hangs a proxy on), and the eval harness deliberately keeps verdict authority inside `core`. This is the kind of layering where you can point at exactly one file for any given rule.

**Determinism guarantees — unusually rigorous, and enforced by tests rather than asserted in prose.** `enforcement.test.ts` fails the build if any core source imports a network or LLM client, imports *any* non-relative module (even a node built-in), or calls `fetch`/`WebSocket`/`XMLHttpRequest`, and it asserts zero runtime dependencies in `package.json`. The eval runner has no `Date.now`; the timestamp is injected by the CLI caller. The autonomy dial is a static lookup table with a tested safety invariant (block/hold are level-invariant; only the `pass` row relaxes). Same input → same output is a property the test suite actually defends.

**Test coverage of the dangerous paths — good and honest.** The injection firewall (`act1.test.ts`), amount / number-twin, misbinding, taint propagation, proof-tree composition, scope, and receipts all have dedicated suites. The args-only degraded path is covered in the adapter. Critically, the one residual the pure-data layer cannot catch is marked with a `todo` test that *asserts the current wrong answer* — the gap is visible in the test output, not papered over.

**Performance — measured, not claimed.** `bench.ts`: clean send mean 5.2 µs, misheard-target 13.6 µs, injected-destination (S11.2) 216.8 µs — all in-process compute, no network/ASR/LLM. Sub-millisecond across the board.

**Thin spots (named fairly):**
- `transcript.ts` is a static fixture. Streaming, token revision, and the stability horizon (SPEC §6) are explicitly deferred, not implemented. This is fine for a prototype but it is the layer a real voice pipeline stresses hardest.
- `licensingDescriptor` in `licensing.ts` tries every contiguous span run and calls `resolveTarget` on each — O(n²) span enumeration × resolver cost. That is why the injected-destination path is ~40× the clean path (216 µs vs 5 µs). Fine for short utterances; unbounded for long ones. No early-exit or length cap.
- The `GroundingStore` message registry (`rememberMessage`/`isGrounded`) is ported but unused by the send path — carried as substrate for future paths. Honestly labeled, but it is dead code today.
- `textHash` is FNV-1a, explicitly a privacy default for receipts, not a signing boundary. Correctly acknowledged; real signing is a later phase.

---

## 3. Scorecard against what the founders asked for

### Kai — "guarantee tool-calling accuracy, no speed sacrifice, no AI grading AI"

| Ask | Rating | Evidence |
|---|---|---|
| Guarantee tool-calling accuracy | **PARTIAL** | It gives a *deterministic, type-level* guarantee on a well-defined class of routing failures — ungrounded/injected destinations, ambiguous targets, hallucinated targets, not-spoken amounts, cross-clause misbinding (`gate.ts`, `misbinding.ts`, `codes.ts`). It does **not** guarantee accuracy in general: a wrong tool whose every param happens to ground is out of scope (routed to a post-verifier, not this layer), and a true ASR mishear is out of scope by construction — the gate grounds what was *transcribed*. Both limits are stated plainly in `codes.ts`, not hidden. So: a strong guarantee on the classes it claims; not the blanket guarantee the words imply. |
| No speed sacrifice | **MET** | `bench.ts`: 5.2 µs clean-path mean, everything sub-millisecond, zero LLM/network in the hot path — and that's *enforced* by `enforcement.test.ts` (no network/LLM imports, no `fetch`, zero deps), not just measured once. |
| No AI grading AI | **MET** | Pure compute; the eval harness takes its verdict from the real gate, and the capability-honest adapter scores unrunnable cases `not_runnable` with the missing capability named — never a model judging a model, never a fabricated pass. |

### Jonah — real edge cases, a draft to shape, error-handling UX

| Ask | Rating | Evidence |
|---|---|---|
| Real edge cases (the $54.79 case) | **MET** | `amount-catch.mjs` (run this session): "refund Dan $54.79" → model re-types $54.99 → `HOLD [amount_not_in_speech]`, "you never said it." The misbinding twin ("refund Dan $50 and Sarah $30" → `refund(Dan,$30)`) is a real, distinct check. The replay corpus is built from community bug reports (5/5 caught, codes matched). |
| A draft to shape | **MET** | It is exactly that: a runnable, heavily-documented v1 with demos, three corpora, an adapter, and residuals openly marked `todo`. It invites shaping rather than presenting a finished surface. |
| Error-handling UX | **PARTIAL** | The vocabulary and repair path exist and are demonstrated: `codes.ts` maps every code to PASS/HOLD/BLOCK/SURFACE, `repair.ts` produces structured refusals with a spoken repair string + discrepancy, and the demo prints them ("That account came from the email you read, not from you. Pay it anyway?"). But the actual card/tap surface is unbuilt — eval reports card-expected cases as "not runnable (core has no card surface)," and the §4 constrained-re-emit repair ladder is not wired end-to-end. Strong repair *language*; the interactive UX surface is still demo-level. |

---

## 4. Real gaps + the honest todo

1. **The undeclared-launder residual (the 1 todo).** Taint propagation follows *declared* `derivedFrom` edges (`taint.ts`, `propagate`). A structured step that copies a tainted value into its output **without** declaring `derivedFrom` — an undeclared launder / confused-deputy — is not caught at this pure-data layer, because nothing links its output to the tainted input. `taint.test.ts:98` marks this with a `todo` that asserts the current (wrong) answer, so it shows up in test output. This is a classifier-trust gap (the step lied about its provenance), not a hole in the invariant itself; closing it needs value-level dataflow from the executor, which is out of the pre-verification lane. Described here exactly as the code describes it — a named residual, not a hidden failure and not a thing that "works."

2. **B38 — a persistent blind false-block (20% on runnable blind PASS cases).** The blind adversarial corpus false-blocks 1 of its 5 runnable PASS cases: the gate returns `insufficient_provenance` where PASS was expected, because tier-aware min-rank is not yet implemented. This is a real, currently-failing correctness case on legitimate input, tracked and reproducible via the eval CLI. It is a known planned fix, but today it is a live false-block, not a resolved one.

3. **The blind adversarial corpus is largely un-exercised.** 35 of 40 blind cases are `not-runnable-yet` — they need capabilities the core does not model (card verdicts, screen observations, streaming stability, precondition verification). The harness is admirably honest about this (each missing capability named and counted), but the practical consequence is that the hardest adversarial set mostly does not touch today's gate. The 100% catch rates are real but are measured on the runnable subsets (self 7/7, replay 5/5).

4. **Card surface / repair ladder unbuilt in core.** Refusals carry spoken-repair strings, but there is no card input path and no end-to-end constrained-re-emit. Error-handling UX is demonstrated, not integrated.

5. **Multi-step is a prototype, not shipped.** `plan.ts` / `compose.ts` / `taint.ts` / `autonomy.ts` demonstrate proof-tree composition, the taint firewall, and the autonomy dial. VoiceOS does not ship multi-step autonomy today; this is "demonstrates the idea," not a live product path.

6. **ASR mishear is out of scope, by design.** If the transcript itself is wrong ("54.99" written when "54.79" was said), this layer faithfully grounds the wrong words. That is a read-back / ASR-confidence problem for a different layer, and there is deliberately no reason code for it — inventing one would be a fabricated catch. Correct call; stated so no reviewer mistakes it for a bug.

---

## 5. Overall rating

**86 / 100 — a clean, well-tested prototype that meets the core of what was asked.**

The engineering discipline here is well above what an internship audition needs to clear: a one-way layered architecture where every rule lives in exactly one file; determinism and the no-LLM/no-network guarantee *enforced by tests* rather than asserted; an eval harness that is structurally honest (verdict authority in the gate, capability gaps named and counted, corpora never blended); and a genuinely hard-won edge-case suite (the $54.79 amount catch and its misbinding twin, an injection firewall expressed as a type check rather than a classifier). The honest todo and the visible B38 false-block are, if anything, evidence *for* the codebase — the failures are surfaced, not buried. Points come off because the headline "guarantee accuracy" is scoped narrower than the literal ask (correctly, but it is a PARTIAL), the error-handling UX and multi-step runtime are demo/prototype-level rather than integrated, the blind adversarial corpus is mostly deferred, and B38 is a live false-block on legitimate input. None of those are dishonesty; they are the honest distance between a strong prototype and a shipped layer. This is an 86: senior-quality work with a clearly-drawn, defensible scope and a short, named list of what remains.
