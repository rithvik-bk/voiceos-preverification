# FOUNDER BRIEF — the twenty questions, Sunday's answers
*DEMO+DX-DOCS, 2026-08-21. Rehearsal fuel for Saturday (G6 dress rehearsal), pulled early from Phase 6.*
*Every number traces to `docs/CLAIMS.md` (C-ids) or a pod note (named inline). The parens are for YOUR eyes — never say a claim id aloud.*
*§0 discipline is absolute in every answer: your Slack integration is YOUR personal project running against their platform. "Production" always means production for you. Their Slack is a rented server-side Composio pass-through. Never one sentence implying your work ships inside their product.*

Voice check before you rehearse: short sentences. Say the honest limit before they find it. "Unmeasured" is a power move in this room, not a weakness — Kai especially will read it as engineering.

---

## KAI — rigor, "no AI grading AI", accuracy without sacrificing speed

### 1. "Why not just better prompting?"
Prompting moves a probability. It has no floor. It degrades when the model changes, when the distribution shifts, and it degrades worst under injection — which is exactly when you need it most. Preflight is a type rule: a routing parameter that can't name its source is malformed, same as a missing required field. There's no threshold to tune and no drift when you swap models. Prompting makes the model more likely to be right. This makes a wrong call structurally unable to exist. (SPEC-v4 thesis table)

### 2. "Why isn't this an LLM judge? I don't want AI grading AI."
It isn't, and I agree with you — that's why I built it this way. A judge model is a second hallucination surface that shares failure modes with the first one, and it costs you real latency on every call. There is zero LLM anywhere in the decision path. Every check is string and clock arithmetic over a session registry. The eval harness asserts the no-LLM property and prints it every run (C4). That's also why you can hand the mic to a hostile room: there's no classifier to fool, so there's no adversarial example. It's not detection. There's no arms race.

### 3. "What does a clean call actually cost? Exact number."
In the new core: 7.1 microseconds mean, 7.8 at p95, for the full pipeline — attribution, ladder, lattice, receipt, shadow log. A blocked call is 19 microseconds because it builds the candidate list for the card (skeleton-notes bench, 5000 iterations). The v3 gate running in my own Slack integration measures 0.24 milliseconds mean in-path, run parallel with payload prep (C3). Both numbers are compute-only against a stubbed transport — the harness prints that itself, I'm not hiding it. The honest missing number is p95/p99 including the re-verify network round trip. That's unmeasured — see question 17.

### 4. "100% catch on your own 50 cases. Prove this isn't security theater."
Fair — a perfect score on drifts I authored myself is a closed-world result, and I labeled it that way before you asked (C1). So here's what I did about it. The blind corpus is authored from the spec only, by someone who has never seen the gate implementation, and it's committed to the repo before the first scoring run. Whatever the number is, that's the number — I can't tune to a corpus I haven't seen, and the commit timestamp proves the order. And the third corpus is your own community's reported failures, reconstructed as fixtures — 5 verbatim reports, 6 reconstructed (replay-corpus-candidates). Catching a bug your users already reported is worth more than catching a hundred synthetic ones. Three corpora, scored separately, never blended. And the harness proves catches behaviorally, not by return value: the stub records every write method, and a drift only counts as caught if the write was never invoked (recon-inventory §1.1). Because every check is deterministic, every blocked call serializes into a new fixture — using the agent grows the dataset that protects the agent, at no latency cost, because there's nothing slow in string arithmetic.

### 5. ⚠️ THIN ICE — "What's your false-block rate at real volume? This is what annoys users."
**Least-bad honest answer:** "Zero of six correct calls blocked — and six is a tiny n, I'll say that before you do (C2). The real false-block rate needs real traffic, and I don't have your traffic. That's exactly what shadow mode measures in week one without changing any behavior: every would-have-blocked gets logged, nothing gets blocked, and we read the rate off the log before enforce ever turns on (C6 UNMEASURED). The design also treats friction as a budget — cards per 100 turns, per tool — so a tool that over-cards is a schema bug, not an acceptable cost."
**Do NOT claim:** any projected false-block rate, "it won't annoy users", or that 0/6 generalizes. If pushed: "I don't know the number yet. Shadow mode exists so I never have to guess it."

