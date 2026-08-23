# PREFLIGHT — NORMATIVE SPEC (Phase 1 lock)

Rendered from `docs/SPEC-v4.md` §1–§22 under the G0 amendments
(`docs/decisions/2026-08-21-g0-approved-with-amendments.md`). The key words MUST, MUST NOT,
SHOULD, SHOULD NOT, and MAY are to be interpreted as described in RFC 2119. Statements are
numbered S<v4-section>.<n>. SPEC-v4 §23–§32 (metrics, positioning, narrative) are
non-normative and are not rendered here; their claims are governed by §0 below.

Status vocabulary (per `docs/COMPLETENESS.md`): LIVE · PROVEN-IN-HARNESS · MODELED ·
SPECIFIED-ONLY. A status marks what is demonstrated, never what the norm requires — every
statement below is binding on the implementation regardless of its current status.

---

## §0 Claims discipline (preamble — binding on every document, demo, and utterance in this program)

- S0.1 "Production", wherever it appears in this program, means **production for the author
  (Rithvik)**: his own Slack integration at `/Users/rithvik/universal-voiceos-oauth`, a
  personal project running against the VoiceOS platform. It is NOT part of VoiceOS's
  codebase, not merged, not shipped to VoiceOS's users, not official. Every use of
  "production", "live", or "shipped" MUST be readable only this way.
- S0.2 Every status claim (a number, a "works today", a "caught X/Y") MUST trace to a row in
  `docs/CLAIMS.md`. A claim with no CLAIMS row MUST NOT be made.
- S0.3 Always-stop violations (work halts until corrected): (a) any claim unsupported by
  evidence; (b) any claim ambiguous between Rithvik's work and VoiceOS's; (c) any framing
  positioning the Slack integration as part of VoiceOS's product.
- S0.4 Anything not measured MUST be stated as UNMEASURED, in caps. Anything not built MUST
  be marked PLANNED / SPECIFIED-ONLY. Corpus results MUST name their corpus (§18).

---

## §1 The provenance type system — Status: LIVE (v3 gate, Slack write tools)

- S1.1 Every parameter of every outgoing tool call MUST, before dispatch, either resolve to
  exactly one provenance rank — 4 transcript · 3 prior tool output · 2 known state ·
  1 screen/ambient — or be classified **ungrounded**. There is no fifth source and no
  unranked pass-through.
- S1.2 Every tool contract (§20) MUST declare, per parameter, a class (routing | content) and
  for routing parameters a minimum rank. A parameter satisfies its minimum rank `r` if and
  only if at least one recorded source of rank ≥ r licenses the parameter's exact value
  (byte-equal after the single fixed normalization of §14).
- S1.3 Tier 3 routing parameters MUST carry rank ≥ 3, further restricted by S11.2 for
  destination/amount/permission slots.
- S1.4 A call containing an ungrounded parameter MUST be blocked pre-dispatch with a machine
  error code and a human card. The gate MUST NOT guess, substitute, or silently repair a
  value outside the repair ladder of §4.
- S1.5 Rank assignment MUST be a total, deterministic function of recorded sources. The gate
  MUST NOT use confidence scores, tunable thresholds, or model judgments anywhere in rank
  determination or in any admit/block decision.

## §2 Routing vs content; taint — Status: split LIVE; taint MODELED (target)

- S2.1 Every parameter MUST be declared routing (selects targets, times, magnitudes,
  permissions) or content (what is said). No parameter may be both or neither.
- S2.2 Content parameters MUST NOT be blocked on provenance grounds. Tier 3 content MUST be
  surfaced in the editable composer before Send.
- S2.3 Every content span derived from tool output MUST carry a taint bit recording its
  origin id. Taint MUST propagate structurally through copy, concatenation, and template
  fill. Taint is a bit on a span; it MUST NOT be set or cleared by any model judgment.
