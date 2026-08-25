# PREFLIGHT — The Trust Runtime for Autonomous Voice (build spec, for Rithvik's approval)
*2026-08-23. Nothing built yet. This is the jaw-drop version of the plan + proof it's buildable. Rithvik reads → approves → official agent workflows build. Efficiency-first.*

## THE REFRAME (why this is bigger than "proof-tree")
Proof-tree was the floor, not the ceiling. The deeper thing: **Preflight is a complete TRUST RUNTIME — the layer that changes what VoiceOS is *allowed to attempt*.** Not a verification feature bolted on; a named runtime that turns voice from "answer me" into "do everything," because for the first time nothing it does can betray you. The shock in the room is not a safety diagram — it's watching a voice agent **safely do a task no one on earth would trust a voice agent to do today**, live, and seeing exactly why it's safe.

## THE SYSTEM — five parts, one runtime
1. **The Gate** *(BUILT, 34/34)* — single-action provenance: every routing param traces to a licensed source; content can never license a destination.
2. **The Proof-Tree** — verify a whole autonomous PLAN before any step fires; provenance composes across steps (read-back licenses later steps); poison propagates.
3. **The Autonomy Dial** — flip from confirm-everything (Siri) to just-do-it-stop-only-when-unprovable (Jarvis). The runtime auto-runs grounded steps, holds only the flagged ones, re-verifies if the plan changes mid-run.
4. **The Taint Firewall** — injection defense that *scales with autonomy*: information-flow control (Denning 1976) — every value carries a source label, content-reads taint, and no tainted value may reach a routing sink. The more of your world the agent reads, the more this matters.
5. **The Receipt + Drift Map** — every action leaves an immutable receipt (the audit trail their DB literally cannot produce — `input_json` is NULL). Every held/blocked action becomes labeled data → a **live map of where their own agent drifts** + a growing annotation library. This is the flywheel/moat VoiceOS cannot build themselves.

## THE DEMO — "The Unlock" (shock first, mechanism second)
One screen. A real 40-step task: *"go through my inbox, find every lead, draft a personalized reply to each, message the right person, and email me a report."*

- **Without Preflight:** you'd never run this. On screen it pays a scammer address it read in an email, messages the wrong "John," over-refunds $54.99 instead of $54.79. Chaos. This is why voice is stuck at "send one Gmail."
- **With Preflight:** you flip the dial to **autonomous** and walk away. It runs all 40 steps, **holds exactly 3 times** (the injected recipient, the ambiguous John, the unspoken amount) with one spoken question each, fires **0 ungrounded actions**, and hands you the report + the receipt trail. The proof-tree lights up as it goes — 37 green, 3 held — so you *see* why you were safe to walk away.

The jaw-drop is the capability: **a voice agent just did your entire morning's work autonomously, and you trusted it — because nothing fired that didn't trace to you.** The proof-tree is the visible reason, not the headline.

## IT ADDRESSES EVERYTHING (the "cannot physically reject" matrix)
| Their concern / your thread | Where it's answered |
|---|---|
| Capability multiplier / raise the ceiling | The Unlock demo — 40-step task safely done |
| Autonomous multi-step touching real things | Proof-tree + autonomy dial |
| Injection defense that scales with autonomy | The Taint Firewall (IFC) |
| The reported $54.79→$54.99 miss | One of the 3 live holds |
| The error-handling UX requirement (their #1) | The spoken repair on each hold, rides their existing revise loop |
| Kai's harness, no AI grading AI | The corpora + deterministic gate prove every verdict |
| Enterprise trust | The Receipt audit trail (they can't produce it) |
| The moat | Drift map + annotation library flywheel |
| Their dormant DAG engine | The proof-tree is the trust layer that ships it |

## PROOF IT'S BUILDABLE FROM OUR SIDE (deterministic, on top of what's green)
- Proof-tree = the built gate run per step + provenance composition (graph walk). Rests on `core`'s lattice.
- Taint firewall = information-flow control; the invariant "no tainted value reaches a routing sink" is a static check. Generalizes the built SCREEN-never-licenses-routing rule.
- Autonomy dial = a policy table (level × verdict → action). No model.
- Receipt/drift-map = aggregate the receipts we already emit. No new physics.
- Everything additive on core 34/34, adapter 7/7, demo verified. No rewrite. Lane clean: we verify the plan; we don't build the agent or post-verification (Arav).
**Feasibility verdict: YES.**

## LOCKED DESIGN DECISIONS (so build agents don't re-litigate)
- Plan = ordered DAG `{id, tool, args, dependsOn[]}` + transcript + state.
- Composition: step K's routing licensed by transcript, state, or an earlier step's *read-back* output — never by raw content read mid-plan.
- Taint invariant: tainted (content-sourced) value → routing sink = BLOCK.
- Poison: a step depending on a flagged step is flagged.
- Autonomy levels L0..L3 (confirm-all → hold-flagged → approve-tree-then-auto → full-auto+receipt).

## THE OFFICIAL AGENT WORKFLOWS (run only after approval — terse, token-efficient, distinct file ownership)
- **WF-1 core autonomy subsystem** *(1 agent, high effort)* — `core/src/{plan,prooftree,taint,autonomy}.ts` + tests. DoD: core all green (34 + new) incl. inbox-lead, read-back, poison, 5 injection-at-scale attacks (each caught or a `todo` naming the residual — never faked).
- **WF-2 receipt + drift-map** *(1 agent)* — `core/src/receipt.ts` aggregation + a drift-map summarizer over receipts/eval; tests. DoD: green + a sample drift map from real corpus data.
- **WF-3 adapter plan-verification** *(1 agent)* — `verifyPlan()` + per-step OBSERVE/ENFORCE runtime + receipts; README wiring (DAG engine, OBSERVE→ENFORCE). DoD: adapter tests green (7 + verifyPlan cases).
- **WF-4 "The Unlock" demo** *(1 agent)* — `demo/autonomy.mjs` (deterministic) + `demo/autonomy.html` (self-contained proof-tree, taint edge highlighted, the without/with split), on top of the built demo. DoD: two runs diff-clean; html offline.
- **WF-5 adversary + integrator** *(2 agents)* — break the taint firewall (laundering/confused-deputy/read-back-spoof), find over-holds + overclaims + hardest Jonah/Kai questions; clean-checkout verify with real evidence.

Sequence: WF-1 → (WF-2 ∥ WF-3 ∥ WF-4) → WF-5. ~6 agents.

## HONEST SCOPE FOR TODAY vs ROADMAP
- **Buildable + demo-able today (WF-1..5):** the proof-tree, taint firewall, autonomy dial, receipts, and "The Unlock" demo on a scripted-but-real 40-step plan (real gate verdicts, scripted plan — we don't build the inbox-reading agent; that's their model). State this: the *verification* is real and live; the *plan* is scripted for the demo.
- **Roadmap (say built-vs-designed):** wiring into their live DAG engine, the production drift-map dashboard, the full annotation library.

## WHAT I NEED FROM YOU
Read → approve (or edit the locked decisions / the demo) → I launch WF-1..5. No code until you say go.
