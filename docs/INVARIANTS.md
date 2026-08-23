# INVARIANTS (I1..I16) — Phase 1 lock

Each invariant: one sentence · the SPEC.md statements it enforces · the test that proves it ·
the failure mode if it breaks. Test status: **EXISTS** = green today in
`/Users/rithvik/universal-voiceos-oauth` (paths real, per RECON inventory);
**PLANNED** = named target in `packages/core` or `packages/eval`, not yet written.
Honesty rule: an invariant with only PLANNED tests is enforced by review until its test
lands; it MUST NOT be claimed as proven.

---

**I1 — Min-rank-per-tier lattice.** No parameter ever dispatches below its contract-declared
minimum provenance rank; ungrounded parameters block pre-dispatch with a machine code.
- Enforces: S1.1–S1.5, S5.1.
- Tests: EXISTS — `/Users/rithvik/universal-voiceos-oauth/engine/test/slack-integration.test.ts`
  ("blocks every injected parameter drift, and no correct call" — drives
  `tools/preflight-eval.mjs`, 50/50 blocked behaviorally: the write method is never called);
  EXISTS — `/Users/rithvik/universal-voiceos-oauth/engine/test/slack-t2.test.ts` (grounding
  wire T1→T2, `isGrounded`, `ungrounded_message` block). PLANNED —
  `packages/core/test/lattice.test.ts` case `rank-below-min-always-blocks` (property test over
  all rank×min_rank pairs).
- Failure mode: a hallucinated value fires as if grounded — the entire thesis is void.

**I2 — No promotion (content → routing).** A value whose only provenance is appearance inside
content never populates a routing slot.
- Enforces: S2.4, S11.1.
- Tests: PLANNED — `packages/core/test/promotion.test.ts` cases
  `mention-in-draft-never-becomes-recipient`, `url-in-body-never-becomes-destination`.
- Failure mode: injection or model drift launders a target through the message body; the
  firewall (§11) is bypassed from inside.

**I3 — Transcript-span requirement for Tier-3 destinations.** Every Tier-3 destination,
amount, or permission value is licensed by a transcript span (spoken, deictically resolved
via RRP, or card-tapped); tool-read text is structurally unroutable.
- Enforces: S11.1–S11.3, S1.3.
- Tests: PLANNED — `packages/core/test/transcript-span.test.ts` case
  `email-body-address-blocked-on-send-path` (demo Act 1; COMPLETENESS §11 target LIVE).
- Failure mode: indirect prompt injection routes ("invite evil@corp.com" complies); the
  no-detector security claim is false.

**I4 — Screen ranks, never introduces.** Screen evidence only orders candidates already
licensed by transcript or tool output, and alone never grounds a Tier-3 action.
- Enforces: S12.1–S12.2, S13.3.
- Tests: PLANNED — `packages/core/test/screen-rank.test.ts` cases
  `screen-only-candidate-never-enters-pool`, `screen-alone-insufficient-for-tier3`.
- Failure mode: ambient page text becomes intent — §11's attack rebuilt spatially.

**I5 — Fuzzy never auto-routes.** A fuzzy (phonetic/edit-distance) match only ever populates
the disambiguation card, in every tier, even when unique.
- Enforces: S14.2(3), S14.3.
- Tests: EXISTS (partial) — `/Users/rithvik/universal-voiceos-oauth/engine/test/slack-resolve.test.ts`
  ("returns both eng channels as candidates instead of flipping a coin" — ambiguity is data,
  never a pick) plus eval family misheard_target 10/10 blocked. PLANNED —
  `packages/core/test/fuzzy.test.ts` case `unique-fuzzy-candidate-still-cards`.
- Failure mode: "Kai"→"Kyle" ASR drift silently mis-routes a payload instead of costing one tap.

**I6 — ≤4-char no tolerance.** Descriptors of four characters or fewer get zero fuzzy
tolerance of any kind: exact match or card, nothing between.
- Enforces: S14.2(2).
- Tests: PLANNED — `packages/core/test/fuzzy.test.ts` cases `dan-don-never-collide`,
  `four-char-boundary-exact-only`.
- Failure mode: short-name collisions (Dan/Don) auto-route wrong recipients — the exact
  class the rule exists to kill.

**I7 — Tier-3 requires finalized spans.** No Tier-3 call dispatches while any backing
transcript span is still inside the decoder's stability horizon.
- Enforces: S6.4, S6.1–S6.3.
- Tests: PLANNED — `packages/core/test/revision.test.ts` cases
  `fifty-to-fifteen-revision-invalidates-and-regates` (the §6 harness fixture),
  `volatile-span-prepares-but-never-fires`.
- Failure mode: the gate certifies a parameter against words the user never said — a false
  guarantee, actively worse than no gate.

**I8 — Superseded result never admitted.** A speculative result whose token
(session, utterance, transcript_version, referent, surface) is no longer current is discarded
at admission and never observed by the model.
- Enforces: S8.1, S8.3. (§8 is SPECIFIED-ONLY this build per G0 amendment 3 — this test is
  deferred with it.)