- S2.4 **No-promotion.** A value whose only provenance is appearance inside content (drafted
  or tool-read) MUST NOT populate any routing slot. Routing slots MUST read only from the
  routing-eligible set: transcript spans, structural tool-output referents, known state,
  and card taps.
- S2.5 When tainted content originating from source A is bound for a Tier 3 outbound
  destination other than A, the composer MUST mark the tainted span visually and the
  confirm label MUST name both endpoints ("Send content from <A> to <B>").

## §3 Derived provenance — Status: time LIVE; generalization SPECIFIED-ONLY

- S3.1 A derived value verifies if and only if it equals, by recomputation, a closed-form
  function over grounded referents (t_base ± Δ for time; the analogous forms for
  quantities, ordinals, and set operations). Equality is exact; no tolerance.
- S3.2 Δ MUST be parsed by a fixed deterministic grammar. A missing base or a Δ the grammar
  rejects ("a bit later") MUST trigger a micro-card asking the one missing question —
  a question, never a block, never a guess.
- S3.3 No derivation step may invoke inference of any kind.

## §4 Repair before block — Status: rung 3 LIVE; rung 1 partial; rung 2 target LIVE

- S4.1 On a gate failure the implementation MUST attempt, in this exact order, stopping at
  the first success: (1) recompute per §3; (2) constrained re-emit; (3) ask via micro-card;
  only then block. Blocking without exhausting applicable rungs is a defect.
- S4.2 Constrained re-emit: the gate MUST re-invoke the model exactly once, with the
  offending parameter cleared and a closed candidate set injected containing only grounded,
  type-compatible referents for that slot. The re-emission MUST pass through the identical
  gate. Hard cap: one retry per call, no recursion, no widened set.
- S4.3 At most one micro-card MAY be shown per turn.
- S4.4 No repair rung may fire an irreversible action (§16) without its full Tier 3 card.

## §5 Tiers and the friction budget — Status: tiers LIVE; telemetry target corpus-counted

- S5.1 Every tool MUST declare exactly one tier: 1 safe read (auto-fire, no gate surface) ·
  2 reversible mutation (fire instantly, snapshot state, surface undo pill) · 3 destructive
  or outbound (full card carrying a verified payload; consent on top of correctness).
- S5.2 The gate MUST report cards per 100 turns and blocks per 100 turns, split by tool.
- S5.3 A tool whose card rate exceeds its budget MUST be treated as a schema defect in that
  tool (§21), never as acceptable cost.

## §6 The mutable transcript — Status: open; target PROVEN-IN-HARNESS ("fifty→fifteen" fixture)

- S6.1 Provenance MUST anchor to stable token ids in a monotonically versioned transcript.
  Anchoring to character offsets is forbidden.
- S6.2 Every grounded referent MUST record the transcript version it was proven against.
- S6.3 An ASR revision that touches any token backing a live grounding MUST invalidate that
  grounding and re-run the gate on the affected parameters only. The affected set is the
  set intersection of revised token ids and backing token ids.
- S6.4 Tier 3 dispatch MUST require every backing span to be finalized (past the decoder's
  stability horizon). Volatile spans MAY prepare a payload; they MUST NOT fire one.

## §7 Speculative gating — Status: SPECIFIED-ONLY

- S7.1 Grounding resolution and re-verification MAY run incrementally while the user speaks,
  amortized against speech time.
- S7.2 Latency MUST be reported as p50/p95/p99 **including** re-verify round trips; in-path
  arithmetic MAY additionally be reported, separately labeled.

## §8 Speculation contract — Status: **SPECIFIED-ONLY for this build** (G0 amendment 3: its property-test budget was reassigned to the §13 fixture)

- S8.1 Cancellation is advisory; **admission is authoritative**. No correctness property may
  depend on a cancellation succeeding; every speculative result is checked at admission.
- S8.2 Only tools declared `tier: 1` and `side_effect_free: true` (§20) are
  speculation-eligible, enforced at lint time. Speculative writes are forbidden by type.
