# PREFLIGHT — MAX-CEILING FEASIBILITY SCAN
*RECON, 2026-08-22. Grounds every row in a real file/line in `~/voiceos-intel/` or the installed app read this session. Nothing from memory. Method for the deob cites: `deep/main.deob.js` (fully deobfuscated 3.3 MB main process, per `deep/18` §method). `[E]` = I read the code/ran the query this session · `ASSUMPTION:` = inference + how to verify. This scan's job: find how much Preflight ships with ZERO VoiceOS cooperation, and route around every locked door.*

---

## PRIORITY 1 — THE LOAD-BEARING QUESTION: what does a tool actually receive at fire time?

**Definitive answer: an integration/MCP process receives ONLY the model-produced tool-call arguments — NOT the transcript.** But the transcript IS available client-side in three other places, one of them before the tool fires. So the provenance gate can run, just not purely from the MCP payload.

### 1a. The MCP boundary carries args only `[E]`
- The server delegates a local tool run to the client with `AGENT_STATUS_MCP_TOOL_EXECUTE` carrying `{executionId, serverId, toolName, args}` and nothing else (`deep/19` §1.4/§3.1; enum at `main.deob.js:728`, router at `:28040`). The integration's `tools/call` handler is invoked with `params.arguments` = that `args` object (golden template `13-reference-integrations.md` §2, `callTool(p){ ...t.h(p.arguments||{}) }`). No transcript field exists in the call.
- The `said` "user's exact spoken words" arg used by the money gate is a **declared inputSchema property the MODEL fills**, not a platform-injected field (`13` §1 refund_payment schema `required:["said",...]`; `01`/`04` note `said` is model-filled). So transcript-rank provenance today rests on the model faithfully copying the transcript into `said`. That is the honest floor and the RFC ask (§22/§28).
- Consequence: a gate living **inside our own MCP handler** sees args + whatever the model copied into `said` — it cannot independently see what the user actually said through the MCP contract alone.

### 1b. Where the transcript IS, client-side — including at fire time
| Source | Fire-time? | Evidence |
|---|---|---|
| **Agent status broadcast to the notch/pill/spotlight renderers** | **YES — before the tool fires** | `sendToAgentUI(evt,msg)` does `webContents.send(AGENT_STATUS_UPDATE, msg)` to pillWindow, agentNotchWindow, spotlightOverlayWindow (`main.deob.js:2128-2140`). The stream message is `{status, message}` (`:2132`). Stream order is `TRANSCRIBING(0) → THINKING(1) → TOOL_SEARCH(2) → …MCP_TOOL_EXECUTE(9)` (enum `:728`), so the transcribing message reaches the renderer well before any tool executes. ASSUMPTION: the `TRANSCRIBING` message's `.message` field holds the transcript text (verified for `AGENT_STATUS_TEXT` at `:2132`; the notch's live "as you speak" transcript UX implies the same field for status 0) — verify by logging the msg in a renderer subscriber. |
| **Direct dictation IPC push** (DICTATE/EDIT/WRITE modes) | YES (dictation path) | `WindowMessenger.sendTranscriptionResult` → `webContents.send("transcription-result", payload)` (`main.deob.js:7963`); `voice-session-created` carries `{transcript,...}` (`:7943`). This is the non-agent path (client talks to Deepgram directly, `deep/20` §2). |
| **SQLite `voice_sessions.transcript` + `agent_turns.user_message`** | POST-HOC (at/after turn completion) — good for shadow/receipts/WAR, racy for fire-time | Schema `main.deob.js:2620` (voice_sessions), turn upsert `:3033`. Live DB read this session: `~/Library/Application Support/VoiceOS/voiceos.db`, `journal_mode=delete`, recent rows have `transcript` populated `[E]`. Written via `ON CONFLICT DO UPDATE` (`:2983`, `:3033`) so it's a settle-during/after-turn store, not a pre-dispatch signal. |

**Bottom line for the architecture:** the gate that compares args↔transcript can run in two shapes — (i) **in-loop, in our own MCP handler**, using the model-filled `said` arg (live today, but transcript-authority = model honesty); or (ii) **as a client-side companion** that reads the true transcript from the renderer IPC broadcast (fire-time) or the DB (post-hoc). It CANNOT run as neutral platform middleware in front of *other* people's tools — no such seam is exposed (`deep/18` §pre-execution; `recon-access-check.md` (3)).

---

## PRIORITY 2 — THE LOCKED-DOOR / ROUTE-AROUND TABLE

