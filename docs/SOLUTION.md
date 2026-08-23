# PREFLIGHT — The Full Solution (honest merge, adversary-corrected)
*2026-08-23. Produced by the 10-agent orchestration (grounded in main.deob.js + the preflight repo), then corrected by a completeness critic + an adversary playing Jonah & Kai. Lane: deterministic PRE-verification only. Post-verification is Arav's — we define only the seam. This doc has the overclaims already stripped out.*

## THE MOAT (say it so a founder repeats it): Proof-Carrying Actions
Homage to Proof-Carrying Code (Necula & Lee, 1996). **An action is a theorem; its provenance is the proof.** The gate doesn't "approve" a call — it tries to *construct a proof* binding every routing parameter (who/where/when/how-much) to a licensed source. Complete proof → fire. Incomplete → the action has no valid form to exist in → one spoken question completes it. Schema proves it's a string; the proof proves it's YOUR string. Zero LLM in the hot path, deterministic.

Why it's a moat and not a weekend copy: (1) the **annotation standard + accumulating library** of correctly-annotated tools = DefinitelyTyped for tool safety; a copier inherits an empty type-library. (2) the **labeled production data** at the one chokepoint that sees `{transcript → attempted args → grounded verdict}` for every call. (3) the **proof format as interop standard** — the same object the smart card renders, the enterprise audit parses, and Arav's post-verifier consumes. **Honest today: it's currently a feature; the moat is a bet, magnitude zero until there are adopters. Say that plainly.**

## THE HONEST SCOPE (state this in the first 5 minutes, unprompted)
Preflight catches **model-drift** (the model silently changed a value your transcript got right) and **screen/content-injection** (a routing target sourced from what was read, not said). It is **structurally blind to ASR-mishear** — if the ear writes "54.99" when you said "54.79", the transcript itself is wrong and provenance faithfully grounds the wrong words. That ASR class is a readback-confirmation problem, a different layer. **Telling Jonah this before he discovers it is the single biggest trust move available.**

## THE THREE COLLAPSE-RISKS (fix/pre-empt before Sunday — the adversary found these)
1. **The injection beat cannot run live in VoiceOS at zero-mod.** The custom-MCP subprocess boundary carries only `{name, arguments}` (L21045, verified) — it is transcript-blind AND screen-blind, so it physically cannot label a param "screen-sourced not spoken" inside the app today. It fires 100% deterministically **in our harness** (sources pre-labeled). → Frame Beat 1 as harness-driven + "to run it live in your app you thread `currentTranscript` into the tool ctx — the one-field seam, exactly what you already do at L28076 for `userRequestText`." Say it FIRST or it reads as bait-and-switch.
2. **Preflight does NOT catch Jonah's literal fear (ASR mishearing $54.79→$54.99).** See scope above. Answer "no" straight, then say what it DOES catch.
3. **The nag/false-block story is unmeasured** (20% on n=5 blind runnable vs "rounds to zero" aspiration — contradictory). Lead with the **5→1 fix story** (pre-registered blind corpus caught 5 false-blocks in our own gate, we fixed the gate not the corpus). Present the clean-call false-block RATE as the top unbuilt item; never quote 20% as if stable.

## THE FLAGSHIP CHECKS (the demo spine — all deterministic: set membership, decimal equality, integer cardinality)
Source lattice: `SPEECH` + `STATE` license routing AND content · `PRIOR_TOOL_OUTPUT` licenses only if read back · `SCREEN/CONTENT` licenses content but **NEVER routing** (that one rule = the injection firewall). Dispositions: BLOCK (injection only) · HOLD (one spoken question) · SURFACE (fires, discrepancy shown — content) · PASS.