- S8.3 Every speculative task MUST carry the token (session_id, utterance_id,
  transcript_version, referent_id, surface_id). A result is admitted to the grounding store
  if and only if its entire token is still current at arrival; otherwise it MUST be
  discarded, counted as waste, and never observed by the model.
- S8.4 Speculation MUST NOT start on a volatile span; eligibility uses the same stability
  horizon as S6.4.
- S8.5 Cancellation ladder, in order, best-effort at each rung: mark token superseded (always
  succeeds; the correctness rung) → signal abort to the owning MCP process → let an
  unabortable request complete, discard, record.
- S8.6 Barge-in invalidation scope follows the deterministic classification of S9.5.
- S8.7 Speculative traffic MUST run on a token bucket that is a strict fraction of each
  integration's rate limit, with its own concurrency cap, at the lowest rung of a
  three-level priority queue (Tier 3 re-verify > user-initiated Tier 1/2 > speculation),
  preemptible and shed first. Identical in-flight re-verifies MUST coalesce; results land
  in a short-TTL cache. Per-tool speculation MUST back off when its admitted-hit rate falls
  below threshold over a window; no hand-tuned constant ships in the binary.
- S8.8 Speculation is an optimization, never a dependency: speculative failures are silent
  and degrade to synchronous re-verify at dispatch. With speculation disabled, gate
  behavior MUST be byte-identical, only slower.

## §9 Barge-in and turn boundaries — Status: MODELED (decision table); session store LIVE

- S9.1 Barge-in during a Tier 3 card MUST cancel the pending call and MUST preserve the
  grounding store.
- S9.2 Barge-in during Tier 2 execution: if the new utterance parses, under a fixed
  deterministic negation/correction grammar, as a negation or correction of the executing
  action, the gate MUST fire that action's precomputed inverse (§16); otherwise it MUST
  leave the action and surface the undo pill. No model interpretation of "stop".
- S9.3 A new turn MUST NOT clear grounding. Grounding is session-scoped with TTL (§10);
  turns provide recency ordering only.
- S9.4 Mid-flight abort MUST be an explicit tool contract with a deterministic target.
- S9.5 **Barge-in classification** is deterministic, evaluated in this order, first match
  wins: (1) the focused integration/application changed → **app switch**: all cross-app
  speculation and screen licensing for the prior app dies immediately (the per-integration
  process boundary of §10 makes this exact); (2) the decoder attributes the new span to the
  current utterance id and the target integration is unchanged → **refinement**: grounding
  and speculation survive; only referents whose backing tokens were revised are
  invalidated and re-issued; (3) the decoder opens a new utterance id and the new span
  shares zero grounded referents with the prior utterance → **subject change**: the prior
  utterance's speculation set is superseded in one operation; grounding store persists per
  S9.3; (4) otherwise (new utterance id, shared referents) → treated as refinement per
  rule (2). No semantic similarity signal may participate in this classification.

## §10 Grounding lifecycles — Status: store+recency LIVE; TTL target PROVEN-IN-HARNESS; aliases SPECIFIED-ONLY

- S10.1 Every integration MUST run as its own MCP process. Cross-app referent leakage MUST be
  impossible by process boundary, not prevented by a check.
- S10.2 Every referent MUST carry a timestamp and a TTL (default ≈30 min). An expired
  referent MUST be demoted to the re-verify path — one API call re-proves it before any
  Tier 3 action rides on it. Stale MUST NOT mean blocked; stale means re-proven.
