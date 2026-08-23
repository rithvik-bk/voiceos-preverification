# Preflight — Engineering Audit

*Date: 2026-08-23. Scope: an honest engineering review of `/Users/rithvik/preflight`, re-verified after the tier-aware false-block fix. Every concrete claim below traces to a file read or a command run this session. Framing: this is a clean, well-tested **prototype** with a defined integration path — not a deployed product. It is not "production-ready," "battle-tested," or "enterprise-grade," and this audit does not use that language.*

---

## 1. Inventory (what actually exists, per package)

Tests were run per package with `node --test`. Counts verified this session.

| Package | What it is | Tests | Result |
|---|---|---|---|
| `core` | The gate + trust runtime (pure compute, zero deps) | 57 | 56 pass, 0 fail, **1 todo** |
| `adapters/voiceos` | stdio MCP server wrapping tool calls with Preflight | 18 | 18 pass, 0 fail |
| `contracts` | Tool-annotation catalogs + linter + FORMAT.md | 13 | 13 pass, 0 fail |
| `eval` | Corpus runner, capability-honest adapter, fixture gen, report | 20 | 20 pass, 0 fail |
| **Total** | | **108** | **107 pass, 0 fail, 1 honest todo** |

The single non-passing item is one `{ todo: true }` test (`taint.test.ts`) that deliberately asserts the current wrong answer for the undeclared-launder residual — it is reported as `todo`, not `fail`, and the suite runs `fail 0`. See §4.1.

`demo` carries runnable deterministic demos (`run.mjs`, `amount-catch.mjs`, `autonomy.mjs`, plus `setup.html` / `panel.html` / `autonomy.html`); it has no test suite of its own — the gate it drives is tested in `core`. All three `.mjs` demos were run this session and each exited `0`.

### `core`

The heart is `gate.ts` (`preflight`/`runGate`). Supporting primitives:
- `provenance.ts` — the source-rank lattice (transcript_span 4 → tool_output 3 → known_state 2 → screen 1 → model_composed 0) and the per-class min-rank rule. As of this session the routing floor is **tier-aware** via `minRankForRouting(tier)` (see §2, §4.2). FNV-1a `textHash` inline so the core needs no imports at all.
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
`lint.mjs` (zero deps) enforces the §20 annotation format: tier, per-param provenance/min_rank/taint, reversibility + inverse, with FAIL vs WARN separation and a printed COVERAGE line. Both catalogs (`voiceos.annotations.json`, `slack.annotations.json`) lint at **COVERAGE 100.0%, verdict PASS**.

### `eval`
`runner.ts` runs every runnable case through the **real gate** (`runGate` — verdict authority never lives in harness logic) and scores per-corpus. `adapter.ts` is capability-honest: `assessCase` names and counts every missing capability; unrunnable cases score `not_runnable`, never a fake pass. Three corpora (self / blind / replay) are **reported separately and never blended** (enforced structurally — there is no cross-corpus aggregator). CLI requires a `--timestamp` arg; no `Date.now` in library paths.

Verified this session (`eval run --timestamp 2026-08-23T10:00:00-07:00`, artifact `packages/eval/results/eval-run-2026-08-23T10-00-00-07-00.json`). Never blended:
- **self-generated-v0:** 7 cases, 7 runnable, catch rate 100% (7/7 BLOCK-expected).
- **blind-adversarial-v1:** 40 cases, 5 runnable, 35 not-runnable-yet; false-block rate **0.0% (0/5 PASS-expected)** — B38 resolved (was 20%). See §4.2.
- **replay-v1:** 11 cases, 5 runnable, 6 not-runnable-yet, catch rate 100% (5/5 BLOCK-expected), codes matched.

---

## 2. Code-quality assessment

**Architecture / separation of concerns — strong.** The dependency direction is clean and one-way: lattice (`provenance`) ← grounding primitives (`transcript`, `grounding`, `resolve`, `licensing`) ← orchestration (`gate`) ← output/vocabulary (`codes`, `receipt`, `shadow`, `block`). The multi-step runtime (`compose`) sits *on top* and reuses the single-step gate per node without duplicating any gate logic — the taint firewall and proof-tree are genuinely additive. The adapter is transport-agnostic, and the eval harness deliberately keeps verdict authority inside `core`. You can point at exactly one file for any given rule.

**The tier-aware fix (this session) — clean and correctly scoped.** The routing min-rank floor is now computed per-tier: `minRankForRouting(1) = 0` (a Tier-1 read is fail-open on rank — its safety is that the value *resolves* to a real grounded target, with `target_not_found`/`ambiguous_target` still firing, not that the grounding source outranks a threshold), while `minRankForRouting(2) = minRankForRouting(3) = 3` (byte-identical to the old tier-blind constant `MIN_RANK.routing`). Verified empirically via the dedicated regression suite (`test/tier-aware-rank.test.ts`, 6/6 pass): `t1=0, t2=3, t3=3`. The change threads `contract.tier` into `gateRoutingParam` and `gateRoutingParamArgsOnly`; the `insufficient_provenance` block and the Tier-3 slot firewall are otherwise unchanged, and the min-rank check still runs *before* the slot firewall.