1. **Injection firewall** — routing param licensed only by screen/content → `PF_INJECTION_ROUTING_FROM_CONTENT` → BLOCK. Cannot pass: the value was never spoken, no ASR outcome creates a SPEECH license.
2. **Ambiguity collision** — two real "Dan"s → `PF_AMBIGUOUS_TARGET` → HOLD. Cannot pass: `|candidates|≥2` every run; selection needs cardinality 1. *(v1 over-asks; context-disambiguation is Tier 2, unbuilt — admit it.)*
3. **Number-twin / magnitude** — filled amount ∉ spoken number-set → `PF_AMOUNT_NOT_IN_SPEECH` → HOLD (card if money). Cannot pass: `54.99 ≠ 54.79` is hard inequality, no tolerance to slip under. *(Rule-based parser, conservative — biases to false-negative, never fabricates a catch. Recall unmeasured.)*
4. **Missing-provenance** — hallucinated routing param → `PF_UNGROUNDED_ROUTING_PARAM` → HOLD.
5. **Misbinding (NEW — adversary caught the hole)** — `PF_MISBOUND_PARAM`: routing params of one call must trace to the *same clause/span*, not just anywhere in the transcript. Catches "refund Dan $50 and Sarah $30" → `refund(Dan,$30)` (both numbers present → check #3 passes, but the pairing is wrong). This is the second half of Jonah's number class. Tier 2, needs spans.
6. **Wrong tool (Jonah's ask, honest reframe)** — caught **indirectly**: a wrong tool usually needs routing params the user never spoke (`delete_event` when you said "reschedule" has no grounded referent → held by #4). The residual case (tool swap where params happen to ground) is **not** a provenance question → it's Arav's post-verifier. No deterministic wrong-tool detector is claimed.

### The $54.79→$54.99 worked example (model-drift version — the one we CAN catch)
Say "refund fifty-four seventy-nine" → transcript set `{54.79}` → model emits `refund(54.99)` → at the gate `54.99 ∉ {54.79}` → HELD → money ⇒ smart card: **"You said $54.79 — this is set to $54.99. Which?"** → spoken "seventy-nine" → rides the existing `revise` path (L27345/L27362) → re-check `54.79 ∈ {54.79}` → PASS → fires at $54.79. Counterfactual: without Preflight the card reads "Refund $54.99? [Yes]" and the wrong amount fires uncatchably.

## THE VOICE-REPAIR UX (Jonah's #1 hesitation — the error already exists, we make it smart)
VoiceOS already has the spoken-repair loop: `routePendingConfirmationReply` (L27345) → on `revise`, supersedes the card and re-runs `handleTextInput` with the correction (L27362). **We invent no new interaction model.** We add one field to the existing card: `discrepancy {reasonCode, param, heardValue, proposedValue, source, candidates?}` — so "Refund $54.99? [Yes]" becomes "You said $54.79 — set to $54.99. Which?"

Four invariants: (1) silence is default — 99% fire with zero added words; (2) one breath, same turn (gate is µs, no stall); (3) ask exactly ONE thing; (4) name the SOURCE not the error ("that number came from the email" > "couldn't verify"). Repair ladder keyed to reason-code (no LLM decides how to ask). Voice-vs-card governor: voice for one low-stakes referent; card the moment payload can hurt (money/irreversible/external) or list >3. **Anti-nag governor is the hardest, least-built part — repairs-per-100-clean-calls is the discipline metric and it is currently an aspiration, not a measurement.**

### Founder-editable script library (this IS "the rough draft to iterate on")
- Number-twin: `"I heard {heard}, not {proposed} — which is right?"`
- Ambiguity: `"Two Dans — {a} or {b}?"`
- Injection: `"That address came from the email, not from you — send anyway?"`
- Missing: `"Send it to who?"` · Close loop: silence / `"Got it — {corrected}."` / `"Okay, holding off."`

## THE TESTING HARNESS (Kai — "guarantee accuracy, no AI grading AI")
Three corpora, reported separately forever: **self** (7/7, the floor, never the headline) · **blind/held-out** (40, authored from SPEC before the code, committed before any run — caught 5 false-blocks in our gate → 5→1) · **replay-of-real-bugs** (11, 5/5 runnable, each cites a real community failure to file:line). Grader = `assert(gate.verdict === case.expected)` against human JSON — no model. Metrics are pure counts: catch rate, false-block rate, per-family offender histogram (also the roadmap), latency.

**Why "no AI grading AI" is structurally true:** zero LLM in the gate; expected answers committed to git pre-run; **no `Date.now` in any library path** (timestamp is a required CLI arg) → same corpus + same code = byte-identical output, forever; `report.ts` has **no cross-corpus aggregation and the self-tests assert its absence** — you physically cannot print a blended "94% accurate" number. *(That last one lands hardest with Kai — VERIFIED real this run.)*

Honest gaps to state: blind has 5/40 runnable (all PASS-expected, no runnable BLOCK cases yet); n=5 is an anecdote not a rate; a true drift number needs live capture (`input_json` is null); bench µs (4.7µs/220µs) not reproduced this run — run `bench.ts` on the laptop before quoting.

## THE ENTERPRISE FRAME (the wedge)
The enterprise blocker isn't capability — it's un-auditable authority. A bank won't let voice touch money until it can answer "what guarantees this action traces to something a human authorized." Preflight installs the floor: "the model can be wrong and still cannot fire an ungrounded action." Five sellable controls that are five reports of ONE mechanism: immutable audit trail (their DB literally can't do this — `input_json:null` L26838), policy-as-code (deny over $X, approved-recipients-only), RBAC/authority, PII/secret guards, compliance-shaped receipts. "Deterministic, ~7µs, no AI grading AI" IS the procurement thesis: auditable → reproducible → defensible → procurable.

## HOW IT SLOTS IN (verified paths)
Zero-mod: ship as a local stdio MCP server; user adds it via `custom-mcp:add` (L31725, accepts `{name, transport:"stdio", command, args, env}` L31734); VoiceOS launches it (`StdioClientTransport` L21142), discovers tools (L21158). Gates a tool via same-named proxy. **Constraint:** subprocess sees only `{name,arguments}` (L21045) — args-only checks (schema, placeholder, idempotency, ambiguity-against-queryable-state) run fully; transcript-grounding (span-licensing, number-twin, injection-vs-speech) needs the one-field ctx seam at L28076. Seam to Arav: emit a `PreflightReceipt {interactionId, serverId, toolName, args, verdict, routingParams[{name,value,source,transcriptSpan?}], contentParams, transcriptSnapshot, firedAt}` keyed on the `executionId` VoiceOS already round-trips. We build none of post-verification.

## CORRECTED FACTS (adversary re-checked live — use these, not the old ones)
- voiceos.db NOW: **242 sessions / 134 tool calls / 134 joinable pairs** (not 433/117). `input_json` **134/134 NULL** (confirmed, L26838). Join spoken text via `agent_turns.user_message` (turn_id) or `voice_sessions.transcript` — **there is no `agent_turns.transcript` column.** Recompute the panel number LIVE day-of; never hardcode.
- Real tool_names in the db are demo-rich: Stripe, Slack, iMessage, Apple Mail.
- Unannotated tools are **fail-open** today (pass through ungated). 13 contracts = a demo library, not app coverage. "Proof-carrying actions" applies to annotated tools only — don't imply whole-app coverage.
- Repo vendors uvo (~20 Slack/OAuth test files) → scope every reproduce command to `cd packages/<x>` so a root `node --test` doesn't blend counts. (Lane OK — vendored copy, OAuth repo untouched.)
- The "L28076 threads request text" pattern is real on the coding-agent path (L17452); wiring it to the MCP fork is the ask, not already-wired — state precisely.

## VERIFIED SOLID (state as rock-solid — confirmed this run)
core 16/16 · contracts 13/13 · eval 20/20 (per-package) · blind 40 / replay 11 / self 7 · report.ts never-blends (real, self-tested) · code cites all confirmed: L21142, L21717 `requiresConfirmation:![]`, L27351 `classifyAgentConfirmationIntent`, L27345 revise loop, L23096 desktopCapturer, L26838 input_json null.

## THE BUILD-WORKFLOW (Saturday, reliability-first, no overnight)
Wave 0 DONE (don't rebuild): core/contracts/eval/corpora/bench.
- **WAVE 1 (must-have, cannot fail, offline):** (1a) `demo.js` runs the flagship beats offline through the harness (injection BLOCK, ambiguity HOLD→repair, number-twin HOLD) printing the proof + incomplete-proof view — byte-identical on two runs. (1b) live stats panel fed by eval JSON + the LIVE db proxy (labeled proxy). (1c) Kai reproduction card, every command `cd packages/<x>`.
- **WAVE 2 (high Jonah value, parallel):** (2a) the rough-draft edge-case + script doc for Jonah [NON-NEGOTIABLE — his ask]. (2b) smart-card mockup (blind-card vs smart-card).
- **WAVE 3 (gated, highest risk, timeboxed — falls first):** (3a) zero-mod MCP server in **observe-only shadow** (`would_have_blocked`, never holds a real call) proving Preflight runs inside real VoiceOS. (3b) groundability proxy over the live db (join `user_message`).
- **WAVE 4 (only if 1-3 green):** enterprise one-pager + the receipt seam doc for Arav.
Falls last→first if short: W4 → W3b → W3a → W2b. **Never cut: W1 + W2a.** Those alone = green demo + Kai rigor + Jonah's artifact.

## WHAT WINS THE ROOM (stake the demo on these — all real, all reproducible offline)
1. Determinism proof + the no-blended-number self-test (Kai's exact ask, structurally met).
2. The card-confirms-model-not-speech teardown with L27351/L21717 citations (kills "we already do this").
3. The blind-corpus 5→1 pre-registered-prediction story.
Everything live-in-app or ASR-dependent is **upside, framed honestly, never the spine.**