- Tests: PLANNED — `packages/core/test/speculation-admission.test.ts` case
  `stale-token-result-discarded-and-counted`.
- Failure mode: a late response poisons the grounding store for a turn it does not belong
  to; a barge-in corrupts the next action.

**I9 — T1/T2 fail open, T3 fails closed.** An internal gate error never blocks a read or a
reversible mutation, and never allows a destructive/outbound call.
- Enforces: S19.1–S19.3.
- Tests: PLANNED — `packages/core/test/fail-policy.test.ts` cases
  `injected-gate-exception-t1-t2-passes`, `injected-gate-exception-t3-blocks`.
- Failure mode: open-on-T3 = the gate's own bug fires a wrong irreversible action;
  closed-on-T1 = the gate becomes the outage.

**I10 — Zero runtime deps / zero LLM in gate core.** The gate's decision path imports no
runtime dependency, makes no network call, and invokes no model.
- Enforces: S19.4, S1.5, S11.3.
- Tests: EXISTS (partial) — `tools/preflight-eval.mjs` in
  `/Users/rithvik/universal-voiceos-oauth` prints and asserts the no-LLM property (all checks
  string/clock arithmetic; RECON verified). PLANNED — `packages/core/test/zero-deps.test.ts`
  case `dependency-graph-of-core-is-empty` (walks the import graph; fails on any runtime dep,
  network module, or LLM client).
- Failure mode: gate availability stops being process availability; "deterministic,
  microseconds, no second hallucination surface" all silently expire.

**I11 — Per-corpus, never blended.** Catch and false-block rates are reported separately for
self-generated, held-out adversarial, and replay corpora; no blended number exists anywhere.
- Enforces: S18.2–S18.3, S0.2, S0.4.
- Tests: PLANNED — `packages/eval/test/reporting.test.ts` cases
  `report-refuses-blended-aggregate`, `every-number-carries-corpus-label`.
- Failure mode: a closed-world 100% masquerades as a real-world claim — the exact
  credibility hole §18 exists to close, and an always-stop violation (S0.3a).

**I12 — Undo is precomputed, zero inference.** The inverse call is synthesized at fire time
from the build-time contract and replayed verbatim; nothing in the undo path consults a model.
- Enforces: S16.1–S16.3, S9.2.
- Tests: PLANNED — `packages/core/test/undo.test.ts` cases
  `inverse-synthesized-before-execution`, `expired-window-disables-pill-visibly`,
  `irreversible-has-no-pill-and-full-card`. (Today only the schedule-undo *handle* exists —
  `integrations/slack/tools-t2.ts:904`; the consuming tool is unbuilt. Do not claim undo works.)
- Failure mode: "undo" becomes a second chance to hallucinate, aimed at live state.

**I13 — Taint propagation is structural.** The taint bit on tool-derived content spans
propagates through every copy/concat/template operation with no model judgment, and
cross-origin Tier-3 sends name both endpoints.
- Enforces: S2.3, S2.5.
- Tests: PLANNED — `packages/core/test/taint.test.ts` cases
  `taint-survives-concat-and-template`, `cross-origin-send-labels-both-endpoints`.
  (COMPLETENESS §2 target: taint MODELED — this test may land after Sunday; until then the
  invariant is design-review-enforced only.)
- Failure mode: injected content quietly exfiltrates data through a message body to a
  destination its source never touched.

**I14 — Surface transition invalidates, never re-points.** A surface-id change between a
deictic token and finalization demotes screen evidence to rank 0 and disables screen
auto-selection for Tier 2/3 that turn; the reference is never re-pointed at the new surface.
- Enforces: S13.1–S13.5.
- Tests: PLANNED — `packages/core/test/surface-drift.test.ts` case
  `transition-mid-utterance-invalidates-screen-and-blocks-wrong-end-time` — **the exactly-one
  PROVEN-IN-HARNESS fixture G0 amendment 3 assigns to §13** (simulated surface buffer against
  the real gate, labeled as such; replay-corpus R1, the calendar end-time bug, is its
  headline).
- Failure mode: an alt-tab mid-sentence silently redirects "this" to whatever won focus —
  the calendar-bug class ships unfixed.

**I15 — Repair ladder order with hard caps.** Recompute precedes re-emit precedes ask
precedes block; re-emit runs at most once against a closed grounded candidate set and
re-passes the identical gate; at most one card per turn; no rung fires an irreversible action.
- Enforces: S4.1–S4.4.
- Tests: PLANNED — `packages/core/test/repair.test.ts` cases `ladder-order-is-fixed`,
  `re-emit-capped-at-one-and-set-closed`, `one-card-per-turn`,
  `irreversible-never-fired-by-repair`.
- Failure mode: either the gate becomes a friction tax (block-first) or repair becomes an
  unbounded retry loop that eventually guesses.

**I16 — Aliases are tap-only.** A grounded alias is created only by an explicit human tap on
a disambiguation card, never learned from tool output or screen context.
- Enforces: S10.4.
- Tests: PLANNED — `packages/core/test/alias.test.ts` case
  `alias-write-rejected-unless-source-is-card-tap`.
- Failure mode: injection gains a persistent write channel into future routing decisions.
