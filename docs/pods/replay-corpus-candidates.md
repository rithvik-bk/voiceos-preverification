# REPLAY CORPUS CANDIDATES
*RECON, 2026-08-21. Local sources only: `~/voiceos-intel/07-discord-feedback-goldmine.md` (mined Discord export, dated quotes), `~/voiceos-intel/deep/20-audio-dictation.md`, `~/voiceos-intel/oauth-design/C1-browser-control-limits.md`, `~/voiceos-intel/01-integration-contract.md` §7, and the drift families in `/Users/rithvik/universal-voiceos-oauth/tools/preflight-eval.mjs`.*

**Honest count: 11 candidates = 5 verbatim-report + 6 reconstructed.** No padding: the task seed mentioned a Discord "Spotify misfire" — **no Spotify misfire exists in local sources** (logged as U8 in UNKNOWNS.md; do not cite it). The seed's "no confirmation card" detail is also not in the verbatim calendar report — the card-bypass mechanism is U9.

Fixture shape convention (proposed for `packages/eval/corpora/replay/`): `{ id, source, transcript_events[], session_grounding[], tool_call{name,args}, expected{verdict, code, blocked_write} }` — same stub-records-the-write catch criterion as preflight-eval.mjs.

---

## Verbatim-report cases (a real user or founder reported this, quoted in local intel)

