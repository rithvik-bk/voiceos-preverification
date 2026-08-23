# RECON INVENTORY — Phase 0 ground truth
*Written 2026-08-21 by RECON. Every number below traces to a command run this session. Anything unverified carries an inline `ASSUMPTION:` tag. Companion files: `../UNKNOWNS.md`, `replay-corpus-candidates.md`.*

---

## 1. What actually exists and runs: `/Users/rithvik/universal-voiceos-oauth`

### 1.1 Evidence runs (executed this session, 2026-08-21)

**`node tools/preflight-eval.mjs`** — exit 0. Actual output:

- Drifted calls: **50** injected, **50** caught before the write (**100.0%**)
- Correct calls: **6**, falsely blocked: **0** (0%)
- Per-family: misheard_target 10/10, ambiguous_target 10/10, ungrounded_ref 10/10, unresolvable_time 10/10 (`time_in_past` ×2, `ambiguous_time` ×8), dropped_param 10/10 (`ungrounded_message` ×1, `invalid_emoji` ×2, `missing_parameter` ×7)
- Cost: resolver 3.0 µs/check (20k iterations); blocked call end-to-end 0.31 ms mean / 0.62 ms p95; allowed call 0.24 ms mean
- The harness's own honesty note (printed in output): Slack is stubbed in memory — these are the gate's COMPUTE cost, not a real send; no LLM anywhere.
- Catch evidence is behavioral, not return-value: the stub records every Slack method requested, and a drift counts as caught only if `chat.postMessage` / `chat.scheduleMessage` / `reactions.add` was **never called** (`tools/preflight-eval.mjs` header, WRITE_METHODS set at line ~86).

**`npm test`** (vitest) — exit 0. Actual output: **22 test files passed, 416 tests passed**, 2.92 s. Note: SPEC-v4 §24 says "415 tests green" — the real number today is **416**; the spec figure is one behind, cite 416 going forward. Notable named tests that passed: "blocks every injected parameter drift, and no correct call (tools/preflight-eval.mjs)" (slack-integration.test.ts), byte-budget 38,626 bytes vs 131,072 cap (slack-cards-s.test.ts), refresh-lock serialization, secret-scan token-prefix coverage.

SPEC-v4 §24 "Measured today" cross-check: 50/50 caught ✓ (reproduced), 0/6 false blocks ✓ (reproduced), 0.24 ms allowed-call mean ✓ (reproduced exactly), 415→**416** tests (drifted up by one), zero LLM calls ✓ (eval prints it; every check is string/clock arithmetic).

### 1.2 The gate modules — real paths and key exports

**Gate core logic (portable — pure functions over strings, clocks, and an in-memory registry; no Slack API types in the decision path):**