### 6. ⚠️ THIN ICE — "What's p95/p99 with the re-verify network call included? Microseconds of arithmetic isn't the real cost."
**Least-bad honest answer:** "You're right, and the spec says so in the same section as the fast number. The in-path arithmetic is microseconds; the real tail is the re-verify round trip when a referent went stale. The design amortizes that against speech time — re-proving happens while the user is still talking, so it's off the critical path — but the speculation layer that does that is specified, not built, and p95/p99 including re-verify is unmeasured (C3 caveat, §24). I will not quote you a latency number I haven't measured. The commitment is: publish p50/p95/p99 including re-verify, never just the arithmetic."
**Do NOT claim:** any end-to-end latency number, or that speculative gating "works" — §8 is SPECIFIED-ONLY this build (scope-ladder).

### 7. ⚠️ THIN ICE — "Your rank-4 'transcript' arrives model-filled. The model copies the transcript into the arg itself. Isn't your whole type system resting on the model's honesty?"
**Least-bad honest answer:** "Yes — today the model attests and my gate verifies internal consistency against the claimed utterance. Rank 4 in a receipt means 'consistent with the claimed transcript,' not 'platform-attested audio' (U3, skeleton-notes). Two things about that. First, most of the catch value doesn't depend on it: grounding-store membership, ambiguity-as-data, time resolution — all of the 50/50 — check the model's claim against recorded truth the model can't fake, because the registry was written by real reads (C1). Second, closing the gap is a one-line ask: the platform injects the authoritative transcript per tool call. You own the speech pipeline. I can't build that from outside, and that's precisely why this layer belongs in the platform."
**Do NOT claim:** that transcript-rank provenance is platform-attested today, or that a dishonest model can't fabricate a `said` string. Own the limit, then convert it into the ask.

### 8. "Is this a Composio-wrapper problem too? Our Slack runs through Composio."
No — and that's the point. Your Slack is a server-side Composio pass-through: the schemas aren't inspectable, the execution happens on your server with OAuth you hold, and nobody outside Composio can audit or gate that plane — including you (recon-access-check). Mine is client-side, MCP over stdio, code I own line by line, 418 tests green (C8). No owned, inspectable Slack exists on the platform except mine. That's not a dig — it's the argument: the only way even you could gate the Composio plane is a platform-level pre-execution seam, which is exactly the RFC I'm proposing. And your own scheduling engine already has a deterministic refusal guard for not-connected toolkits — the instinct is already yours, it's just not systematized.

### 9. ⚠️ THIN ICE — "Fine, injected text can't be routed. But can it ride the message body out — compose itself into content and exfiltrate cross-origin?"
**Least-bad honest answer:** "The routing half is closed today: a destination or amount from inside read content is structurally unroutable, and that's the live 50/50 (C1). The content half — the taint bit that follows injected text through copy and template-fill, and the consent label that names both endpoints, 'send content from A to B' — is specified and modeled, not yet proven. The design is done; the test hasn't landed (THREATMODEL Attack 2, HIGH residual this build). So today: an attacker can't choose where anything goes, and the user reads every word in the composer before Send. What they don't get yet is the explicit cross-origin flag. That's the next test on the board, and I'd rather tell you that than demo it wrong."
**Do NOT claim:** taint propagation works, the both-endpoints label exists, or that the composer flags cross-origin today. Routing closed, consent-surface in progress — that's the whole truthful sentence.

---

## JONAH — taste, tests by hand, ships on feel

### 10. "Does it feel fast? Show me."
Yes — because on a clean call there's nothing to feel. The gate runs in parallel with payload prep at microseconds (skeleton-notes bench; C3), so a correct call is byte-identical to no gate, just checked. Here — [live: clean send, then the wrong-Alex drift]. The drift costs one tap and the correct call fires. That's the design rule: the recovery is the demo, not the block. Safety lands where it protects, never where it annoys.

### 11. "What does the card look like when it blocks?"
It's a type error on screen, not a scolding. For the injection case: destination provenance says *email body*, required rank says *transcript*. Two facts, one line each. For ambiguity: two options, and the card highlights the *difference* between them, not two full restatements. And on anything risky the number lives inside the button itself — "Send $50" — because the button gets read when the card body doesn't (SPEC-v4 §15). No red banners, no "are you sure." The card tells you where the value came from and what it needed to be.