**Crown-jewel firewall — verified intact this session (independent read, not taken on trust).** Reading `gate.ts` directly: the S11.2 destination/amount/permission slot firewall (`if (spec.slot !== undefined) { … hasTranscriptSpan … }`) is a *separate, stricter* check that unconditionally demands a `transcript_span` (rank-4 licensing) for any slotted routing param, independent of the min-rank floor. The tier-1 fail-open only relaxes the rank floor on reads; it cannot reach a slotted Tier-3 write, and even a passing floor does not exempt a slot from the transcript-span requirement. The `provenance_mismatch` (`PF_INJECTION_ROUTING_FROM_CONTENT`) and `insufficient_provenance` (`PF_ROUTING_RANK_TOO_LOW`) BLOCK codes both still fire. The regression suite locks this with three explicit "firewall intact" cases, all passing: a Tier-3 send to a body-sourced destination still blocks `provenance_mismatch`; a Tier-3 destination grounded only at rank 1 (screen) still blocks `insufficient_provenance`; a Tier-3 amount not in the spoken number-set still holds `amount_not_in_speech`. The adapter's crown-jewel test ("BAD call (injection: destination only from read content) is BLOCKED") is also green. The fix did not open a hole.

**Determinism guarantees — enforced by tests, not asserted in prose.** `enforcement.test.ts` fails the build if any core source imports a network or LLM client, imports any non-relative module (even a node built-in), or calls `fetch`/`WebSocket`/`XMLHttpRequest`, and it asserts zero runtime dependencies. The eval runner has no `Date.now`; the timestamp is injected by the CLI caller. The autonomy dial is a static lookup table with a tested safety invariant (block/hold are level-invariant; only the `pass` row relaxes).

**Test coverage of the dangerous paths — good and honest.** The injection firewall, amount / number-twin, misbinding, taint propagation, proof-tree composition, scope, receipts, and now the tier-aware floor all have dedicated suites. The args-only degraded path is covered in the adapter. The one residual the pure-data layer cannot catch is marked with a `todo` test that *asserts the current wrong answer* — visible in test output, not papered over.

**Performance — measured, not claimed.** `bench.ts`: clean send mean ~5 µs, misheard-target ~14 µs, injected-destination (S11.2) ~217 µs — all in-process compute, no network/ASR/LLM. Sub-millisecond across the board.

**Thin spots (named fairly):**
- `transcript.ts` is a static fixture. Streaming, token revision, and the stability horizon (SPEC §6) are explicitly deferred. This is the layer a real voice pipeline stresses hardest.
- `licensingDescriptor` tries every contiguous span run and calls `resolveTarget` on each — O(n²) span enumeration × resolver cost. That is why the injected-destination path is ~40× the clean path. Fine for short utterances; unbounded for long ones. No early-exit or length cap.
- The `GroundingStore` message registry (`rememberMessage`/`isGrounded`) is ported but unused by the send path — carried as substrate for future paths. Honestly labeled, but dead code today.
- `textHash` is FNV-1a, explicitly a privacy default for receipts, not a signing boundary. Real signing is a later phase.

---

## 3. Scorecard against what the founders asked for

### Kai — "guarantee tool-calling accuracy, no speed sacrifice, no AI grading AI"

| Ask | Rating | Evidence |
|---|---|---|
| Guarantee tool-calling accuracy | **PARTIAL** | It gives a *deterministic, type-level* guarantee on a well-defined class of routing failures — ungrounded/injected destinations, ambiguous targets, hallucinated targets, not-spoken amounts, cross-clause misbinding. It does **not** guarantee accuracy in general: a wrong tool whose every param happens to ground is out of scope (routed to a post-verifier), and a true ASR mishear is out of scope by construction — the gate grounds what was *transcribed*. Both limits are stated plainly in `codes.ts`. A strong guarantee on the classes it claims; not the blanket guarantee the words imply. |
| No speed sacrifice | **MET** | `bench.ts`: ~5 µs clean-path mean, everything sub-millisecond, zero LLM/network in the hot path — *enforced* by `enforcement.test.ts`, not just measured once. |
| No AI grading AI | **MET** | Pure compute; the eval harness takes its verdict from the real gate, and the capability-honest adapter scores unrunnable cases `not_runnable` with the missing capability named — never a model judging a model, never a fabricated pass. |

### Jonah — real edge cases, a draft to shape, error-handling UX

| Ask | Rating | Evidence |
|---|---|---|
| Real edge cases (the $54.79 case) | **MET** | `amount-catch.mjs` (run this session, exit 0): "refund Dan $54.79" → model re-types $54.99 → `HOLD [amount_not_in_speech]`, "you never said it." The misbinding twin is a real, distinct check. The replay corpus is built from community bug reports (5/5 caught, codes matched). |
| A draft to shape | **MET** | A runnable, heavily-documented v1 with demos, three corpora, an adapter, and residuals openly marked `todo`. It invites shaping rather than presenting a finished surface. |
| Error-handling UX | **PARTIAL** | The vocabulary and repair path exist and are demonstrated: `codes.ts` maps every code to PASS/HOLD/BLOCK/SURFACE, `repair.ts` produces structured refusals with a spoken repair string + discrepancy, and the demo prints them. But the actual card/tap surface is unbuilt — eval reports card-expected cases as "not runnable (core has no card surface)," and the §4 constrained-re-emit repair ladder is not wired end-to-end. Strong repair *language*; the interactive UX surface is still demo-level. |