| Concern | File | Key exports / functions |
|---|---|---|
| Blocking primitive + machine codes | `integrations/slack/tools-t2.ts` | `class PreflightBlock(code, detail)` (line 98) — thrown with codes `ungrounded_message`, `missing_parameter`, `invalid_emoji`, `ambiguous_time`, `time_in_past`, `target_not_found`, `ambiguous_target` |
| Grounding store (session provenance registry) | `integrations/slack/tools-t2.ts` | `GroundedMessage`, `rememberMessage`/`rememberMessages` (216/228), `isGrounded` (232), `forgetGroundedMessages` (237), `groundFromToolResult` (269 — harvests referents from read-tool results; "a grounding miss costs a verification, never throws"), `setProvenancePolicy`/`provenancePolicyNow` (241/245, `'session' | 'verify'`), LRU cap `GROUNDING_LIMIT = 500` (207) |
| Display-arg-vs-registry check (model's claim vs recorded truth) | `integrations/slack/tools-t2.ts` | `assertDisplayArgGrounded` (755), `groundMessage` (323) — "the display arg is the model's assertion; the grounding registry is the gate" |
| Time resolution (derived provenance, no semantics) | `integrations/slack/tools-t2.ts` | `ResolvedTime` (494), `resolveInstant` (499), `resolveSendInstant` (597) — rejects past instants and phrase-shaped non-instants deterministically |
| Entity resolution + ambiguity-as-data | `integrations/slack/resolve.ts` (657 lines) | `resolveTarget(spoken, pool): Resolution` (395 — the 3 µs resolver), `resolveConversation` (468), `resolveUser` (521), `resolveSendTarget` (533), `ResolveOk | ResolveMiss` + `CandidateSummary` (421-441 — a miss returns real candidates as data, never a guess), `getDirectory`/`invalidateDirectory` + `DIRECTORY_TTL_MS = 60_000` (62-264) |
| Frozen copy deck (deterministic human strings per machine code) | `integrations/slack/copy.ts` (297 lines) | `DECK`, `fill`, `internalFaultLine(code)` (134) |

**Slack-specific (adapter — swap layer for VoiceOS/any host):**

| Concern | File | Key exports |
|---|---|---|
| Transport + auth to Slack | `integrations/slack/toolkit.ts` | `callSlack` (229), `createToolCtx` (312), `requireToken`/`TokenGate` (327-345), `SlackError` (108), `apiBase` (182) |
| Tool defs T1 (reads) / T2 (writes) | `integrations/slack/tools-t1.ts` (742 ln), `tools-t2.ts` (1395 ln) | `T1_TOOLS` (634), `T2_TOOLS` (1381), `T2_CONFIRM_TOOLS` (1395); test seams `useClock`/`resetClock`, `useTokenGate` |
| Manifest + MCP wiring + routing/content seam | `integrations/slack/tools.ts` (573 ln) | `TOOLS`, `CONFIRM_TOOLS` (191), `callTool` (229), `toWirePayload` (282), `buildManifest` (557), `COMPOSER_PATH` W/D switch (412) |
| Notch cards / widget UI | `integrations/slack/cards.ts` (1552 ln), `widgetKit.ts` (1379 ln), `composer.ts` | `glance`/`withCard` (329/352), `errorCard` (1185), `sendConfirm` (998), `digest` (916) |
| Lifecycle / connect flow | `integrations/slack/lifecycle.ts` | `slackConnectTool`, `autoConnectOnStartup`, connect cooldown |
| OAuth engine (separate concern — Rithvik's own prior build, paused) | `engine/src/` | `authorize, exchange, refresh, vault, loopback, pkce, state` — the Universal OAuth build; not part of the gate but shares the repo and test suite |

**Portability judgment:** the *decision logic* (resolveTarget scoring tiers, grounding-registry membership, time resolution, PreflightBlock codes, ambiguity-as-data shape) reads/writes plain data and is extractable into `packages/core` mostly by cut-and-carry. What is entangled and must stay behind an adapter: `ToolCtx`/`callSlack` (transport), directory *fetching* (`conversations.list`/`users.list` inside `getDirectory` — the cache+TTL logic is portable, the fetch is not), Slack markup decode (`decodeSlackText`), and everything in cards/widgetKit (VoiceOS-notch-specific rendering).

### 1.3 Spec §26 "Live today" claims, verified item by item

| §26 claim | Verdict | Evidence |
|---|---|---|
| Provenance gate on every write tool | **TRUE** | eval drives real handlers `slack_send_message`, `slack_schedule_message`, `slack_react`; 50/50 blocked pre-write this session |
| Machine codes + human error cards | **TRUE** | `PreflightBlock.code` → `copy.ts` deck → `cards.errorCard`; codes observed live in eval output table |
| Session grounding store | **TRUE** | `tools-t2.ts` 207-245; exercised by ungrounded_ref family 10/10 |
| Ambiguity-as-data disambiguation | **TRUE** | `resolve.ts` `ResolveMiss.candidates`; ambiguous_target 10/10 returned `ambiguous_target` code, never picked |
| Routing/content split | **TRUE** (as a discipline, not a named module) | routing args (target/channel/ts) pass resolution+grounding; content (`text`) is never entity-resolved, only required-field-checked (`tools-t1.ts:314` comment marks the seam); there is no single `routing.ts` — it is enforced per-handler |
| Schedule undo handle | **TRUE, handle only** | `scheduled_message_id` returned with comment "`slack_undo_scheduled` (T3) needs exactly this string" (`tools-t2.ts:904`). **The undo TOOL does not exist** — `grep slack_undo_scheduled` hits only that comment. §16 zero-inference undo engine = unbuilt beyond the handle. |
| Measured eval harness | **TRUE** | ran it, §1.1 |

§26 "This week" list (ASR revision invalidation, stable-token anchoring, shadow mode, constrained re-emit repair, fixture generator, inverse pairing, transcript-span enforcement, TTL demotion): **none found in the repo** — grep for revision/shadow/re-emit/fixture-generator comes up empty outside the spec. All aspirational. TTL exists only as directory-cache TTL (60 s), which is not the §10 grounding-TTL demotion.

---

## 2. VoiceOS platform surface (from ~/voiceos-intel/, an on-disk reverse-engineering brief dated 2026-08-13)

### 2.1 What the integration contract gives us (verified in `01-integration-contract.md`, byte-cited against the real app folder)

- **Integration = folder**: `voiceos.integration.json` manifest (schemaVersion 1, stable reverse-DNS `id`, `runtime:{kind:"local-mcp"}`), `server.ts` speaking **plain MCP over stdio** (initialize / tools/list / tools/call / ping — no VoiceOS SDK required), `run.sh`, `icon.png`, `widgetKit.ts`.
- **Tools**: `name` must match server tool name both ways; `description` doubles as the routing rule; `inputSchema` = JSON Schema draft 2020-12. Action tool ⇔ declares a manifest `confirmation` card; read-only must NOT and ends description "Read-only."
- **Confirmation cards**: declared in manifest, bind args with `{{arg}}`; **edited values replace the agent's and flow back** via `{type:"voiceos:updateInput", key, value}` (01 §5.4, verified bridge messages); VoiceOS floats its own confirm/cancel — a card can never self-approve.
- **Result shape**: JSON for the model + `_voiceos_glance.blocks` for the notch (≤3 blocks, ≤128 KB, never card-only).
- **Auth today**: `auth.kind:"apiKey"` env injection only; `oauth2` slot dormant. (Irrelevant to the gate path but bounds what ships.)
- **The `said` pattern**: a tool MAY declare a `said` arg carrying "the user's exact spoken words," and the old Stripe build's keyless fail-closed `verify(said, amountDollars)` gate is documented as the reference safety pattern (01 §7). Critical caveat: `said` is **model-filled**, not platform-injected — the LLM copies the transcript into the arg. ASSUMPTION: there is no platform-authoritative transcript delivery to integrations (nothing in 00/01/deep suggests one exists).

### 2.2 What the platform does NOT expose (each checked against the brief)

- **Word-level ASR confidence: NOT exposed to integrations.** `deep/20-audio-dictation.md` shows Deepgram nova-3 over WebSocket in `main.js` parsing `is_final`, `speech_final`, `alternative`s — all inside the VoiceOS client; the agent loop is server-side gRPC (`deep/19`), and integrations receive only `tools/call` args. ASSUMPTION: confidence values die inside main.js/the server and never reach any third-party surface (nothing in the brief shows them forwarded; not directly stated as absent).
- **Transcript token ids: NOT exposed.** No token/span identifier appears anywhere in the integration contract or the deep-read. ASSUMPTION (absence-of-evidence in a byte-cited RE brief, strong but not a platform statement).
- **Streaming revision events: NOT exposed.** `interim_results=true` is set on the Deepgram socket (`deep/20` §2) so revisions EXIST internally, but the agent path consumes a finalized transcript (endpointing 500 ms + utterance_end 1000 ms drive finalization) and integrations see nothing until `tools/call`. ASSUMPTION: no interim/revision event crosses the MCP boundary.
- **Turn-boundary / barge-in events to integrations: NOT exposed.** VAD events exist client-side only. ASSUMPTION as above.
- **Screen state / surface-transition events: NOT exposed to integrations**, and the screen read is one turn LAGGED even for the native agent (`oauth-design/C1-browser-control-limits.md:55` — "acting on a stale frame... root cause of the calendar end-time bug").
- **Pre-execution middleware slot: NOT exposed.** There is no platform hook between agent decision and tool execute for third parties; the only interception point an outsider owns is **inside their own MCP server's handler** — exactly where the Slack gate lives today. A platform-level Preflight is a pitch/RFC, not something we can install.
- **Their production traffic/logs: NOT accessible.** Shadow-mode-on-real-traffic (§23 baseline WAR, demo Act 3) cannot be produced by us before the visit.
- **What we CAN see of their loop**: server drives an 8-state machine incl. `MCP_TOOL_EXECUTE`, `CONFIRM_REQUIRED` (`deep/19`, `deep/00`); confirmation-card edits flow back; native confirmation cards already exist platform-wide (`00-MASTER-BRIEF` §5: "VoiceOS already has native confirmation cards (user edits params before firing)").

### 2.3 What the v4 spec needs from the platform that we do NOT have — ranked by Sunday-demo blast radius

1. **HIGH — streaming transcript with stable token ids + revision events** (spec §6-8, the "most defensible piece"). Zero platform access. The live demo of ASR-revision invalidation cannot run on VoiceOS; it must run on our own simulated transcript feed (an adapter that replays a timed interim/final event stream). Without that simulation, demo Act 2's streaming story is dead; with it, it is honest ("simulated decoder, real gate").
2. **HIGH — real logged traffic for shadow mode** (spec §23/§27 Act 3 "their own numbers"). We have none and cannot get any before the visit. Fallback: replay corpus of THEIR publicly reported failures (see replay-corpus-candidates.md) + our measured eval. Act 3 becomes "your community's own reported bugs, caught" — arguably stronger in the room.
3. **MED-HIGH — platform-authoritative spoken-words per tool call.** `said` is model-filled, so transcript-rank provenance (§1) rests on the model honestly copying. Fine for demo; must be stated as the adoption ask (the MCP annotation RFC, §22).
4. **MED — pre-execution hook outside our own tools.** The gate can only guard tools we ship. Demo scopes to our integration; the platform-level story is the pitch.
5. **LOW-MED — barge-in/turn-boundary events (§9), screen-transition events (§12-13).** Modeled in core, demonstrated only in harness; no platform surface. LOW for demo (nobody expects it live), MED for spec completeness table.
6. **LOW — word-level confidence (§14 confusion sets, §15).** Deepgram *can* emit it (`alternatives` are already parsed client-side), so the adoption ask is credible; nothing for us to consume today.

---

## 3. Honest deltas a founder could catch

- Spec says **415** tests; the repo has **416** today. Trivial, but never quote 415 again.
- §26 "schedule undo handle" is live; **the undo tool itself is not** — do not say "undo works."
- Eval latency numbers are **compute-only against a stubbed Slack** — the harness itself prints this; keep printing it.
- The 100% catch rate is on a **self-authored 50-case corpus with a seeded RNG** (`rng(20260817)`) whose drift families were designed alongside the gate. §24 already lists held-out adversarial catch rate as unmeasured; the replay corpus (their reported bugs) is the credibility upgrade.
- The intel brief is dated 2026-08-13 and byte-cited against the installed app; the platform may have shipped changes in the 8 days since. ASSUMPTION: contract unchanged as of today.