- S10.3 **Referent Resolution Procedure (RRP)** — the single procedure for binding a spoken
  descriptor (including bare deictics: "that", "it") to a referent. Inputs: the slot
  (class, type, tier, min_rank), the descriptor span, the grounding-store snapshot, the
  licensed screen ordering (§12–§13), the clock. Steps, in order:
  (a) C := referents type-compatible with the slot with rank ≥ min_rank, live or
  stale-flagged (S10.2); if C is empty → ungrounded path (§4).
  (b) If the descriptor is non-deictic: keep exact matches under the fixed normalization of
  §14; exactly one → RESOLVED; zero → fuzzy stage (§14, card-only); two or more → (c).
  (c) Order candidates by, in priority: licensed screen ordering (present only per
  §12–§13), then recency (most recent first), then stable referent id (deterministic
  final tie-break for display order only).
  (d) If the ordering yields a unique top candidate AND auto-selection is not disabled for
  this turn (disabled by: any fuzzy-stage candidate at top (§14), or a surface transition
  during the utterance for Tier 2/3 slots (§13)) → RESOLVED(top).
  (e) Otherwise → two-option disambiguation card (§14), top two in (c)-order, difference
  highlighted. The gate MUST NOT silently bind the older of two comparably-ranked live
  candidates, and MUST NOT silently bind on a tie.
- S10.4 A disambiguation-card resolution MAY be stored as a user-scoped grounded alias.
  Aliases MUST only be created by an explicit human tap; they MUST NOT be learned from
  tool output or screen context (else injection gains a persistent write channel).

## §11 The injection firewall — Status: rank-gating LIVE; transcript-span rule on send path target LIVE (Act 1)

- S11.1 Reading tool content grounds only its **structural referents** (ids, timestamps,
  channels, names as directory entries) at rank 3. Free text inside a read payload is
  content (§2), is never a referent, and MUST NOT enter the routing-eligible set.
- S11.2 A Tier 3 destination, amount, or permission slot MUST be licensed by a transcript
  span: the value was literally spoken, or a spoken deictic/descriptor span resolved to it
  via the RRP (S10.3), or the user explicitly tapped it on a card. A value extracted from
  inside read content has no such span and is therefore structurally unroutable —
  regardless of what the model emits, without any attack detection.
- S11.3 The firewall MUST NOT depend on any classifier, detector, or pattern match over
  content. There is nothing to fool: compliance with an injected instruction fails as a
  type error at the parameter level.

## §12 The screen boundary — Status: SPECIFIED-ONLY (no screen surface in the demo path)

- S12.1 Screen context MAY only **rank** candidates already licensed by transcript or tool
  output. Screen context MUST NOT introduce a value into any slot.
- S12.2 Screen evidence alone is never sufficient grounding for a Tier 3 action (send,
  delete, payment).

## §13 Screen drift — Status: carries **exactly one PROVEN-IN-HARNESS fixture** (G0 amendment 3: surface transition mid-utterance → screen evidence invalidated → wrong end-time blocked; simulated surface buffer against the real gate, labeled as such). All other §13 behavior: SPECIFIED-ONLY.

- S13.1 A deictic token resolves against screen state **at the token's own timestamp**, never
  at dispatch. The observation used is the one with the greatest capture time ≤ the
  deictic token's timestamp in the ring buffer; if none exists in the window, screen
  contributes zero ordering.
- S13.2 Surface identity is the composite key (application id, window id, document/tab id)
  plus a content hash of the visible view state. Observations MUST be captured on
  user-attributed focus and navigation events plus a low-rate poll, stored as diffs in a
  bounded ring buffer covering ≈ the last 10 seconds. A **transition** is a change in the
  composite id; a hash-only change is within-surface (S13.4). Content-similarity
  heuristics MUST NOT be used to detect or deny transitions.
- S13.3 **Invalidate, never re-point.** If the surface id changes between the deictic token
  and finalization, screen evidence for that turn is demoted to rank 0 and contributes
  nothing. It MUST NOT be re-pointed at the new surface. Ranking falls back to transcript
  and tool-output evidence; surviving ambiguity goes to the card (S10.3e).
- S13.4 Within-surface change is partial: a candidate element survives if and only if its
  accessibility node identity and content hash are both stable; it is dropped if it left
  the tree or its content changed. Scrolling alone MUST NOT invalidate.