| Signal Preflight's spec wants | Class | Evidence | Route-around (concrete) |
|---|---|---|---|
| **Transcript delivered to the integration at fire time** (§1 basis) | **ROUTE-AROUND** | MCP call = args only (`:28040`, `13`§2); transcript in renderer broadcast (`:2128`) + DB (`:2620/:3033`) | In-loop: model-filled `said` arg (`13`§1) — live today. Companion: subscribe to `AGENT_STATUS_UPDATE` in a renderer surface for fire-time text, or read `voice_sessions.transcript`/`agent_turns.user_message` for shadow/receipts. |
| **Streaming stable token ids + transcript-revision events** (§6-8) | **LOCKED** | Audio (not text) is streamed to the server; ASR + finalization happen server-side (`deep/19` §0/§1.1, `audioData:Uint8Array` `:4237`). `interim_results=true` exists only on the **direct-Deepgram dictation socket** in main.js (`deep/20` §2), not on the agent path, and no token-id/revision event crosses to any consumable client surface. | **No live route-around.** Feed a **simulated timed interim/final decoder** into the real gate (harness) for demo Act 2; label "simulated decoder, real gate." Genuine adoption ask for live. |
| **Word-level ASR confidence** (§15 last drift family) | **LOCKED (hard)** | `grep -n "confidence\|\"words\"" main.deob.js` → **zero hits** `[E]`. VoiceOS parses Deepgram transcript text but **discards per-word confidence entirely** — it is gone even client-side, not merely un-forwarded. | **No route-around.** This is THE clean adoption hook (§28): "expose per-token confidence to the tool layer." Everything else already caught from outside; this is the one true ask. |
| **Screen / surface-transition + accessibility events** (§13) | **ROUTE-AROUND (partial)** | VoiceOS captures screenshots + full macOS a11y tree + focused element itself (`getAccessibilityTree` `:4155/:5513`; `window-text-captured` `:29516`; `check-focused-editable` `:33362`; `AccessibilityContextSchema` in proto `deep/19`§1.2), but screen is **one-turn lagged** even for their own agent (`oauth-design/C1` §1: "acting on a stale frame… root cause of the calendar end-time bug"). Not pushed to third-party integrations. | A Preflight **companion runs its own macOS Accessibility reads** (same AX APIs VoiceOS uses) for surface-id + focused element, honoring §13's "invalidate on transition, never re-point." Inherits the same one-turn-lag limit → keep §13's degrade-to-no-ordering policy. Enough for the screen-boundary guarantees; not enough to *introduce* values (which §12 forbids anyway). |
| **Pre-execution hook — intercept/block BEFORE a tool fires** | **ROUTE-AROUND (our/wrapped tools) · LOCKED (arbitrary 3rd-party tools)** | The only interception point an outsider owns is **inside their own MCP server's `tools/call` handler** (`deep/18` §pre-execution "no platform middleware slot"; `recon-access-check.md` (3): model→Composio→Slack write path never touches the client except as progress events). MCP_TOOL_EXECUTE routes straight to each `serverId` (`:28040`) — no shim seam in front of it. | **The wrapper/library pattern.** Preflight ships as a drop-in gate that runs in-process at the top of each integration's own handler (exactly where the Slack gate lives today, `recon-inventory.md` §1.2). To gate a tool we don't own, **re-publish it wrapped** ("Stripe, Preflighted" — our server.ts holds the real logic and gates every arg before executing). Coverage = every adopting/wrapped integration. Gating *un-wrapped* third-party tools is impossible without the platform → that's the §22 RFC. |
| **Live traffic / logs for a real WAR baseline** (§23-24, demo Act 3) | **ROUTE-AROUND (with a caveat)** | Their server-side production logs are inaccessible (`recon-inventory.md` §2.2). BUT the **local `voiceos.db` is real on-device logged traffic**: `voice_sessions` [155], `agent_turns` [108] with `user_message`+`duration_ms`, `agent_tool_calls` [69] with `tool_name`/`tool_slug` (`deep/15` §2.2, re-confirmed live this session). | Run shadow-mode over the **local DB** = a real (not synthetic) WAR/routing baseline on this machine, + the replay corpus of community-reported bugs. **Caveat (honest):** `agent_tool_calls.input_json` is **100% NULL** (`deep/15` Part 3) — historical **param args were never persisted**, so DB shadow-mode grades *routing* (utterance→tool) but **cannot replay param-drift** from history. Param-drift gating is fire-time-only (we see args live). State this out loud. |
| **Per-tool confirmation-card control (what we can render)** | **AVAILABLE** | Integrations declare a manifest `confirmation` card; typed editable fields (`textField`/`select` with `bind`), **edited values replace the model's args and flow back** via `voiceos:updateInput` (`01`§5.4; `13`§1 Dialect B). VoiceOS floats its own confirm/cancel (44px reserve) — a card can never self-approve (`00-MASTER-BRIEF` §7). | No route-around needed. This is a first-class, owned surface — the ambiguity/diff/confirm-echo cards (§14/§15.4) render natively today. Limit: one confirm + one cancel; the platform owns final approval. |

