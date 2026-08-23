# Decision: G0 approved with five amendments (Rithvik, 2026-08-21 night)

Compressed plan APPROVED: four touchpoints, proceed-on-recommendation, port-don't-rewrite, Sunday-LIVE set. Rule 14 stands (full v4 spec is the target; only the demonstrated subset flexes).

## Amendments (binding)
1. **Ownership correction (highest priority).** The Slack integration at /Users/rithvik/universal-voiceos-oauth is RITHVIK'S: a universal OAuth layer + Slack integration built as personal work. NOT part of the VoiceOS codebase, not merged, not shipped to their users, not official. It is the substrate that proves the gate; he returns to the OAuth work later. "Production" in every program doc = production FOR HIM, stated explicitly. All docs audited + edited (list in briefs/G1G2.md); §26 "Live today" reworded in docs/SPEC-v4.md AND ~/Downloads/preflight-v4.md.
2. **Doc fixes.** Spotify-misfire claim struck everywhere it was stated as fact (STATE.md, scope-ladder.md); calendar bug kept and cited as replay-corpus R1. §26 undo line now reads: handle exists at tools-t2.ts:904, slack_undo_scheduled unbuilt.
3. **§13 promoted to PROVEN-IN-HARNESS (one fixture).** Surface transition mid-utterance → screen evidence invalidated → wrong end-time blocked. Simulated surface buffer against the real gate, labeled as such. Budget from §8's property test → §8 drops to SPECIFIED-ONLY. Rationale: Act 3 leads with a bug we must demonstrate catching, not merely explain.
4. **Three new always-stop conditions** (total now seven): any claim unsupported by evidence · any claim ambiguous between Rithvik's work and VoiceOS's · any framing positioning his Slack integration as part of their product.
5. **Access check.** Determine whether VoiceOS's own Slack integration is accessible to us; report BEFORE Act 3 is finalized — it may change what leads.

## Rejected option
Running the six gates as written (idles the program; Phase 3 predictably unfinished by Sunday).