- S13.5 Any surface transition during the utterance MUST disable screen-derived
  auto-selection for Tier 2 and Tier 3 slots for that turn (RRP step d), even where screen
  evidence still orders. Worst-case outcome of drift is a good candidate sorted second —
  one tap — never a silent route.
- S13.6 Only user-attributed focus changes refresh the licensed surface. Programmatic focus
  changes, self-navigating pages, and popups MUST be ignored for grounding purposes.
- S13.7 Absent evidence is absent, not negative: a missing, late, or empty accessibility tree
  contributes zero ordering and MUST NOT count against any candidate. Two visible surfaces
  with no separating focus signal contribute zero ordering.
- S13.8 The implementation MUST record surface-transition rate during utterances and the
  resulting screen-ranking invalidation rate.

## §14 Entity collision and rescue-only fuzzy matching — Status: LIVE

- S14.1 One fixed normalization function (defined once, in `packages/core`, and used
  everywhere a string is compared for grounding) canonicalizes descriptors and candidate
  names before any comparison. **Exact match** means byte equality after this
  normalization and nothing looser.
- S14.2 **Matching decision procedure.** Inputs: normalized descriptor `s`, candidate pool
  from RRP step (a). In order: (1) exact matches; exactly one → eligible for auto-route
  (subject to rank, tier, and S13.5 rules); two or more → RRP step (c) ranking, card on
  non-unique top. (2) If zero exact matches and `len(s) ≤ 4` characters: the fuzzy stage
  MUST NOT run — no phonetic and no edit-distance tolerance of any kind (Dan/Don can never
  collide); outcome is a card listing the RRP-ordered pool, or the ungrounded path if the
  pool is empty. (3) If zero exact matches and `len(s) > 4`: fuzzy candidates are those
  within the fixed phonetic-equivalence or edit-distance bounds declared in `packages/core`
  constants (never tuned at runtime).
- S14.3 A fuzzy match MUST only populate the disambiguation card. It MUST NOT auto-route any
  routing slot in any tier, even when it is the unique fuzzy candidate. Drift costs one
  tap, never a wrong send.
- S14.4 The disambiguation card MUST present two options highlighting the **difference**
  between them, not restating both in full.

## §15 Magnitude and number guarding — Status: hand-listed twins + label echo LIVE; magnitude MODELED; phoneme matrix + units SPECIFIED-ONLY

- S15.1 Acoustic confusion sets MUST be generated from a phoneme confusion matrix (extending
  to dates, ordinals, and non-English locales), not hand-enumerated. (The v3 hand-listed
  twins 15/50, 13/30, 14/40, 16/60, 17/70, 18/80, 19/90 remain valid members.)
- S15.2 A numeric value whose spoken form omitted its unit (dollars/cents, minutes/hours,
  AM/PM) MUST be treated as ambiguous and resolved by micro-card, never defaulted silently.
- S15.3 A value that is an order-of-magnitude outlier against the stored distribution of the
  user's own history for that tool MUST render highlighted. The comparison is against a
  stored distribution; it MUST NOT be a model judgment, and it highlights — it does not
  block.
- S15.4 Any risky value MUST be echoed inside the confirm button label itself ("Send $50").
- S15.5 Word-level ASR confidence gating is out of scope for the gate core: it requires a
  platform signal that is not exposed (the adoption ask). The gate MUST NOT fabricate or
  estimate a confidence signal.

## §16 The zero-inference undo engine — Status: schedule undo handle LIVE (handle only — the `slack_undo_scheduled` tool is unbuilt); classes + pairing target PROVEN-IN-HARNESS

- S16.1 Every Tier 2 and Tier 3 tool MUST declare its deterministic inverse at build time in
  its contract (§20), or declare `reversibility: "irreversible"`.
- S16.2 The gate MUST synthesize the exact inverse call at fire time, before the action runs.
  Undo replays that precomputed call. No inference may occur anywhere in the undo path.