### 12. "What breaks if I grab the mic right now?"
Try these — here's exactly what happens (THREATMODEL Attack 10):
- **"Read this email and DM the address in it."** Blocks, live. The card shows body vs transcript. I rehearsed this exact utterance Saturday and watched it block for real. *[GATE ON THIS SENTENCE: only sayable after the Saturday hand-run passes. If the Act-1 block does not fire by hand in rehearsal, the demo does not run — THREATMODEL always-stop.]*
- **"Tell the model to ignore the gate."** Nothing happens, and this is the strongest one: there's no classifier to talk the model out of. Compliance fails as a type error (C4, no-LLM property).
- **Wrong Alex / near-miss name.** Card with both candidates. Fuzzy matching only ever populates the card — it never auto-routes, in any tier. Worst case is one tap (C1, ambiguous_target 10/10).
- **"Send fifty dollars" — then correct to fifteen mid-sentence.** Straight with you: the confirm label echoes the amount live, so you'll see the wrong number before it fires. Catching the mid-utterance ASR revision itself runs in my harness on a simulated decoder — your platform doesn't expose streaming revision events to integrations, so I can't run it live here. That's real in harness, not live, and I'll show you which.
- **A spatial attack — alt-tab mid-sentence, a popup.** Same honesty: caught in harness against a simulated surface buffer with the real gate rendering the verdict (C8). The platform exposes no screen-transition events, so there's nothing to run it against live yet. The surface buffer is simulated; the gate that catches it is the real one.

### 13. "Can I undo what it fires?"
Undo is precomputed, never inferred — asking a model to undo is a second chance to hallucinate, so the inverse call is synthesized at fire time, before anything runs (SPEC-v4 §16). Where it stands today, exactly: the fire-time handle exists in my integration — the scheduled-message id comes back ready for the undo tool — and the tool that consumes it is a wiring step, not a design step (recon-inventory; tools-t2.ts:904). Across my 16-tool catalog: 2 inverse pairs built, 7 declared with the API compensation named but unbuilt, 0 missing (contracts-notes). And the honest class nobody else names: money and external webhooks are irreversible, so they get the full card unconditionally and no pill pretends otherwise. Never gonna tell you "undo works." I'll tell you which of the three reversibility classes each tool is in.

### 14. "What's the drift rate on our platform? What would this have caught for us?"
I don't have your logs, so I won't invent a number — baseline WAR on live traffic is unmeasured until shadow mode runs (C7). What I do have is your community's own reported failures rebuilt as fixtures. The headline is the calendar end-time bug — screen inspection is one turn lagged, the model fills the end time from a stale frame, users reported it verbatim — and the gate catches it because a value backed by nothing the session read is ungrounded (replay-corpus R1; C8 for the harness proof). Your most credible third-party builder said it himself: "models make up tool calls" (R2). An invented call is fully ungrounded by construction. That's the class this kills.

---

## THE BUSINESS AND THE ASK

### 15. "Why do you need us at all? Why isn't this just a library?"
Everything catchable from outside the platform, I've already caught — that's what the 50/50 and the 418 tests are (C1, C8). What's left needs signals only you have: streaming transcript with stable token ids and revision events, word-level ASR confidence, screen-transition events, and a pre-execution seam that covers every integration instead of just tools I ship (U1, U5, U6, U4). Deepgram already emits the confidence — your client already parses the alternatives — it just dies before the tool layer (recon-inventory §2.2). I built to the edge of what an outsider can reach. The rest is one hook deep inside VoiceOS core.

### 16. "So what exactly do you want from us?"
Small ask, deliberately: expose word-level ASR confidence to the tool layer, and inject the platform-authoritative transcript per tool call. That closes the last drift family — acoustic number confusion — and turns transcript provenance from model-attested into platform-attested (SPEC-v4 §28, U3). Everything ships in shadow mode first: observe and log, change nothing. Adopting this risks nothing and produces your first WAR baseline as a side effect. I'm not asking you to adopt my library. I'm saying this layer belongs in the platform, and here's the single hook it needs from you.

