# @preflight/core

The gate and trust runtime — the heart of Preflight. Given a proposed voice-agent tool call, a
finalized transcript, and a grounding store of known targets, it decides **before the action fires**
whether every routing parameter (who / where / when / how-much) traces to a licensed source. Screen
and read-content can never license a routing destination — that is the injection firewall. It is
pure compute: **no LLM and no network in the check** (enforced by `test/enforcement.test.ts`),
deterministic (same input → same output), latency in microseconds. This is a clean, well-tested
**prototype**, not a production-deployed system.

## Files

| File | What it does |
|---|---|
| `index.ts` | Public API surface — re-exports every type and function below. |
| `provenance.ts` | The source-rank lattice: five `SourceKind`s ranked 0–4 (`transcript_span`=4 … `model_composed`=0) and `minRankFor(class)`, so `rank >= min` is a generic, checkable rule. |
| `transcript.ts` | Finalizes a static utterance into stable word-`span`s and attributes an argument value back to spoken spans (`attributeToTranscript`) — "did the user actually say these words". |
| `grounding.ts` | `GroundingStore`: the per-session registry of routing-eligible targets, each stamped with the `Source` that vouches for it (LRU-bounded; ported from the Slack v3 gate). |
| `resolve.ts` | Ported entity resolver — `normalizeLoose/Tight`, bounded `editDistance`, exact→normalized→substring ladder; 2+ matches = ambiguity, a miss returns real candidates as data, never a guess. |
| `licensing.ts` | The Referent Resolution Procedure (S10.3/S11.2 arm b): a Tier-3 slot is licensed when a *spoken descriptor* resolves to the emitted id, so speaking "dan" and emitting `U_DAN` passes without weakening the firewall. |
| `gate.ts` | **THE gate** (~470 LOC): `preflight`/`runGate`, the tool contracts, per-class routing/content gating, the transcript-present vs args-only degraded paths, and the receipt. |
| `misbinding.ts` | The cross-clause pairing check: segments the transcript at connectives and holds if two routing params trace to different clauses (`refund Dan $50 and Sarah $30` → `refund(Dan,$30)`). |
| `codes.ts` | The authoritative reason-code registry: wire code → canonical `PF_*` name → disposition (PASS/HOLD/BLOCK/SURFACE) → is-routing. |
| `receipt.ts` | `emitReceipt` — the pure `PreflightReceipt` (the seam a smart card renders, an audit trail stores, and a post-verifier consumes); `firedAt` is injected, never read from a clock. |
| `shadow.ts` | `shadowGate`/`ShadowLog` — observe-mode staging: runs the real gate, logs what *would* have blocked, never throws, never stops the call. |
| `block.ts` | `PreflightBlock` — the refusal error carrying a machine `code` and evidence `detail` (real candidates/limits). |
| `plan.ts` | Multi-step **prototype** types: `Plan`/`PlanStep`/`ProofTree` and the three composition rules (composition, taint, poison). |
| `compose.ts` | `verifyPlan` — the proof-tree composer: a topological walk that reuses `runGate` per node and threads the lattice across steps. |
| `taint.ts` | The taint firewall (information-flow control): a content-read value is tainted and may never reach a routing sink; taint propagates along derive edges. |
| `autonomy.ts` | The autonomy dial — a pure `(level × node-verdict) → action` policy table; raising the dial only relaxes the `pass` row, never `hold`/`block`. |

## Key exports

- **`runGate(call, contract, store) → Verdict`** — the catch-wrapped form: returns `{verdict:'pass', receipt}` or `{verdict:'block', code, detail}`.
- **`preflight(call, contract, store) → Receipt`** — the throwing form (throws `PreflightBlock` on refusal).
- **`verifyPlan(plan, transcript, opts) → ProofTree`** — the multi-step prototype: classifies every step `pass`/`hold`/`block`/`deferred` before any step fires.

Built-in contracts: `SEND_MESSAGE`, `THREAD_REPLY`, `REFUND`.

## Reason codes

| Wire code | `PF_*` name | Disposition |
|---|---|---|
| `provenance_mismatch` | `PF_INJECTION_ROUTING_FROM_CONTENT` | **BLOCK** (injection firewall) |
| `insufficient_provenance` | `PF_ROUTING_RANK_TOO_LOW` | **BLOCK** (min-rank firewall) |
| `amount_not_in_speech` | `PF_AMOUNT_NOT_IN_SPEECH` | HOLD |
| `misbound_param` | `PF_MISBOUND_PARAM` | HOLD |
| `ambiguous_target` | `PF_AMBIGUOUS_TARGET` | HOLD |
| `target_not_found` | `PF_UNGROUNDED_ROUTING_PARAM` | HOLD |
| `missing_parameter` | `PF_MISSING_PARAMETER` | HOLD |

## What it catches — and what it does not

Catches: model drift (a re-typed wrong value), injected/ungrounded destinations (content can never
license a routing destination), ambiguous targets, hallucinated targets the user never spoke,
amounts not in the spoken number-set (`54.99 ∉ {54.79}`), and cross-clause misbinding.

Does **not** catch a true **ASR mishear**: the gate grounds what was *transcribed*, so if the
transcript itself is wrong, this layer cannot see it — that is an ASR-confidence + read-back
problem, a different layer. There is deliberately no reason code for it.

The multi-step pieces (`plan`/`compose`/`taint`/`autonomy`) are a **prototype** that demonstrates
the idea; they are not wired into any shipping product. Preflight is **pre-verification only** —
post-verification is a separate lane.

## Run the tests / bench

```
cd packages/core
node --test          # 51 tests: 50 pass, 0 fail, 1 todo
npm run bench        # microsecond-latency measurement (bench/bench.ts)
```

The **1 todo** (`test/taint.test.ts`) is an honest, documented residual: an undeclared-taint-launder
(confused-deputy) case where a structured output copies a tainted value with no `derivedFrom` edge.
Pure pre-verification cannot catch it without executor dataflow; it is marked todo so the gap stays
visible rather than papered over.