- S16.3 Every Tier 2/3 tool MUST declare exactly one reversibility class: **reversible**
  (true inverse; undo pill), **compensable** (mitigation only; pill labeled as mitigation;
  validity window enforced — an expired window disables the pill visibly, never fails
  silently), or **irreversible** (no pill; full Tier 3 card unconditionally; no repair
  path may fire it silently, per S4.4).

## §17 Provenance receipts — Status: open; target LIVE-lite on the skeleton path

- S17.1 Every fired call MUST emit a receipt: a JSON map from each parameter to its exact
  source — stable token ids, tool-output ids, state keys, or derivation expressions.
- S17.2 Receipts MUST store span references and salted hashes by default, not raw transcript
  text. Raw-text receipts are opt-in per workspace. Retention MUST be bounded and
  configurable. Cryptographic signing is roadmap (SPECIFIED-ONLY) and MUST NOT be claimed.

## §18 The self-growing eval and the three-corpus split — Status: harness + 50-case self-generated corpus LIVE; blind + replay NON-NEGOTIABLE targets

- S18.1 Every blocked call MUST serialize into an anonymized fixture (context state, drifted
  parameter, catching rule) feeding the eval harness.
- S18.2 The eval corpus MUST be maintained as three disjoint corpora: **self-generated**
  (regression), **held-out adversarial** (authored by someone who has not seen the gate
  implementation, scored blind), and **replay** (real reported failures reconstructed as
  fixtures).
- S18.3 Catch rate and false-block rate MUST be reported per corpus. Blending corpora into a
  single number is forbidden.

## §19 Failure modes of the gate itself — Status: no-dep/no-LLM LIVE; shadow NON-NEGOTIABLE target; warn/enforce + kill switch SPECIFIED-ONLY

- S19.1 Rollout MUST be staged `shadow` → `warn` → `enforce`. In shadow the gate observes and
  logs what it would have blocked and changes nothing.
- S19.2 On an internal gate error: Tier 1 and Tier 2 MUST fail open; Tier 3 MUST fail closed.
- S19.3 A per-tool kill switch MUST exist in runtime config; one bad contract MUST NOT take
  down the agent.
- S19.4 The gate core MUST have zero network dependencies, zero runtime dependencies, and
  zero LLM calls anywhere in its decision path.

## §20 Declarative tool contracts — Status: format drafted; target LIVE-lite (Slack tools annotated + local lint)

- S20.1 Provenance requirements MUST live as annotations on the tool's JSON schema — per
  parameter: `provenance` (routing|content), `min_rank`, `taint`, `derivable_from`,
  `reversible_by`; per tool: `tier`, `side_effect_free`, `inverse`, `reversibility`,
  `inverse_window_s` — never as logic inside gate code.
- S20.2 A lint pass MUST fail CI on any Tier 2 or Tier 3 write tool with an unannotated
  parameter, or with a missing `inverse` unless `reversibility: "irreversible"` is
  declared.
- S20.3 Annotation coverage MUST be computed and reported as a number.

## §21 The gate as schema linter — Status: open; target LIVE-lite over shadow/replay output

- S21.1 Receipts MUST record which parameter drifted, so drift clusters by (tool, parameter).
- S21.2 The gate MUST emit a ranked list of the integration surfaces (tool + parameter) most
  responsible for wrong actions.

## §22 Provenance as an MCP-level annotation — Status: SPECIFIED-ONLY (draft RFC only if buffer allows)

- S22.1 The §20 annotation format MUST remain expressible as a host-neutral MCP extension
  (`provenance` on parameter schemas; `tier` and `inverse` on tools), with nothing
  VoiceOS-specific in the annotation vocabulary.
- S22.2 For this build the RFC is a document deliverable at most. No implementation work
  beyond S22.1's compatibility constraint is in scope (SCOPE veto applies).