---

## 4. Real gaps + the honest todo

1. **The undeclared-launder residual (the 1 todo) — UNCHANGED.** Taint propagation follows *declared* `derivedFrom` edges (`taint.ts`, `propagate`). A structured step that copies a tainted value into its output **without** declaring `derivedFrom` — an undeclared launder / confused-deputy — is not caught at this pure-data layer, because nothing links its output to the tainted input. `taint.test.ts` marks this with a `{ todo: true }` test that asserts the current (wrong) answer, so it shows up in test output. This is a classifier-trust gap (the step lied about its provenance), not a hole in the invariant itself; closing it needs value-level dataflow from the executor, which is out of the pre-verification lane. This remains the single most honest limitation of the design.

2. **B38 — RESOLVED this session (was a 20% blind false-block).** The blind adversarial corpus previously false-blocked 1 of its 5 runnable PASS cases: a Tier-1 read resolving to a rank-2 `known_state` channel returned `insufficient_provenance` where PASS was expected, because the min-rank floor was tier-blind. The tier-aware floor fixes exactly this: a Tier-1 read is now fail-open on rank while its resolution safety (`target_not_found`/`ambiguous_target`) is retained. Re-measured false-block rate on the runnable blind PASS subset is now **0.0% (0/5)**, and a dedicated regression test locks both the fix and the firewall-intact behavior. *Caveat, stated plainly: 0/5 is a clean result on a small runnable subset, not a statistical guarantee across the full adversarial space — see gap 3.*

3. **The blind adversarial corpus is largely un-exercised — UNCHANGED and the real ceiling.** 35 of 40 blind cases are `not-runnable-yet` — they need capabilities the core does not model (non-entity-referent gating, card verdicts, amount/financial slots, derived-time verification, screen observations, streaming stability, precondition verification, and more; each named and counted by the harness). The consequence is that the hardest adversarial set mostly does not touch today's gate. The 100% catch rates and 0% false-block rate are real but are measured on the runnable subsets (self 7/7, replay 5/5, blind 5 runnable).

4. **Card surface / repair ladder unbuilt in core — UNCHANGED.** Refusals carry spoken-repair strings, but there is no card input path and no end-to-end constrained-re-emit. Error-handling UX is demonstrated, not integrated.

5. **Multi-step is a prototype, not shipped — UNCHANGED.** `plan.ts` / `compose.ts` / `taint.ts` / `autonomy.ts` demonstrate proof-tree composition, the taint firewall, and the autonomy dial. This is "demonstrates the idea," not a live product path.

6. **ASR mishear is out of scope, by design — UNCHANGED.** If the transcript itself is wrong ("54.99" written when "54.79" was said), this layer faithfully grounds the wrong words. That is a read-back / ASR-confidence problem for a different layer, and there is deliberately no reason code for it — inventing one would be a fabricated catch. Correct call; stated so no reviewer mistakes it for a bug.

---

## 5. Overall rating

**89 / 100 — a clean, well-tested prototype that meets the core of what was asked, with its one live correctness failure now fixed and regression-locked.**

The engineering discipline is well above what an internship audition needs to clear: a one-way layered architecture where every rule lives in exactly one file; determinism and the no-LLM/no-network guarantee *enforced by tests* rather than asserted; an eval harness that is structurally honest (verdict authority in the gate, capability gaps named and counted, corpora never blended); and a genuinely hard-won edge-case suite (the $54.79 amount catch and its misbinding twin, an injection firewall expressed as a type check rather than a classifier).

The tier-aware fix is the reason this moves up from the prior 86. It converts B38 from a live false-block on legitimate input into a resolved case, does so with a correctly-scoped rule (reads fail-open on rank, Tier-2/Tier-3 floors byte-unchanged), and — critically — was verified this session not to weaken the crown-jewel firewall: an independent read of `gate.ts` confirms the Tier-3 slot rule is a separate, unconditional transcript-span check, and three explicit "firewall intact" regression cases plus the adapter's injection test all pass. The failure that was actively wrong is fixed; the fix is defended by tests.

It stops at 89, not higher, because the ceiling is structural, not defect-driven: the blind adversarial corpus is still 35/40 deferred (so the 0% false-block and 100% catch numbers rest on small runnable subsets), the card surface and constrained-re-emit repair ladder are demo-level rather than integrated, multi-step autonomy is a prototype, and the undeclared-launder confused-deputy remains an honest todo. The headline "guarantee accuracy" is also correctly scoped narrower than the literal ask (a PARTIAL, not a fail). None of that is dishonesty — it is the honest distance between a strong, now-cleaner prototype and a shipped layer. This is an 89: senior-quality work, a live bug fixed without collateral damage, and a short, named list of what genuinely remains.
