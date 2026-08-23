# RECON ACCESS CHECK — Is VoiceOS's own Slack integration accessible to us?
*RECON, 2026-08-21, answering G0 amendment 5. Local sources only: `~/voiceos-intel/deep/19-agent-loop-connectors.md` (decoded main.js, line-cited), `~/voiceos-intel/03-tool-catalog-and-db.md`, `~/voiceos-intel/oauth-design/INTEGRATIONS-DISCOVERY.md`, `~/voiceos-intel/oauth-design/C3-memory.md`, `~/voiceos-intel/00-MASTER-BRIEF.md`. No web.*

## (1) Does a first-party Slack integration exist? — YES, but it is a server-side Composio connector, not a native integration

- **It IS Composio, verbatim:** `main.js:10556` — `composioLogo = (slug) => "https://logos.composio.dev/api/" + slug`; the integration catalog is `[{slug, name, logo: composioLogo(slug), bundleIds, urlHosts}]`, and CSP whitelists `logos.composio.dev` (deep/19 §2.1).
- **Slack is in the 9-slug Composio catalog:** `slack, gmail, googlecalendar, outlook, googlesuper, linear, jira, notion, canvas` (`main.js:10556`, deep/19 §2.2), with slack→`com.tinyspeck.slackmacgap` bundleId used only for on-screen context detection.
- **Action IDs are verbatim Composio action names:** `SLACK_SEND_MESSAGE` appears in `SCHEDULABLE_ACTION_TOOLS` at `main.js:22599` alongside `GMAIL_SEND_EMAIL`, `GOOGLECALENDAR_CREATE_EVENT` (deep/19 §2.1).
- **Execution is entirely server-side:** "server-side Composio toolkits (gmail/slack/notion/…) that the server executes itself after OAuth it holds — the client only *enables* them and reads results out of the stream" (deep/19 §1). The client's only inputs are the `enabledToolkits` list and a cached `connectedToolkits()` store key; "it never sees OAuth tokens — those live server-side (Composio)" (deep/19 §2.3, `main.js:22599`).
- Corroboration: `INTEGRATIONS-DISCOVERY.md:2` — "Slack exists via Composio"; `C3-memory.md:103` — "the client never sees Gmail/Slack/Notion content — Composio connectors execute server-side with server-held OAuth."

So the precise statement for the room: **VoiceOS ships a Slack capability, rented from Composio and executed on api.voiceos.com — there is no first-party Slack code in the product.** Never say "no Slack exists" (false, a founder kills that instantly); say "no owned, inspectable, client-side Slack exists."

## (2) Can we read its tool schemas/code the way the brief read the rest of the app? — NO

- The intel brief's method (decode the Electron bundle) explicitly bottoms out here: "Everything server-side (LLM, Composio execution, OAuth token custody, ASR brokering) is `[SERVER]` at api.voiceos.com and not present in this bundle" (deep/19, line 141).
- What IS on-disk and readable: the toolkit slug catalog, the 11-item `ALL_TOOLKITS` list, the 5 `SCHEDULABLE_ACTION_TOOLS` action names (incl. `SLACK_SEND_MESSAGE`), bundleIds/urlHosts, and the stream-event surface (`TOOL_EXECUTING/TOOL_RESULT` are "informational only," deep/19 §1.x at line 37). That is a **namespace**, not schemas.
- ASSUMPTION: Composio publishes its action schemas (incl. `SLACK_SEND_MESSAGE` args) in public docs, so the arg shapes could be reconstructed — but that is a web check, out of scope this task; any harness built on those shapes must carry the ASSUMPTION tag until verified.

## (3) Could our gate run against THEIR Slack tools? — Not demonstrably; in harness only, against a reconstructed namespace

- **Live interception is impossible from our side:** the model→Composio→Slack write path never touches the client except as progress events; there is no seam where a third party can insert a pre-write gate (consistent with UNKNOWNS U4). The one client-side seam that exists — `MCP_TOOL_EXECUTE {serverId, toolName, args}` routing (deep/19 §find at `main.js:17282/28040/26241/10741`) — carries **local** MCP tools, not the Composio plane.
- **Harness-only is possible but weaker than it sounds:** we could score drift fixtures against the `SLACK_SEND_MESSAGE`-style namespace (deep/19's own takeaway A says this is "the exact routing surface our pre-validation/routing eval should target"), but the arg schemas would be ASSUMPTION-tagged reconstructions, and a founder can ask "did you run our actual tools?" — answer would be no.
- **Verdict for Act 3: do not lead with their Slack.** The stronger, fully-true lead is unchanged: Rithvik's Slack integration (his personal project, never part of their product) is **the only gate-able Slack path on the platform** — client-side, MCP-stdio, code we own line-by-line, 416 tests, measured eval — while the platform's own Slack is a rented server-side pass-through that (a) nobody outside Composio can audit, and (b) sits on the Composio dependency the founders already feel as a liability (`00-MASTER-BRIEF.md:66`). Their Slack's very inaccessibility IS the pitch: a platform-level Preflight seam (the §22/§28 RFC ask) is the only way even VoiceOS could gate that plane.
- Bonus eval hook, real and cite-able: their own scheduling engine contains a refusal guard for scheduling a not-connected toolkit (deep/19 takeaway D) — "the guard string proves they care" — usable as evidence that deterministic pre-write guards are already their instinct, just not systematized.

## Bottom line for the coordinator
First-party Slack exists (Composio, server-side, `main.js:10556`/`22599`), its schemas/code are NOT readable from local sources, our gate cannot demonstrably run against it, and Act 3's lead does not change — it sharpens: his integration is the only Slack on the platform anyone can inspect, gate, or test.