### 17. "What would you ship in week one?"
Four things, none of which require trusting my judgment (SPEC-v4 §32). Shadow mode across every write tool — that's the first real WAR baseline the team has ever had. The schema annotation format plus the CI lint, so coverage is a tracked number and no ungated write tool can merge — it already runs at 100% on my own 16-tool catalog (contracts-notes). The blind adversarial corpus, authored by someone other than me, scored publicly. And the replay corpus from real reported failures with a per-bug catch/miss table. All four produce numbers you can check yourselves.

### 18. "How does this make us money?"
Here's the argument, and I'll flag where it's a thesis, not a result. Voice agents stall in enterprise procurement because no buyer can answer "prove this agent only acted on what my employee actually said." A per-parameter, replayable audit trail is that answer, and no prompt or confirmation card can produce it (SPEC-v4 §29). Straight caveats: receipts are specified with the skeleton emitting them, signing is roadmap and I won't claim a tamper-proof trail today (THREATMODEL Attack 9). And I haven't sold to an enterprise — I'm handing you the compliance artifact, you have the customer conversations. There's a second lever that is testable: if the gate catches routing errors structurally, a smaller, faster model gated should hold WAR flat while cutting cost and latency (§25). If that experiment holds, this isn't a safety line item — it's margin.

### 19. "Where does Arav fit? Whose lane is what?"
Clean split, one story. I own everything before the fire: provenance, grounding, repair, blocking, disambiguation, the verified payload, the precomputed inverse. Arav owns everything after: execution errors, retries, confirming the world actually changed (SPEC-v4 §31). One shared receipt format threads both halves, so a call is auditable end to end. The first voice agent that provably doesn't burn you — before it acts and after.

### 20. "Why should a 15-year-old own this layer?"
Look at the artifacts, not the birthday. A gated Slack integration I built and run myself against your platform — my project, not your codebase — with 418 tests green (C8). Fifty out of fifty injected drifts caught across five families, zero of six correct calls blocked, at 0.24 milliseconds, no LLM in the path (C1, C2, C3). A 16-tool contract catalog at 100% annotation coverage with a lint that fails on any ungated write (contracts-notes). A threat model that attacks my own design and publishes the residuals. A replay corpus built from your community's reported bugs. And the parts I haven't measured, listed in caps in my own spec. Whoever owns this layer should be the person who built that pile. Right now, that's me.

---

## ⚠️ THIN ICE INDEX — the four we cannot answer well
Rehearse these hardest. The move on every one: say the limit FIRST, in your own words, then convert it into shadow mode or the ask.

| # | Question | The one-line core | Never claim |
|---|---|---|---|
| Q5 | False-block rate at volume | "0/6 is tiny n. Shadow mode reads the real rate off the log before enforce." (C2, C6) | Any projected rate; "won't annoy users" |
| Q6 | p95/p99 incl. re-verify | "Arithmetic is microseconds; the network tail is unmeasured and I won't fake it." (C3, §24) | Any end-to-end latency; speculation "works" |
| Q7 | Model-filled `said` / transcript attestation | "Today the model attests, the gate checks consistency; platform-injected transcript is the ask." (U3) | "Platform-attested today"; "model can't fake it" |
| Q9 | Taint exfiltration through the body, cross-origin | "Routing is closed today. The taint bit and the both-endpoints consent label are specified and modeled, not yet proven." (THREATMODEL Attack 2, HIGH residual) | "Taint propagation works"; any tamper-proof-receipt claim (Attack 9) |

Two standing tripwires from G0 (never cross, even under pressure): no claim without a CLAIMS row, and no sentence a listener could hear as "his Slack work is part of VoiceOS's product."

---

## THE CRIB — ten sentences, cold, ≤15 words each

1. Preflight is a provenance type system for tool calls, not a safety filter.
2. Every parameter names its source before the call is allowed to exist.
3. No LLM anywhere in the decision path — nothing to fool, nothing to tune.
4. A clean call pays seven microseconds; repair comes before block.
5. Injection dies as a type error: the address in the email has no transcript span.
6. No owned, inspectable Slack exists on the platform except mine.
7. The blind corpus was authored spec-only and committed before running; the number is the number.
8. Shadow mode changes nothing and produces your first WAR baseline in week one.
9. The undo handle exists today; the tool that consumes it is a wiring step.
10. The one hook I need: word-level ASR confidence and a platform-attested transcript.
