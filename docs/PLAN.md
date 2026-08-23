# PREFLIGHT — THE PLAN (reframed around "seen happen + move a real number")
*2026-08-22. Supersedes the prior plan in place. Grounded in docs/CEILING-SCAN.md + a live read of voiceos.db this session. Plan-first: nothing builds until Rithvik says go.*

## The problem with demoing a prevention layer (Rithvik's insight, and it's correct)
A gate that works is INVISIBLE. Clean calls fire; bad calls are stopped before anything happens. Demoed naively it looks like nothing happened — and Jonah said if he can't SEE it happen in voice, there's no point building it. So the entire deliverable is reframed around two requirements that sit ABOVE the architecture:
1. **SEEN HAPPEN** — a real failure, triggered live in the voice flow, visibly caught, with the assistant speaking the repair. Not a table of hypotheticals.
2. **MOVE A REAL NUMBER** — a before/after metric on REAL data that proves it's doing something. "Wrong actions: X → 0, on my own real usage."

Everything below serves those two. The v4 architecture is unchanged; this adds the demonstrability layer on top.

## What Preflight is (one paragraph, simple)
Before any voice action fires, Preflight checks that every routing parameter (who / where / when / how much) traces to something you actually said. If a value came from nowhere, from a misheard number, from the wrong person, or from text inside a message the agent read — it's caught BEFORE it fires, and the assistant asks a one-line spoken question to fix it. Deterministic, microseconds, no AI judging AI. Schema proves a value is a string; Preflight proves it's YOUR string.

## THE REAL DATA — what we actually have (verified in voiceos.db this session)
- 433 voice sessions · 233 turns, ALL with real transcripts · 128 real tool calls · **117 real (transcript → tool-call) pairs** — real usage, his own machine.
- **Args of past calls are NOT stored (`input_json` 128/128 NULL).** So there are two honest tiers of real number:

**Tier A — Historical groundability (from the 117 real pairs, no args needed):** for each real turn we have what the user SAID and what tool FIRED. We measure: how many real calls fired a tool that NEEDS a routing target when that target never appeared in the transcript. That is a real, honest signal that the problem exists in real usage — stated with its caveat (no args → this is "grounding was absent," a proxy, not "the exact value was wrong").