---

## PRIORITY 3 — THE CEILING: max production-ready Preflight with ZERO platform cooperation

**Stop assuming we're an in-loop platform gate. We're not, and can't be. The architecture that IS possible client-side:**

> **Preflight = a drop-in provenance-gate library that runs inside each integration's own `tools/call` handler (the one seam outsiders own), fed the transcript by the model-filled `said` arg in-loop, with a client-side companion reading `voiceos.db` + the `AGENT_STATUS_UPDATE` renderer broadcast for shadow-mode, receipts, and the WAR baseline. Coverage scales by adoption (wrap a tool → it self-gates), not by platform permission.**

Two processes, both fully client-side, no new VoiceOS API:
1. **In-handler gate (fire-time, blocking):** the pure decision core already extracted to `packages/core` (lattice, resolveTarget, grounding store, time resolution, PreflightBlock codes — `recon-inventory.md` §1.2). Runs in-process, blocks before the write, renders the native confirmation card. Gates our tools + any wrapped tool.
2. **Companion (observe/shadow/receipts):** reads `voiceos.db` (routing baseline, receipts, WAR) and optionally the IPC transcript broadcast. Never blocks; produces the numbers.

### What becomes FULLY LIVE this way (no platform cooperation), on adopting/wrapped tools:
- **§1** provenance lattice, **§2** routing/content split + taint, **§3** derived time/quantity, **§5** the three tiers, **§10** grounding lifecycle + TTL demotion (in-process session store), **§11 injection firewall** (the strongest — structural, needs no signal from anyone), **§12** screen boundary (trivially satisfied: we simply never accept screen as sufficient grounding), **§14** entity-collision + rescue-only fuzzy, **§15** magnitude guarding *except* the confidence family, **§16** deterministic undo, **§17** receipts, **§18** eval + replay, **§19** shadow/warn/enforce + per-tier fail policy + kill switch, **§20** declarative contracts + CI lint, **§21** schema-linter telemetry, **§23** WAR on our own/local traffic.
- **§4 repair — partial live:** step 1 (recompute) and step 3 (ask-then-card) run in-handler. **Step 2 (constrained re-emit)** requires re-invoking the agent's model, which an MCP handler cannot do → **route-around: fold the closed candidate set into the confirmation card** (one tap picks from the grounded set) instead of a silent model re-emit. Honest label: "re-emit is harness-proven; in-product it degrades to a candidate-set card."

### What is genuinely harness-only or specified (honest not-live):
- **§6-8 streaming** (token ids, revision invalidation, speculation): simulated decoder → real gate. No live route-around.
- **§13 broad screen drift**: one live AX-companion fixture possible; broad coverage stays harness.
- **§22/§25/§29** RFC / cost experiment / commercial argument: documents + experiment designs by nature.

---

## WHAT GENUINELY STILL NEEDS THEM (the adoption ask — short, and it is small)
1. **Per-token ASR confidence exposed to the tool layer** — the ONE signal that is discarded even client-side (`grep`→0 hits). Closes the last §15 drift family. This is the clean §28 hook.
2. **A streaming transcript surface with stable token ids + revision events** — to make §6-8 live instead of simulated (their agent path finalizes server-side; interim exists only on the dictation socket).
3. **A platform pre-execution middleware seam** — to gate tools we do NOT own/wrap (the §22 MCP-annotation RFC): today we can only gate our own + re-wrapped tools.
4. **Platform-authoritative spoken-words per call** (transcript delivered to the tool, or `said` injected by the platform not the model) — upgrades transcript-rank provenance from "model honestly copied it" to a guarantee.

Everything else on the v4 spec ships with zero cooperation.

---

### Route-around scorecard
Doors that looked locked but have a real client-side route-around: **4** — (1) transcript at fire time [`said` / IPC broadcast / DB], (2) pre-execution blocking [in-handler gate + wrapper pattern], (3) real WAR baseline [local `voiceos.db` is genuine on-device traffic], (4) screen/accessibility context [our own macOS AX reads]. Doors with NO route-around, hence the genuine adoption ask: **2** — live streaming token-ids/revision (§6-8) and word-level ASR confidence (§15/§28).
