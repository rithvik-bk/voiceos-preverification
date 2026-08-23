# Preflight — reproduction card (for Kai)

*Every claim below has one command. Run it on your laptop; the "expected" is what we saw this session (node v24.14.0). Numbers marked **RECOMPUTE LIVE** depend on your machine or a live DB and will differ — that's the point, not a bug. Every command is scoped `cd packages/<x>` so a stray root `node --test` can't blend counts across packages (the repo vendors ~20 unrelated Slack/OAuth test files; keep them out).*

**Setup:** Node ≥ 22 (native TS + `node --test`). Zero runtime deps in core. No network, no API keys, no DB required for anything except the one clearly-labeled DB proxy at the end.

**What changed since the last card:** the gate grew into a **trust runtime** — it now verifies a whole multi-step **plan** (a DAG) before any step fires, not one call at a time. The new modules (`plan.ts`, `compose.ts`, `taint.ts`, `autonomy.ts`) are pure compute on top of the same lattice — no LLM, no clock, deterministic per step and per plan. Section 8 is the new reproduction. The determinism story is unchanged and stronger: a whole plan verdict is now byte-reproducible too.

---

## 1. The engine passes its own tests (per package, never blended)

```
cd packages/core      && node --test
cd packages/contracts && node --test
cd packages/eval      && node --test
```
**Expected (this session):**
- core — `fail 0`, `pass == tests`. Base gate is **33 pass** this session; the count **grows** as the autonomy subsystem (`plan`/`compose`/`taint`/`autonomy`) lands its tests. Don't take our number — read the printed `pass`/`fail` line yourself. The invariant is `fail 0` and `pass == tests`, always.
- contracts — `tests 13 · pass 13 · fail 0`
- eval — `tests 20 · pass 20 · fail 0`

