# RESUME — open this tab cold, start here
*Kept current so Rithvik can switch to this session with zero re-briefing. Last updated 2026-08-22 (early), Phase 3 complete.*

## Where we are in one breath
This is the **Pre-Verification (Preflight) lane.** The OAuth lane runs in a separate session on `~/universal-voiceos-oauth`; the two repos are independent (copy-freely, no cross-writing). I own `~/preflight` and drive it to the **Sunday Aug 23, 1:00 PM, Frontier Tower SF** visit. **Kai (rigor judge) is there 1:00–5:30 only** → the verification/rigor story front-loads into that window.

## What's DONE (Phases 0–3, all verified this build)
- **Program spine:** `~/preflight/` repo, 21 veto-armed agent defs, docs (SPEC, INVARIANTS, THREATMODEL, CLAIMS, COMPLETENESS, briefs G0/G1G2/G3).
- **SPEC.md** locked (RFC 2119, 94 MUSTs, ownership rule as §0: my Slack integration is MY personal project, "production" = production for me, never part of VoiceOS's product).
- **packages/core** — provenance lattice + routing/content split + S11.2 transcript-span licensing (all 3 arms incl. S10.3 RRP). 16/16 tests, zero deps, 7.1µs.
- **packages/contracts** — §20 annotation format + CI lint, 100% write-tool coverage, 13/13.
- **packages/eval** — 3 separate corpora + §18 self-growing fixture generator, 20/20.
- **Blind corpus (40, spec-only, pre-committed)** caught 5 false-blocks on first run → fixed via the spec'd RRP arm → **5/5→1/5**, injection intact. THE rigor-half story.
- **Replay corpus** 5/5 caught (their community bugs); **§13 screen-drift fixture** proves the R1 calendar bug catch (real gate, simulated surface buffer).
- **vendor/uvo** — frozen snapshot of the OAuth repo @19d706b, re-verified 427/427 + eval green FROM the snapshot. The Sunday demo runs off THIS, so the OAuth session can evolve freely.
- **FOUNDER-BRIEF.md** — 20 likely questions + 4 thin-ice + 10-sentence crib, ready for rehearsal.

## What's LEFT (the Saturday final wave — needs your "go")
1. **DEMO pod** — three-act stage script + rehearsal (Act 1 injection block, Act 2 drift+repair, Act 3 replay/blind story + per-tool offender ranking).
2. **B38 fix** — the one remaining blind false-block (tier-aware min-rank; low-harm, false-blocks a read only; ~1-file).
3. **README/quickstart** executed from a clean checkout.
Then G4+G5 (blind number + which numbers lead) and G6 (dress rehearsal).

## Open items that are YOURS (not build work)
- Deployed-app surface is FROZEN through Sunday (the demo runs against it) — no re-promotes/config/keychain edits.
- Slack app **Public Distribution toggle** still pending (hard gate before any share link works on their workspace).
- Fresh-state end-to-end test: script given, NOT yet run by you.
- Carry the honest LinkedIn/Instagram gate one-liner (Arav claimed both; both partner-gated).
- ⚠️ Demo rule: don't invite a "paste a raw channel id" live attack — that path isn't closed in the deployed app yet (fixed in core, handed to OAuth lane).

## If you paste new Preflight docs
I already hold the canonical pair (docs/SPEC-v4.md + docs/KICKOFF.md) and built against them. If what you paste is NEWER: I diff new-vs-built, keep everything already built (no restart), produce a grounded gap analysis + waved plan, present it simply, and wait for your explicit "go" before firing any build. If it's the same v4, I'll say so rather than churn.

## The clean-start question
**"Where should we start — the Saturday final wave (demo + B38 + README), or do you want to walk the demo first?"**