**Tier B — Forward capture (the true moved number, WITH args + ground truth):** Saturday, run the real VoiceOS with Preflight wrapping a tool in shadow mode; Rithvik speaks a real set of commands (clean + deliberately drifted — ground truth known because he's saying them). Captures every call WITH args. Produces the true numbers: catch rate on real drifts, false-block rate on real clean calls, latency — on real voice, real ASR, real tool calls.

**THE HEADLINE METRIC: Wrong-Action Rate (WAR) = wrong/unverifiable actions per 100 tool calls.** Without the gate: X (Tier A proxy on history; true rate in Tier B capture). With the gate: those are caught pre-fire → executed WAR ≈ 0, and the counter-metrics stay low (false-block rate, cards per 100). The number that MOVES on stage: executed wrong actions X → 0, added latency ~0.3ms on clean calls.

## THE DEMO — three beats, seen happen, with a live stats panel
1. **Clean call (the invisible 99%)** — speak a normal command, it fires instantly, panel logs "allowed, 0.3ms." Proves it's not a nag.
2. **The catch + spoken repair (the point)** — speak a real drift (a number twin, or an ambiguous name, or an injected destination). The assistant does NOT fire — it SPEAKS one line ("Dan Miller or Dan Roberts?" / "Fifty dollars — five-zero — to Dan, right?"). Rithvik answers in voice; the correct call fires. The panel ticks "caught: 1." THIS is the seen-happen moment.
3. **The real number (makes the invisible visible)** — a live stats panel + the real-data run: "on 117 of my own real voice actions, N were unverifiable; on a captured session of M real commands with K drifts, the gate caught K/K, false-blocked 0, at 0.3ms — WAR X→0." This is what stops it looking like nothing happened.

The stats panel is the answer to "it'll look like nothing is happening": every clean call, every catch, every microsecond, per tool, accumulating in real time and over the real dataset.

## JONAH'S THREE ASKS — each addressed
1. **Real edge cases seen happen** → docs/EDGE-CASES.md is a catalog where every case is REPRODUCIBLE: a script that makes that exact failure happen on the real system so Jonah can trigger it himself. His "$54.79→$54.99" is mapped honestly across the catch-line: value≠transcript = caught deterministically; misheard-at-mic = the ASR-confidence adoption ask.
2. **A rough draft to iterate** → everything is brought as reactable draft, not polished ship; the spoken-repair wording is his to shape.
3. **⭐ Error-handling UX (his crux)** → docs/VOICE-REPAIR-UX.md: the spoken-repair script library keyed to the gate's typed reason. Voice is the default surface, a card is the backup (only for long lists / destructive payloads); the repair is one breath in the same turn (gate runs in µs, no stall); silence on success. That directly answers "how does it surface without breaking the voice flow."

## Matches the original v4 plan
Architecture unchanged: provenance lattice, routing/content split, three tiers, injection firewall, repair ladder, zero-inference undo, receipts, self-growing eval — all intact and already built (core 16/16, contracts 13/13 @100%, eval 20/20, blind corpus 5/5→1/5, replay 5/5). This reframe is demonstrability + Jonah's asks layered on the same engine, plus the drop-in `withPreflight()` wrapper so it runs client-side with zero platform cooperation (per CEILING-SCAN).

## THE WAVES (revised; nothing fires before "go")
**Wave 1 — Make it real + measurable**
- The historical groundability measurement over the 117 real pairs → the first real number (Tier A). ~half a day, exact SQL/method defined.
- `withPreflight()` wrapper + shadow-mode capture harness (so Saturday's session records real calls with args).
- B38 fix (last false-block).

**Wave 2 — Seen happen + the moved number**
- The live stats panel (real-time + over the dataset).
- Saturday capture session (Tier B): real voice commands, ground truth, the true WAR move.
- The three-beat voice demo wired end to end.

**Wave 3 — Jonah's drafts + adversarial**
- docs/EDGE-CASES.md (reproducible) + docs/VOICE-REPAIR-UX.md (spoken-repair library) as review drafts.
- Red-team, blind rerun, per-corpus numbers.

**Wave 4 — Package + rehearsal**
- README, the adoption-ask one-pager (the 2 genuinely-locked signals), dress rehearsal + founder crib.

## Honest edges (say them, don't hide them)
- Historical number is a groundability proxy (no stored args); the true drift number comes from the Saturday capture.
- §4 auto-repair → in-product it's a one-tap candidate card (a handler can't re-invoke the model). Same safety.
- Two signals genuinely need VoiceOS (streaming token revisions, word-level ASR confidence) → the adoption ask, proven in harness.

## THE DEMO-RELIABILITY PROBLEM + THE TRUST SPINE (Rithvik, 2026-08-22 — load-bearing)
**Problem he caught:** modern ASR is good — say "$50" and it'll usually fire $50 correctly. So a LIVE "misheard number" demo is a gamble that may just work, leaving nothing to catch = demo collapses. Never stake the demo on making a good model fail on cue. Never fake a failure (honesty contract).
**Fix — lead with DETERMINISTIC catches that cannot accidentally work:**
1. **Injection case** (read-content carries an instruction → content-sourced routing target). Blocks 100% of the time regardless of ASR quality — it's not an ASR error, it's the provenance rule. THE reliable anchor.
2. **Ambiguity case** (two real Alexes / two Dans). Structurally forces a resolution every time — the ambiguity is real, not a misfire.
3. **Number/twin case = a REAL RECORDED misfire or explicit harness mode**, never a live gamble: "here's an actual transcript where ASR heard fifteen for fifty — watch it catch," or "let me feed the check directly: spoken fifty, action fifteen." Framed as showing the mechanism, honestly. The real-data panel proves misfires happen at a real rate in real usage.
**THE TRUST SPINE (the pitch's core argument — emphasize this above error-rate):** The biggest reason people don't use voice for real actions isn't capability — it's TRUST. Voice today is used for low-stakes things (dictation, search, reminders) because if it's wrong, who cares. Nobody says "pay my rent" or "wire the vendor" to a voice assistant, even though it CAN, because "probably right" isn't good enough when it's irreversible. The error rate doesn't even have to be high — it has to be unpredictable and uncatchable. One wrong transfer and you never use it again. Preflight changes the equation from "trust the model to be right" to "the model can be wrong and it still can't hurt you, because nothing fires that doesn't trace to what you said." THAT is what unlocks high-stakes voice — it lets VoiceOS graduate from "answer me" to "do things for me," which is the entire point of a voice agent and the whole path to a top-5 app. Preflight is not a bug-fix; it is the trust layer that makes agentic voice usable. The "$50 usually works" fact is a STRENGTH here: you don't hand your bank account to something right 95% of the time — you hand it to something that's right 95% and CAN'T be wrong the other 5%.

## 🦾 THE JARVIS FRAME (the founders' own north star — use their language)
The founders keep saying "Jarvis" and think huge. Frame Preflight as the FOUNDATION of the Jarvis vision, not a safety add-on:
- Jarvis is the goal: an assistant that DOES things, not just answers. The gap between Siri and Jarvis isn't intelligence — it's TRUST. You'd never let today's voice AI wire money or run your house; Tony lets Jarvis.
- Jarvis confirms the consequential stuff ("Sir, shall I…?") — that IS Preflight's voice-repair UX. Preflight makes VoiceOS behave like Jarvis: instant on the clear stuff, one spoken check on the consequential stuff, never something you didn't say.
- Without a trust layer, "Jarvis" is just a fast way to make expensive, irreversible mistakes. Preflight is the difference between a demo and something people let run their lives.
- The pitch line: "You can't sell the everything-assistant until people trust it with everything. Preflight is the trust layer that makes Jarvis real." Match their ambition — the trillion-dollar version is the assistant people trust with real actions; this unlocks it.

## ✅ THE VERIFIED REAL ANCHOR (docs/REAL-ANCHOR.md — confirmed against shipped bundle + config + voiceos.db)
**The real gap in THEIR code:** VoiceOS fires these with ZERO confirmation card and no check that params match what the user said — native OS actions (`set_volume`, `control_playback`, `open_app`, `edit_text`) via `getNativeActionToolDeclarations()` (main.deob.js:21708, `requiresConfirmation:![]`), **Reminders create/update** (TOOL_SPECS:22791, hardcoded false), un-carded custom tools, AND his own **Stripe money tools** (config-overridden to false). Real corroboration in his DB: native ×7, reminders ×3, a real time-drift transcript ("put an event at 9… no, 9 PM").
**HONESTY CORRECTION (do NOT claim otherwise):** Apple **Calendar and Notes writes DO card by default** (`writeRequiresConfirmation()`:18898, config `{}`→true). So the anchor is **native actions + Reminders + money tools**, NOT "Calendar fires uncarded." Claiming Calendar would be a false-done in the room.
**Deterministic + safe + provenance-shaped** — the no-card path fires every time (not an ASR gamble), it's real & reproducible, and the action runs on model-filled params with nothing tying them to the transcript.
**Rithvik's first test (run it himself NOW):** say *"Remind me to submit my history essay at 8 PM"* → open Reminders → item present, no confirmation ever shown = failure is real.
**Demo opener:** *"Remind me to finish my AP Calc BC homework at 11 PM tonight."* (real write, no card, safe). Instant backup: *"Set my volume to 20."*
**This is THE demo spine.** Preflight wraps these uncarded actions; the demo shows one firing unchecked today → then the same action with a drifted/injected param getting caught + a spoken confirm.