*(Run them in three separate invocations. There is no root `package.json` and no root test aggregate — deliberately, so counts can't merge.)*

---

## 2. Determinism proof — same corpus + same code + same timestamp = byte-identical output

The CLI takes the run timestamp as a **required argument**. There is no `Date.now` in any library path — so two runs with the same `--timestamp` produce the same bytes, forever.

```
cd packages/eval
node --experimental-strip-types src/cli.ts --timestamp 2026-08-23T12:00:00-07:00 --outdir tmp/d1
node --experimental-strip-types src/cli.ts --timestamp 2026-08-23T12:00:00-07:00 --outdir tmp/d2
diff tmp/d1/eval-run-2026-08-23T12-00-00-07-00.json tmp/d2/eval-run-2026-08-23T12-00-00-07-00.json && echo IDENTICAL
shasum tmp/d1/*.json tmp/d2/*.json
```
**Expected:** `diff` prints nothing, then `IDENTICAL`; both files share one sha1. **RECOMPUTE LIVE** — quote the sha1 your own run prints, not ours.

*Try to break it:* remove `--timestamp` → the CLI refuses to run (`missing required --timestamp`). There is no fallback clock to make output drift. The same property holds for the plan verifier — `verifyPlan()` takes no clock and reads no ambient state, so a `ProofTree` is a pure function of `(plan, store)`.

---

## 3. No-blended-number self-test — you physically cannot print "94% accurate"

Your exact ask was "no AI grading AI." Two structural guarantees, both testable:
- **No LLM in the grader.** The grader is `assert(gate.verdict === case.expected)` against hand-written JSON. Grep it:
  ```
  cd packages/eval && grep -rniE "openai|anthropic|\bfetch\(|https?://|\.chat\.|generateContent|node-fetch|axios" src/ || echo "NO LLM CALLS IN GRADER"
  ```
  **Expected:** `NO LLM CALLS IN GRADER`. *(Grep the actual call surfaces, not the substring "model" — the source legitimately contains words like `unmodeled` and `model_claimed_source` in comments; those are not LLM calls.)*
- **No cross-corpus aggregation exists, and a test asserts its absence.** `report.ts` has no code path that sums catch/false-block rates across corpora — the "94% overall" number is unrepresentable.
  ```
  cd packages/eval && node --test test/runner.test.ts
  ```
  **Expected:** the suite includes `artifact is per-corpus only: no blended number, timestamp comes from the caller` — passing. Every corpus prints alone, tagged `reported alone (S18.3); never blended`.

---

## 4. The three corpora — run the harness and read the real story

```
cd packages/eval && node --experimental-strip-types src/cli.ts --timestamp 2026-08-23T12:00:00-07:00 --outdir tmp/run
```
**Expected, per corpus (this session):**

| corpus | cases | runnable today | result |
|---|---|---|---|
| **self-generated-v0** | 7 | 7 | catch rate **100.0% (7/7 BLOCK-expected)** — this is the floor, never our headline |
| **blind-adversarial-v1** | 40 | 5 | **1 false-block (B38)** on 5 PASS-expected runnable; 35 not-runnable-yet (unbuilt capabilities, listed) |
| **replay-v1** | 11 | 5 | catch rate **100.0% (5/5 BLOCK-expected)**; each cites a real community failure to file:line |

### The blind-corpus 5→1 story (this is the honest headline)
The blind corpus was **authored from the spec before the code, and committed before the first run** — it's a pre-registered prediction, not a fixture we tuned to pass. On first contact it **caught 5 false-blocks in our own gate**. We fixed the *gate*, not the corpus. **1 residual false-block remains: B38** (`gate said insufficient_provenance, expected PASS`), visible right there in the output — we ship the failure in the artifact rather than hide it.

**Do not read 20% as a rate.** It's `1/5` — n=5 runnable PASS-cases is an anecdote, not a false-block rate. A real clean-call false-block rate needs live traffic; it's the top unbuilt item, and we'll say so before you ask. The 35 "not-runnable-yet" cases are honest IOUs: each names the capability it needs (`amount-and-financial-slots`, `card-verdicts`, `derived-time-verification`, `non-entity-referent-gating`, …) — the missing-capability histogram *is* the roadmap.

---

## 5. Latency — deterministic, microseconds, no LLM in the hot path

```
cd packages/core && npm run bench
```
**Expected (RECOMPUTE LIVE — machine-dependent; this session, node v24.14.0, 5000 iters after 1000 warmup):**
- clean send (passes, full receipt) — **mean 4.9 µs · p95 5.5 µs**
- misheard target (would-have-blocked) — **mean 13.8 µs · p95 15.7 µs**
- injected destination (would-have-blocked) — **mean 232.7 µs · p95 317.7 µs**

In-process compute only — no network, no ASR, no LLM, no real send in these numbers. **Quote your own laptop's figure, not ours.**

**A whole plan is still imperceptible.** `verifyPlan()` is one gate run per step plus a graph walk that threads sources forward. Worst case per step ≈ the injected-destination path (**~233 µs measured**); clean per step ≈ **~5 µs**. So a **40-step plan** is **~200 µs clean, and under ~10 ms even if every step hits the worst-case path** (40 × 233 µs ≈ 9.3 ms). There is no perceptible speed cost to verifying the entire plan before the agent acts — the arithmetic is just the per-step number times the step count, because the walk itself is linear in edges.

---

## 6. The real reason codes (grep them — no hidden behavior)

```
cd packages/core && grep -rnE "new PreflightBlock\('" src/gate.ts
```
**Expected — five deterministic single-action codes, all in `gate.ts`:** `missing_parameter` · `ambiguous_target` · `target_not_found` · `insufficient_provenance` · `provenance_mismatch`. The injection firewall is `provenance_mismatch` with `found: <content source>, required: transcript_span`. That's the single-action vocabulary — no catch exists that isn't one of these. The plan layer (Section 8) adds the taint-sink and poisoned-dependency verdicts on top; grep `packages/core/src/taint.ts` and `compose.ts` for those.

---

## 7. The one number that MUST be recomputed live — the groundability proxy

We do not hardcode this; the VoiceOS DB is live and grows. Everything about it is labeled **proxy**, because past tool-call arguments were never stored.

```
DB=~/Library/Application\ Support/VoiceOS/voiceos.db
sqlite3 "$DB" "SELECT count(*) FROM voice_sessions;"
sqlite3 "$DB" "SELECT count(*) FROM agent_tool_calls;"
sqlite3 "$DB" "SELECT count(*) FROM agent_tool_calls WHERE input_json IS NULL;"
```
**Expected (RECOMPUTE LIVE — this session):** voice_sessions **443**, agent_tool_calls **134**, input_json NULL **134/134**.

**The load-bearing fact is the last one: `input_json` is 134/134 NULL.** Past tool arguments were never persisted — so *any* historical drift number is a **groundability proxy**, never a measured drift rate. Join spoken text via `agent_turns.user_message` (by turn_id) or `voice_sessions.transcript`; there is **no** `agent_turns.transcript` column. This gap — that VoiceOS's own DB can't reconstruct what a past action was told to do — is itself the enterprise argument (see the one-pager).

---

## 8. The plan layer — proof-tree, composition, taint, poison (the trust runtime)

The multi-step layer is pure compute on the same lattice. Verify it the same way as the gate: read the printed test line, don't take our word.

```
cd packages/core && node --test 2>&1 | grep -iE "compose|taint|poison|prooftree|autonomy|read.?back|lead"
```
**What to check is present and passing** (these are the invariants, not vanity tests):
- **Composition PASS** — a step whose destination is licensed by an **earlier step's structured, surfaced tool-output** passes ("email the lead you found"). This is the `prior_step` source at `surfaced:true` acting rank-4-equivalent — a tool result read back to the user is a legitimate destination, like a card tap.
- **Taint sink-invariant** — the single most important test in the layer: **no tainted value ever reaches a routing sink.** A value read from free content (a `CONTENT_READ` output) is tainted; taint **propagates** to anything derived from it; a plan step that puts a tainted value in a destination/amount slot **blocks** ("pay the address in this email"). The test asserts the invariant holds even when the tainted value travels through intermediate steps — you cannot launder it.
- **Poison propagation** — a step that `dependsOn` a held/blocked step is itself `deferred`. Assert there is **no green node downstream of a hole**.
- **Autonomy policy table** — `(level × node-verdict) → auto_run | hold | block` is a pure lookup, no model, no clock. The table is data; the test enumerates the grid.

**Why "no AI grading AI" survives the jump to plans:** `verifyPlan(plan, store)` reads no clock and no ambient state, so a `ProofTree` is a deterministic function of its inputs — the same plan verifies to byte-identical nodes every time, and every node's verdict is one of the five gate codes or a plan-layer taint/poison verdict, each a set/equality check. There is nowhere for a model to enter the decision, at one step or forty.

---

## What is NOT proven here (so you don't have to catch us)
- **The injection firewall / taint firewall live inside VoiceOS.** They run deterministically in the harness; running in-app needs one field (`currentTranscript`) threaded into the tool context — a seam, not a rewrite. At zero-mod the subprocess sees only `{name, arguments}`.
- **A clean-call false-block rate.** n=5 is an anecdote. Needs live capture.
- **A measured drift rate.** `input_json` is null → proxy only, until live capture exists.
- **The plan demo is a scripted-but-real plan.** The *verification* (every gate verdict, every taint label, the proof-tree) is real and live; the 40-step *plan itself* is scripted — we don't build the inbox-reading agent, that's their model. We say that in the room before the demo runs.
- **ASR-mishear.** Out of scope by construction — Preflight grounds what was transcribed; it does not second-guess the transcription.
