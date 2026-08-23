# SCOPE LADDER — sequencing, the demonstrated/specified boundary, and the de-scope ladder
*Pod: SCOPE. Written Friday evening 2026-08-21. Deadline: Sunday 2026-08-23 (office visit, ~9am proposed, UNCONFIRMED).*
*Runway: Friday night + Saturday, minus Saturday's owed commitments (dress rehearsal, Slack workspace seeding, Rithvik's Slack-app distribution toggle + fresh-state E2E test, crib-sheet internalization). Planning budget: ≤ 20 hours of orchestrated agent time.*

Rule 14 restated because everything below hangs on it: **the spec never shrinks; the demo flexes.** Items move DOWN the ladder (LIVE → PROVEN-IN-HARNESS → MODELED → SPECIFIED-ONLY), never to "cut."

---

## A. The demonstrated/specified boundary, as of tonight

**Runs live right now** (v3 gate at `/Users/rithvik/universal-voiceos-oauth` — Rithvik's own integration, installed in his local VoiceOS app; not part of their product; 416 tests green, 50/50 drifts caught, 0/6 false blocks, 0.24ms mean):

- §1 provenance gate on every Slack write tool (four ranks, min-rank per parameter class, ungrounded → blocked pre-dispatch with machine code + human card)
- §2 routing/content split (split only — the v4 taint bit does NOT exist yet)
- §3 derived time (base ± delta verification for the "unresolvable time" family — time only, Slack only)
- §4 rung 3 of the repair ladder (ask-then-card via disambiguation cards; recompute partial; constrained re-emit NOT built)
- §5 three tiers with the schedule undo handle
- §14 ambiguity-as-data disambiguation cards; §15 hand-listed acoustic-twin sets (the v3 hardcode, English)
- §18 eval harness with the 50-case self-generated corpus
- §19 no-network/no-runtime-dep property of the gate itself

**Everything else is v4 addition = specified, not demonstrated.** The biggest deltas v4 adds: taint propagation (§2), the full repair ladder (§4.1–4.2), streaming/stable-token anchoring (§6–§7), the speculation contract (§8), turn semantics (§9), TTL demotion + aliases (§10), transcript-span enforcement that makes the injection demo a *type error on screen* (§11), the entire screen layer (§12–§13), generated confusion sets + magnitude sanity (§15), reversibility classes (§16), receipts (§17), the three-corpus split (§18), shadow mode (§19), declarative contracts + lint (§20–§21), the MCP RFC (§22), and the measurement program (§23–§25).

**ASSUMPTION flagged:** Act 3's "their own numbers" cannot run over VoiceOS's real logs — we do not have them. Act 3 runs shadow mode over the replay corpus (community-reported failures) and is labeled exactly that way in the room. This is honest and still lands: it catches bugs the founders already know are real.

---

## B. Build order, Phases 2–3, by load-bearing-ness for the Sunday room

Target artifact = the three-act demo (§27). Non-negotiables per §32 and the kickoff: **walking skeleton, shadow mode, blind corpus.** Port/wrap the v3 gate — no rewrites where the spec is unchanged.

| # | Work item | Serves | Budget | Sunday status it buys |
|---|---|---|---|---|
| 1 | **Walking skeleton** — `packages/core` wraps the v3 gate behind the platform-neutral interface; one tool (`send_message`), one drift family, transcript→gate→verdict→receipt→shadow log, one measured latency number | Everything; G2 | 4h | §1/§2/§5 LIVE in new shape |
| 2 | **Shadow mode + coverage counter + per-tool drift aggregation** | Act 3, §19, §21, §32.1 | 3h | §19 LIVE, §21 LIVE-lite |
| 3 | **Transcript-span enforcement on Tier 3 destination/amount slots + provenance-rank card copy** ("required: transcript · got: email body") | Act 1 — the attack | 2h | §11 LIVE |
| 4 | **Blind corpus** (REDTEAM-BLIND, spec-only, committed before first run) **+ replay corpus** (the Discord-reported calendar end-time bug as fixture R1; no Spotify case exists in sources — U8); per-corpus scoring | Act 3, §18, §32.3–4 | 3h | §18 LIVE numbers |
| 5 | **Schema annotations on all Slack write tools + lint script** (coverage = a number) | §20, §32.2 | 2h | §20 LIVE-lite (lint local, not CI) |
| 6 | **Constrained re-emit** (one retry, closed candidate set, hard cap) | Act 2 — "the recovery is the demo" | 2h | §4 LIVE |
| 7 | **Receipts** emitted on every gated call in the skeleton path | §17, enterprise story §29 | 1h | §17 LIVE-lite |
| 8 | **Stable-token anchoring + revision invalidation, fixture-driven** ("fifty→fifteen" replayed in harness) | §6 — the most defensible piece | 2h | §6 PROVEN-IN-HARNESS |
| 9 | Buffer: reversibility classes (§16), TTL demotion (§10), speculation admission-token property test (§8) | depth answers | 1h | PROVEN/MODELED as buffer allows |

Total: 20h. Items 1–4 are the spine; nothing below item 4 may displace them.

**Recommended Sunday statuses:**
- **LIVE:** §1, §2 (split), §3 (time), §4 (full ladder incl. re-emit), §5, §11, §14, §15 (v3 twins), §17 (skeleton path), §18 (three corpora, per-corpus numbers), §19 (shadow), §20 (annotations+lint), §21 (per-tool offender ranking), §23/§24 (WAR + honest table over corpora, labeled)
- **PROVEN-IN-HARNESS:** §6 (revision invalidation), §10 (TTL demotion), §16 (inverse pairs + classes)
- **MODELED:** §8 (speculation state machine + admission safety property on paper/test), §9 (turn-semantics decision table), §15.3 (magnitude sanity vs stored distribution)
- **SPECIFIED-ONLY:** §7, §12, §13, §15.1 phoneme matrix, §22 (RFC drafted if buffer allows), §25, plus all narrative sections (§26–§32 stay accurate as written)

---

## C. The de-scope ladder — strict fall-back order, with the sentence Rithvik says instead

Items fall ONE level in this order when time runs out. Fallbacks in ladder order are **pre-authorized at G0** — no new gate needed.

| Falls | From → To | The honest sentence in the room |
|---|---|---|
| 1st | §8 speculation property test → SPECIFIED-ONLY | "Speculation is specified with an admission-token safety property, and it's an optimization by construction — with it off, behavior is byte-identical and only slower. So it ships last, on purpose." |
| 2nd | §16 reversibility classes PROVEN → MODELED | "The three reversibility classes are specified per tool; the fire-time undo handle is already captured in my integration today (tools-t2.ts:904) — the tool that consumes it is a wiring step." |
| 3rd | §10 TTL demotion PROVEN → SPECIFIED-ONLY | "Stale referents demote to a re-verify, never to a block — it's a timestamp compare, specified, and the test is next on the board." |
| 4th | §17 receipts LIVE-lite → PROVEN-IN-HARNESS | "Every blocked call already serializes into a fixture; the full per-parameter receipt is emitted in the harness run I can show you right now." |
| 5th | §4.2 constrained re-emit LIVE → PROVEN-IN-HARNESS | "Live today the repair is the one-tap card; the constrained re-emit is built and tested in the harness with a hard one-retry cap — it's a wiring step, not a design step." |
| 6th | §6 revision invalidation PROVEN → MODELED | "Here is the exact bug it kills — the decoder says fifty at 0.6 seconds and fifteen at 1.3 — grounding anchors to stable token ids, and a revision invalidates by set intersection. The fixture is written; it hasn't run green yet." |
| 7th | §20 lint LIVE-lite → PROVEN (script exists, no CI wire) | "The lint runs locally against the Slack contract and fails on any unannotated write parameter; putting it in CI is an afternoon." |
| 8th | §21 offender ranking LIVE → MODELED | "Drift clusters by parameter name in the receipts — the aggregation query is written; here's the format of the ranked list it produces." |
| LAST | §11 transcript-span enforcement LIVE → PROVEN-IN-HARNESS | "The ungrounded-block fires live — you just watched it. The stricter transcript-span rule for injected content is enforced and green in the harness; it goes live in the integration this week." |

**Never fall:** walking skeleton, shadow mode, blind corpus (§32 non-negotiables), and Act 2 (it already runs on v3 machinery). If the ladder is exhausted and those are threatened, that is a genuine G-stop for Rithvik.

---

## D. Compressed gate calendar (proposal)

Six sequential stops do not fit in 40 wall-clock hours with Rithvik intermittently available. Merge to four touchpoints, two of them things he's doing anyway:

| Touchpoint | When | Contains | Rithvik's decision |
|---|---|---|---|
| **G0 (sync, tonight)** | Friday night, 10 min | Recon truth + this ladder + the pre-approvals below | Approve calendar + pre-approvals; confirm integration target and access |
| **G1+G2 (async brief)** | Posted Friday night; he reads whenever | Spec-lock summary (v4 → RFC-2119, no direction change) + skeleton shape + first shadow-output sample | "Is this the system I want to defend, and does the shadow output look right?" — answered async; build proceeds on defaults meanwhile |
| **G3 (sync, Sat midday)** | 10 min | Coverage number + first per-corpus catch rates | Continue vs. freeze-for-hardening; ladder position check |
| **G4+G5 (sync, Sat evening)** | 15 min | Blind number (whatever it is) + the honest numbers table | Which numbers lead the pitch; slide vs. work-in-progress framing |
| **G6 = the dress rehearsal** | Sat night (already owed) | Full three-act dry run; he presents, we attack | Final demo script + crib sheet locked |

**What Rithvik pre-approves at G0 to make this legal under Rule 10** (recorded in `docs/decisions/G0-preapprovals.md`):
1. This merged calendar.
2. **Proceed-on-recommendation default:** between touchpoints the program executes each brief's recommendation WITHOUT waiting, EXCEPT four always-stop conditions: (a) anything expanding the specified system beyond v4, (b) any change to a demo act, (c) any runtime dependency in the gate path, (d) any threat to a §32 non-negotiable. Those halt and wait, full stop.
3. The Sunday-live set (§B) and the de-scope ladder order (§C) — fallbacks in ladder order need no new gate.
4. Port-don't-rewrite: `packages/core` wraps the v3 gate from `universal-voiceos-oauth`.
5. Act 3 = shadow mode over the replay corpus, labeled as such (not VoiceOS's real logs).

Rule 10's spirit holds: every direction decision is still his — we've just moved the decisions to the front, where they're cheap, instead of scattering six idle-stops through a 40-hour window.
