# COMPLETENESS — every v4 spec section: live / proven-in-harness / modeled / open
*(SPEC-KEEPER owns. Seeded by SCOPE, Friday 2026-08-21 evening.)*

**Status vocabulary.** `live-today` = runs now in the v3 gate at `/Users/rithvik/universal-voiceos-oauth` (416 tests, 50/50 eval — Rithvik's own Slack integration, installed in his local VoiceOS app as a custom integration; not part of VoiceOS's product). `proven-in-harness` = green test/fixture, not in the live path. `modeled` = precise written model/decision table, no passing test yet. `open` = specified in v4 only. Sunday target per `docs/pods/scope-ladder.md`; fallbacks follow its ladder, never "cut."

| § | One-line content | Current status | Sunday target |
|---|---|---|---|
| 1 | Four-rank provenance type system; min-rank per parameter class; ungrounded = blocked pre-dispatch | **live-today** (Slack, every write tool) | LIVE (wrapped in `packages/core` skeleton) |
| 2 | Routing/content split + taint bit on content, promotion forbidden, cross-origin exfil flagged | split **live-today**; taint bit **open** | split LIVE; taint MODELED (propagation rules table) |
| 3 | Derived provenance: base ± delta arithmetic for time, quantities, ordinals, sets | time **live-today** (Slack); generalization **open** | time LIVE; generalization SPECIFIED-ONLY |
| 4 | Repair ladder: recompute → constrained re-emit (one retry, closed set) → ask-then-card | rung 3 **live-today** (cards); rung 1 partial; rung 2 **open** | full ladder LIVE (re-emit item 6 in build order) |
| 5 | Three tiers; friction as budgeted, measured quantity (cards/blocks per 100 turns) | tiers **live-today**; friction telemetry **open** | tiers LIVE; cards-per-100-turns counted over corpus runs |
| 6 | Mutable transcript: stable token ids, versioning, stability horizon, revision invalidation | **open** (v4's largest correctness gap; needs no live ASR to prove) | PROVEN-IN-HARNESS ("fifty→fifteen" fixture) |
| 7 | Speculative gating: grounding resolves during speech; honest p50/p95/p99 incl. re-verify | **open** | SPECIFIED-ONLY |
| 8 | Speculation contract: admission-authoritative tokens, cancellation ladder, backpressure, governor | **open** | SPECIFIED-ONLY (G0 amendment 3: its property-test budget was reassigned to the §13 fixture) |
| 9 | Barge-in and turn boundaries; grounding is session-scoped, not turn-scoped | **open** (session-scoped store itself is live) | MODELED (deterministic decision table) |
| 10 | Grounding lifecycles: process isolation, TTL demotion, recency binding, tap-only aliases | store+recency **live-today**; per-integration MCP process isolation live-by-construction; TTL + aliases **open** | store LIVE; TTL PROVEN-IN-HARNESS; aliases SPECIFIED-ONLY |
| 11 | Injection firewall: tool-read text can never populate a Tier 3 destination/amount; needs transcript span | rank-gating **live-today**; transcript-span rule on send path **open** (v3 §26 "this week" item) | LIVE — this is Act 1 of the demo; last item on the fall ladder |
| 12 | Screen boundary: screen ranks licensed candidates, never introduces values | **open** (no screen surface in our demo path) | SPECIFIED-ONLY |
| 13 | Screen drift: deixis at utterance time, surface-id ring buffer, invalidate-never-repoint, focus-theft rule | **proven-in-harness** (2026-08-21: tools/screen-drift-fixture.mjs + engine/test/screen-drift.test.ts — drift blocked by the REAL gate, stable case passes; suite 418 green) | **PROVEN-IN-HARNESS — one fixture** ✓ done (G0 amendment 3: surface transition mid-utterance → screen evidence invalidated → wrong end-time blocked; simulated surface buffer against the real gate, labeled as such). Act 3's headline (calendar bug R1) demands a demonstrated catch, not just an explanation |
| 14 | Entity collision; rescue-only fuzzy matching — populates card, never auto-routes; ≤4-char no tolerance | **live-today** (disambiguation cards + card-only fuzzy) | LIVE |
| 15 | Number guarding: generated confusion sets, unit disambiguation, magnitude sanity, confirm-label echo | v3 hand-listed twins + label echo **live-today**; phoneme matrix / units / magnitude **open** | twins LIVE; magnitude MODELED; phoneme matrix + units SPECIFIED-ONLY |
| 16 | Zero-inference undo: build-time inverses, fire-time synthesis, 3 reversibility classes, validity windows | schedule undo handle **live-today**; classes + formal pairing **open** | PROVEN-IN-HARNESS (inverse pairs + classes); falls 2nd → MODELED |
| 17 | Provenance receipts: per-parameter source map, privacy-first (hashes, span refs), signing on roadmap | **open** (blocked-call fixtures exist; no receipt format) | LIVE-lite (emitted on skeleton path); falls 4th → PROVEN-IN-HARNESS |
| 18 | Self-growing eval + three-corpus split: self-generated / blind-adversarial / replay, never blended | harness + 50-case self-generated **live-today**; blind + replay **open** | LIVE — blind corpus authored by isolated REDTEAM-BLIND, replay from Discord-reported misfires; per-corpus numbers. NON-NEGOTIABLE |
| 19 | Gate failure modes: shadow→warn→enforce, per-tier fail policy, kill switch, no deps/no network | no-dep/no-LLM property **live-today**; shadow mode + kill switch **open** | shadow LIVE with coverage counter (NON-NEGOTIABLE); warn/enforce staging + kill switch SPECIFIED-ONLY |
| 20 | Declarative tool contracts: provenance annotations on JSON schema + CI lint; coverage a number | **open** (format drafted in spec) | LIVE-lite (Slack tools annotated + local lint); falls 7th → no CI wire |
| 21 | Gate as schema linter: drift clusters by parameter name → ranked worst-offender tools | **open** | LIVE-lite (per-tool aggregation over shadow/replay output — feeds Act 3); falls 8th → MODELED |
| 22 | Provenance as MCP-level annotation: the RFC | **open** | SPECIFIED-ONLY (draft RFC if buffer allows) |
| 23 | WAR north-star metric + friction + recovery-rate counterweights | **open** (defined, unmeasured) | reported over corpus runs, labeled "corpus, not live traffic" |
| 24 | Honest numbers table: 4 real numbers vs UNMEASURED list | 4 numbers **live-today** (50/50, 0/6, 0.24ms, 415 tests); rest UNMEASURED | table regenerated per corpus at G4+G5; UNMEASURED stays UNMEASURED in caps |
| 25 | Cost hypothesis: small-model-gated vs big-model-ungated experiment | **open** (not run) | SPECIFIED-ONLY (a pitch point, stated as testable prediction) |
| 26 | Status narrative (live today / this week / roadmap) | accurate as of v3 | updated Sunday morning to match this table exactly |
| 27 | The three-act demo: attack, drift-with-recovery, their-own-numbers | Act 2 machinery **live-today**; Acts 1 & 3 **open** | LIVE — all three acts; Act 3 = shadow over replay corpus, labeled honestly |
| 28 | Adoption hook: per-token ASR confidence is the one ask of VoiceOS core | **open** (pitch content) | SPECIFIED-ONLY (in crib sheet + ask slide) |
| 29 | Commercial argument: receipts as the enterprise/procurement unlock | **open** (pitch content) | SPECIFIED-ONLY (strengthened by §17 LIVE-lite) |
| 30 | Known limits, stated plainly | current in spec | SPECIFIED-ONLY (kept current; read before the room) |
| 31 | Two-half verification story with Arav (pre + post, shared receipt format) | **open** (narrative) | SPECIFIED-ONLY (receipt format from §17 is the shared thread) |
| 32 | First-two-weeks plan: shadow live, annotation+lint, blind corpus, replay corpus | items 1–4 **open** tonight | items 1, 3, 4 LIVE by Sunday; item 2 LIVE-lite. NON-NEGOTIABLE SET |
