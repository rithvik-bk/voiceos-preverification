# STATE — Preflight build program
*Single source of truth. A fresh session resumes from this file alone.*

**Updated:** 2026-08-21 (program kickoff)
**Hard deadline:** Sunday 2026-08-23, 1:00 PM, Frontier Tower SF (LOCKED). Kai (rigor judge) there 1:00–5:30 only → front-load the verification story into that window; Jonah stays late for build-together.
**FRESH-START POINTER:** docs/RESUME.md is the clean onboarding doc — read it first if opening this session cold.
**Phase:** 3 COMPLETE (core built + first metrics). **Gate status:** G3 brief written (docs/briefs/G3.md). Blind corpus caught 5 false-blocks on first run; 4 fixed via the spec'd S10.3 RRP arm, 1 (B38, separate tier-lattice gap) open. Proceeding to Phase 4/6 wiring on recommendation unless overruled.

## Ground truth carried in from before this program
- The v3 gate ALREADY RUNS at `/Users/rithvik/universal-voiceos-oauth` — inside the author's own Slack integration — a personal project built and operated by Rithvik against the VoiceOS platform; NOT part of the VoiceOS codebase, not merged, not shipped to their users. Rithvik returns to the OAuth work later; right now the Slack integration is the SUBSTRATE that proves the gate. "Production" in every program doc means production FOR HIM. It provides: provenance gate on every write tool, grounding store, disambiguation cards, routing/content split, schedule undo handle, eval harness. 416 tests green (re-verified 2026-08-21 by RECON; was misquoted as 415), 50/50 drifts caught, 0/6 false blocks, 0.24ms mean. This program does NOT start from zero.
- Full VoiceOS platform intel: `~/voiceos-intel/` (read `00-MASTER-BRIEF.md` first). Confirmation-card dialect + widget bridge are byte-verified in `/Users/rithvik/universal-voiceos-oauth/docs/design/rehaul/`.
- Known platform failure reports (replay-corpus seeds): the VoiceOS community Discord calendar end-time bug (verbatim, verified stale-screen root cause — replay corpus R1 in docs/pods/replay-corpus-candidates.md). A "Spotify misfire" was never found in local sources (UNKNOWNS U8) and is not cited anywhere.

## Done
- Repo + docs skeleton; 21 subagent definitions with veto conditions (REDTEAM-BLIND isolation enforced in its definition).
- Phase 0 complete: RECON (recon-inventory.md, UNKNOWNS.md, replay-corpus-candidates.md — 11 candidates, 5 verbatim; §26 undo overclaim caught; Act-3 pivot to replay corpus; streaming = simulated decoder) + SCOPE (scope-ladder.md, COMPLETENESS.md §1–§32, compressed 4-touchpoint gate calendar).
- Fresh evidence run 2026-08-21: eval 50/50 caught / 0 false blocks / 0.24ms; npm test 418/418 (416 + 2 new §13 fixture tests).

## In flight
- Nothing. Program halted at G0.

## Blocked
- Everything, on Rithvik's G0 answer (docs/briefs/G0.md). The G0 ask: approve 4-touchpoint calendar + proceed-on-recommendation default (4 always-stop conditions) + port-don't-rewrite + SCOPE's Sunday-LIVE set.

## Next three actions
1. Rithvik answers G0.
2. If approved: Phase 1+2 merged — spec lock (SPEC.md, INVARIANTS.md, THREATMODEL.md, speculation model) + walking skeleton (one tool, one drift family, shadow mode, end to end) → async G1+G2 brief tonight.
3. Phase 3 pods Saturday per scope-ladder.md order.

## G0 DECISION (2026-08-21) — approved with five amendments
Compressed plan approved: four touchpoints, proceed-on-recommendation, port-don't-rewrite, Sunday-LIVE set. Rule 14 stands.
**SEVEN always-stop conditions** (original four + G0's three):
1. Any spec expansion. 2. Any demo-act change. 3. Any proposed runtime dependency. 4. Any non-negotiable red-team finding.
5. **Any claim found unsupported by evidence.** 6. **Any claim ambiguous between Rithvik's work and VoiceOS's.** 7. **Any framing that positions his Slack integration as part of their product.**
**Amendment 3: ✓ EXECUTED 2026-08-21 night** — §13 fixture PROVEN-IN-HARNESS: `node tools/screen-drift-fixture.mjs` in universal-voiceos-oauth (simulated surface buffer, REAL gate blocks the stale end-time via PreflightBlock/ungrounded_message; stable case passes). Additive-only; suite now 418/418 (416+2), eval 50/50 unchanged, typecheck clean. Pod doc: docs/pods/screen-drift-fixture.md. §8 property test dropped to SPECIFIED-ONLY as budgeted.
**Amendment 5:** RECON checking whether VoiceOS's own Slack integration is accessible to us; Act 3 is NOT final until answered.

## Repo split (2026-08-21 — CONFIRMED via the Universal OAuth session relaying Rithvik's ruling; consistent 2nd report)
A parallel session ("rithvik-ed") reports Rithvik assigned it exclusive ownership of ~/universal-voiceos-oauth (OAuth track); preflight stays here. Terms sent to the peer: the in-flight ACT-1 additive test finishes, then NO further preflight writes into that repo; reads stay fine; the repo is requested demo-frozen (integrations/slack/, engine/, tests) until after Sunday because it is the live demo evidence base (418 tests + eval). OAuth engine paths are theirs freely. Full deploy/config/keychain insight dump handed over.

**Split terms (final):** two repos, two lanes. ~/universal-voiceos-oauth = OAuth lane (theirs, exclusive). ~/preflight = pre-verification lane (ours, exclusive). Copy freely across, never cross-write. **Vendoring DONE 2026-08-21 ~17:45:** ~/universal-voiceos-oauth @19d706b (main) snapshotted to ~/preflight/vendor/uvo (git-init'd so the vault test's `git status` check runs). Re-verified FROM the snapshot: `npm test` 427/427, `preflight-eval.mjs` 0.25/0.31ms zero-LLM. CLAIMS repointed to vendor paths. ACT-1 was the last write into the OAuth repo — NO further preflight writes there. "unfrozen" sent to the OAuth session (deployed-app surface still off-limits through Sunday). **Surviving constraint (app-level, not repo):** the INSTALLED integration at ~/Library/Application Support/VoiceOS/custom-mcps/slack-connect/ + its config.json records + keychain entry must stay untouched until after Sunday — communicated to the OAuth session; deploys need a coordinated window.