### R1 — Calendar end-time ignores the on-screen range
- **Symptom (verbatim, 07-goldmine:38):** "calendar event end-time defaults to 1hr even when screen shows the range (screen inspection is on-demand)." Root cause verified in C1-browser-control-limits.md:55: screen access yields nothing the turn it is called, so any read-then-act runs on a stale frame — the model fills the end-time from its default, not from what the user saw.
- **Drift family:** `dropped_param` (a required derived value silently defaulted) with an `ungrounded_ref` flavor (the fill isn't backed by any grounded surface).
- **Fixture:** grounding store holds a screen-read event `{start: 2pm, end: 4pm}` from turn N-1 tagged surface=screen/version=stale; tool call `calendar_create_event{start: 2pm, end: 3pm}`; expected: BLOCK, code `ungrounded_value` (end-time matches no grounded referent and no transcript span).
- **Confidence:** **verbatim-report** (symptom) + verified root cause. The single best case we own — it is THEIR known bug, and the demo line writes itself.

### R2 — Models make up tool calls
- **Symptom (verbatim, 07-goldmine:25):** Gabe (POKE, publishes a live Beeper integration): "the tool selection actually makes a lot of sense. I run into this constantly where **models make up tool calls**."
- **Drift family:** maps across `misheard_target`/`dropped_param` — an invented call is by construction fully ungrounded.
- **Fixture:** empty/irrelevant session grounding; tool call whose every referent-bearing arg fails grounding; expected: BLOCK with the referent code, write never fired.
- **Confidence:** **verbatim-report** (recurring pain, no single incident transcript — fixture args are reconstructed).

### R3 — API key "saved" but not actually working
- **Symptom (verbatim, 07-goldmine:21):** "when I input the key it's not saving properly and/or getting called properly" (Gabe); hob1: "it doesnt work for me now either." Gabe's explicit ask: "make it really clear when the token is saved + allow us to run a connection test."
- **Drift family:** not parameter drift — a **precondition/verification** case (state the system claims vs state that is true). Belongs to the receipts/post-verify side (§17), or gate code `not_connected` fail-closed.
- **Fixture:** vault reports token present; stubbed provider rejects with auth failure; expected: gate surfaces `not_connected`-class card instead of firing the write blind.
- **Confidence:** **verbatim-report.**

### R4 — Action fired against an app that is not running
- **Symptom (verbatim, 07-goldmine:28):** hob1: "It also doesn't work when beeper isn't open... will see if we can get voiceos to start beeper in the background if it needs to call it."
- **Drift family:** precondition drift — the environment invariant backing the call is false; same class as §19 (failure modes of the gate's own dependencies).
- **Fixture:** tool contract declares `requires: app_running(beeper)`; stub reports app absent; expected: BLOCK/repair-card ("open Beeper?") before the write, not a downstream error.
- **Confidence:** **verbatim-report.**

### R5 — Mixed-language proper nouns transcribed wrong (JP/EN)
- **Symptom (verbatim, 07-goldmine:39 + root cause deep/20):** "JP transcription weak on mixed JP/EN proper nouns + punctuation"; deep/20 verifies the session is pinned to ONE Deepgram language code, so code-switching degrades structurally.
- **Drift family:** `misheard_target` — the canonical ASR source of a wrong name reaching a tool arg.
- **Fixture:** directory contains 田中/Tanaka; transcript token is a plausible mis-decode; expected: BLOCK `target_not_found` (or `ambiguous_target` with candidates when two close matches exist).
- **Confidence:** **verbatim-report** (symptom + verified mechanism; specific utterance reconstructed).

---

## Reconstructed cases (the five drift families already encoded in tools/preflight-eval.mjs, promoted to named replay fixtures, plus the money gate)

These are synthetic but not arbitrary — each family is "one of the five ways a voice pipeline actually gets a parameter wrong" (eval header), and each already has 10 measured fixtures catching at 100%:

### R6 — Misheard target (`misheard_target`)
Eval corpus: "eng backhand", "ing backend", "Priya Shama", "Arv Patel" against a workspace with `eng-backend`, Priya Sharma, Arav Patel. Expected `target_not_found`, no post. **Reconstructed** (measured 10/10 this session).

### R7 — Ambiguous target (`ambiguous_target`)
"Arav" matching both Arav Patel and Arav Kumar; "eng" matching two channels — must ask with candidates-as-data, never pick. Expected `ambiguous_target` + CandidateSummary list. **Reconstructed** (measured 10/10). Mirrors spec §14 "the wrong Alex" and demo Act 2 verbatim.

### R8 — Ungrounded reference (`ungrounded_ref`)
React to a timestamp with the right SHAPE (`17553xxxxx.000xxx`) that no read ever surfaced — "the failure mode a model produces when it is being helpful." Expected `ungrounded_message`. **Reconstructed** (measured 10/10). This is the same mechanism as R1's root cause, which is what makes R1 credible.

### R9 — Unresolvable time (`unresolvable_time`)
"Monday morning", "later today", "in a bit", a 2020 ISO instant, a raw epoch-millis string. Expected `ambiguous_time` / `time_in_past`. **Reconstructed** (measured 10/10).

### R10 — Dropped parameter (`dropped_param`)
Whitespace-only text, empty target, empty ts, unknown emoji glyph 🫠. Expected `missing_parameter` / `invalid_emoji` / `ungrounded_message`. **Reconstructed** (measured 10/10).

### R11 — Spoken-amount vs filled-amount mismatch (money magnitude)
- **Source:** the old Stripe build's keyless fail-closed `verify(said, amountDollars)` gate, documented as the platform's reference safety pattern (`01-integration-contract.md` §7: blocks if spoken $ and filled $ differ beyond $0.005 or are ambiguous; BLOCKED = successful catch). Maps to spec §15 magnitude guarding ("fifty" → "fifteen" is also the §6 revision example).
- **Fixture:** `said:"send fifty dollars"`, `amount: 15.00`; expected BLOCK, code `amount_mismatch`.
- **Confidence:** **reconstructed** (pattern is real and was demoed to the founders; no user-reported incident behind it).

---

## Ranking for the Sunday demo
R1 is the headline (their own known bug, verbatim, root-cause-verified, catchable by the existing grounding mechanism). R7 is the live-mic act (already measured). R2 is the quote that frames the whole layer ("models make up tool calls" — from the community's most credible third-party builder). R11 is the money moment. R3/R4 extend the story from parameter drift into verification/receipts if time allows.
