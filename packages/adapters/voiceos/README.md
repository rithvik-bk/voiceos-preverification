# @preflight/adapter-voiceos

> Status: a working **prototype** with a defined VoiceOS integration path — not production-deployed.
> It runs standalone today (in-process self-tests, a stub `send_message` downstream); the two
> real-wiring steps (your downstream `handler` + the L28076 transcript seam) are called out below.

The **integration drop-in**: a local **stdio MCP server** that wraps a downstream tool with the
[`@preflight/core`](../../core) gate — the `withPreflight` pattern. Every call runs the
deterministic gate on its arguments *before* the action fires; the call is either **forwarded**
(PASS/SURFACE) or **refused** with a spoken repair (HOLD/BLOCK). Zero LLM in the hot path.

VoiceOS launches it exactly the way it launches any custom MCP server — `custom-mcp:add`
(`main.deob.js` L31725) → `StdioClientTransport` (L21142) → `listTools` (L21158) →
`callTool {name, arguments}` (L21045). Nothing about VoiceOS changes to install it.

---

## Register it in VoiceOS

Add it as a custom MCP server (the object `custom-mcp:add` accepts — `{name, transport, command,
args, env}`):

```json
{
  "name": "preflight",
  "transport": "stdio",
  "command": "node",
  "args": ["/ABSOLUTE/PATH/preflight/packages/adapters/voiceos/src/bin.ts"],
  "env": {
    "PREFLIGHT_MODE": "observe",
    "PREFLIGHT_LOG": "/ABSOLUTE/PATH/preflight.jsonl",
    "PREFLIGHT_SERVER_ID": "preflight"
  }
}
```

Requires Node ≥ 23.6 (native TypeScript type-stripping — no build step; verified on v24.14.0).
The server exposes one proxy tool per wrapped downstream tool (the stub bin ships `send_message`).

### Environment

| var | values | default | meaning |
|---|---|---|---|
| `PREFLIGHT_MODE` | `observe` \| `enforce` | `observe` | `observe` = shadow (never stops a real call); `enforce` = hold/block |
| `PREFLIGHT_LOG` | file path | *(stderr)* | where `PreflightReceipt`s are appended as JSONL |
| `PREFLIGHT_SERVER_ID` | string | `preflight-voiceos` | `serverId` stamped into every receipt |

> **stdout is the MCP wire.** Receipts are written to `PREFLIGHT_LOG` (or stderr) — **never**
> stdout. Do not add `console.log` to the hot path.

---

## The two modes

- **OBSERVE (default, safe).** Runs the gate, records `observeWouldHaveBlocked`, then **forwards
  the real call regardless**. This is how it ships with zero product risk — turn it on in
  production, read the log, *then* graduate to enforce. (Mirrors `@preflight/core`'s shadow
  stage.)
- **ENFORCE.** On a gate refusal the downstream is **not** called; the server returns a structured
  HOLD/BLOCK result carrying `reasonCode`, the `discrepancy` object, and the suggested spoken
  `repair` — so VoiceOS's confirmation card can render it. On pass, it forwards.

The refusal payload rides in `structuredContent.preflight`:

```jsonc
{
  "preflight": {
    "disposition": "BLOCK",                          // PASS | SURFACE | HOLD | BLOCK
    "forwarded": false,
    "mode": "enforce",
    "reasonCode": "PF_INJECTION_ROUTING_FROM_CONTENT",
    "coreCode": "provenance_mismatch",               // the raw, auditable core code
    "repair": "\"evil@corp.com\" came from what was read … Say the destination if you meant it.",
    "discrepancy": { "param": "target", "proposedValue": "evil@corp.com", "source": "tool_output", "…": "…" },
    "receipt": { /* the full PreflightReceipt, below */ }
  }
}
```

`isError` is `true` only for **BLOCK** (a hard injection refusal). A **HOLD** is
`isError: false` — it means "one spoken answer completes this", not a failure.

---

## The transcript seam (read this — it's the honest scope)

The core's flagship check — the **injection firewall** (a routing target must trace to something
that was *spoken*, never to what was read on screen/in content) — needs the **transcript**. The
zero-mod custom-MCP subprocess boundary carries only `{name, arguments}` (L21045): it is
**transcript-blind**. So the adapter runs in one of two clearly-labeled modes:

- **`full`** — a transcript is present. It arrives as a reserved `_preflight` field inside the tool
  `arguments`:

  ```jsonc
  "arguments": {
    "target": "#eng-backend",
    "text": "the notes",
    "_preflight": {
      "transcript": "send eng backend the notes",
      "interactionId": "<VoiceOS executionId>",
      "referents": [ { "kind": "channel", "id": "C_ENG", "label": "#eng-backend",
                       "aliases": ["eng-backend"], "origin": "tool_output", "tool": "list_channels" } ]
    }
  }
  ```

  To wire this in VoiceOS you thread `this.currentTranscript` into the tool ctx at the dispatch
  fork (**L28076** — the *same one-field seam* VoiceOS already uses for `userRequestText`). That is
  the adoption ask; it is **not** already wired to the MCP fork.

- **`args_only_degraded`** — no transcript (true zero-mod). The adapter **strips the transcript-
  span rule** and runs only what args + queryable state can prove: entity resolution, ambiguity,
  and the min-rank lattice. The receipt is stamped `injectionFirewall: "unavailable_no_transcript"`.
  **The adapter never claims the firewall ran without a transcript.**

`referents` is the routing-eligible pool with explicit provenance (`origin`: `tool_output` → rank
3, `known_state` → 2, `screen` → 1). Supply it via the `_preflight` seam **or** a `context()`
provider on the wrapped tool that queries your backend (e.g. Slack `conversations.list`). Screen
referents load into the pool but rank 1 < the routing minimum, so they can never license a routing
slot — that *is* the firewall, enforced by the lattice.

---

## What it checks — and what it honestly does not

Runs exactly what `@preflight/core` implements today:

| check | core code → product code | disposition |
|---|---|---|
| injection firewall (routing target only from read content) | `provenance_mismatch` → `PF_INJECTION_ROUTING_FROM_CONTENT` | **BLOCK** |
| ambiguous target (two real "Dan"s) | `ambiguous_target` → `PF_AMBIGUOUS_TARGET` | HOLD |
| unknown / unresolvable target | `target_not_found` → `PF_UNKNOWN_TARGET` | HOLD |
| routing source rank below the lattice minimum | `insufficient_provenance` → `PF_INSUFFICIENT_PROVENANCE` | HOLD |
| missing required routing param | `missing_parameter` → `PF_MISSING_PARAM` | HOLD |
| content param the model composed (not spoken) | — | SURFACE (fires, flagged for consent) |

**Not implemented (do not claim these run):** the **number-twin / amount** check
(`$54.79 → $54.99`) and **misbinding** (`refund Dan $50 and Sarah $30` → `refund(Dan,$30)`) are
amount/span checks the *core does not have yet* — the eval catalog marks `amount` and non-entity
referents as capability gaps. This adapter surfaces only checks the core actually performs; it
never fabricates a catch. **ASR-mishear** (the ear wrote the wrong words) is out of scope by
construction — Preflight grounds what was transcribed, it does not second-guess transcription.

---

## Multi-step: the plan trust runtime (`verify_plan`)

The single-call gate verifies **one** action. The trust runtime verifies a whole autonomous
**PLAN** — a DAG of steps the model produced — *before any step fires*. This is the layer that
ships VoiceOS's **dormant DAG workflow engine** (0 rows today): instead of running an unverified
workflow, you hand the plan to `verify_plan`, get back a **proof-tree** (every step classified
`pass` / `hold` / `block` / `deferred`), and let the **autonomy dial** decide what auto-runs.

Three composition rules ride on top of the built lattice (all in `@preflight/core`, all tested):

- **Composition** — a later step's destination may be licensed by an *earlier* step's output, but
  only if that output was **structured tool_output** and was **surfaced/read back** to the user.
  That makes *"email the top lead you found"* **PASS** even though the address was never spoken
  (it's card-tap-equivalent, rank-4). The honest provenance rides in `node.licensedBy`.
- **Taint firewall** — a **content-read** value (an email body, a web page) is tainted and can
  never reach a routing sink; taint propagates along derive edges. That makes *"read the billing
  email and **pay** the address in it"* **BLOCK** — same firewall code (`provenance_mismatch`),
  discovered across steps.
- **Poison** — a step that depends on a held/blocked/deferred step is itself **deferred**. No green
  downstream of a hole.

### Two ways to call it

**Library:**

```ts
import { verifyPlan, runPlan } from '@preflight/adapter-voiceos';

const plan = { steps: [
  { id: 's1', tool: { name: 'search_leads', tier: 1, params: { query: { class: 'content' } } },
    args: { query: 'top lead' }, transcript: 'find the top lead',
    output: { kind: 'structured', surfaced: true, provides: [{ id: 'lead@acme.com', label: 'lead@acme.com', kind: 'person' }], values: ['lead@acme.com'] } },
  { id: 's2', tool: { name: 'send_message', tier: 3, params: { target: { class: 'routing', required: true, slot: 'destination' }, text: { class: 'content', required: true } } },
    args: { target: 'lead@acme.com', text: 'hi there' }, transcript: 'email the top lead you found', dependsOn: ['s1'] },
]};

const tree = verifyPlan(plan, /*session transcript*/ undefined, { referents: [/* grounded pool */] });
// tree.summary → { steps: 2, green: 2, held: 0, blocked: 0, deferred: 0 }

// Apply the autonomy dial + emit a receipt per step:
const run = await runPlan(tree, { s1: plan.steps[0].args, s2: plan.steps[1].args },
  { level: 1, mode: 'enforce', onReceipt: (r) => append(r) });
// run.decisions[i] → { action: 'auto_run' | 'hold' | 'block', ran, receipt }
```

**MCP tool** — set `exposePlanVerification: true` and VoiceOS gets a `verify_plan` tool alongside
the wrapped downstreams (off by default; the plain tool listing stays exactly your downstreams):

```ts
createPreflightServer({ mode: 'enforce', tools: [...], exposePlanVerification: true,
                        onPlanReceipt: (r) => append(r) });
// client.callTool({ name: 'verify_plan',
//   arguments: { plan, transcript, state: { referents }, run: { level: 3, mode: 'enforce' } } })
// → structuredContent.tree (the proof-tree) + structuredContent.run (the dial decisions);
//   isError=true iff any step blocked.
```

### The autonomy dial (per-step runtime gate)

`runPlan(tree, …, { level, mode })` turns each proof verdict into a runtime decision through a pure
policy table (`@preflight/core`'s `autonomy.ts`) — no model, no clock:

| level | `pass` | `hold` | `block` | `deferred` | plan-level |
|---|---|---|---|---|---|
| **L0** confirm-all | hold | hold | block | hold | every action confirmed |
| **L1** hold-flagged | **auto_run** | hold | block | hold | — |
| **L2** approve-tree | auto_run | hold | block | hold | whole tree approved once, upfront |
| **L3** full-auto | auto_run | hold | block | hold | every fired action emits a receipt |

The safety floor is level-invariant: `block`→`block` and `hold`→`hold` at **every** level. Turning
the dial up only relaxes the `pass` row (L0 confirms even grounded passes; L1+ auto-runs them) —
you cannot dial your way into firing an ungrounded or tainted action.

**OBSERVE → ENFORCE migration.** `mode: 'observe'` (default) is shadow: every step is treated as
run (the executor forwards), a flagged step is labeled `observeWouldHold` / `observeWouldBlock` on
its receipt, and **nothing is ever withheld** — so the trust layer ships on top of the live DAG
engine with zero product risk. You watch the proof-tree light up over real traffic, confirm the
holds/blocks are the ones you'd want, then flip to `mode: 'enforce'` to actually stop the flagged
steps. The proof-tree and receipts are byte-identical across the switch; only whether a flagged
step fires changes.

**Latency:** the gate is 5.4µs clean / 238µs worst (measured, `@preflight/core`); a 40-step plan is
sub-10ms — no perceptible speed cost. `verify_plan` runs entirely before the DAG executes.

### The transcript seam still applies per step

Each step carries the utterance it acts for (`step.transcript`); steps that omit it fall back to
the session `transcript` argument. With no transcript, that step runs **args-only degraded** exactly
as the single-call path does (destination-slot rule stripped so an empty transcript can't
false-block) — the same honest labeling, per step.

---

## The seam to post-verification (Arav)

Every call emits a **`PreflightReceipt`** to the log — the object keyed on VoiceOS's
`executionId`/`interactionId` that a downstream post-verifier consumes. This package builds the
receipt and **none** of post-verification.

```jsonc
{
  "interactionId": "…", "serverId": "…", "toolName": "send_message",
  "args": { "target": "#eng-backend", "text": "the notes" },
  "mode": "enforce", "transcriptMode": "full", "injectionFirewall": "active",
  "verdict": "PASS",
  "routingParams": [ { "name": "target", "value": "#eng-backend", "source": "transcript_span",
                       "sourceRank": 4, "transcriptSpan": "u1.w1+u1.w2",
                       "resolvedId": "C_ENG", "resolvedLabel": "#eng-backend" } ],
  "contentParams": [ { "name": "text", "source": "transcript_span", "sourceRank": 4, "surfaced": false } ],
  "transcriptSnapshot": { "utteranceId": "u1", "text": "…", "spanIds": ["u1.w0","u1.w1","…"] },
  "firedAt": 0
}
```

`firedAt` comes from an injected clock (pinned in tests → byte-deterministic receipts).

---

## Wiring your real tool

`src/bin.ts` wraps a **demo** `send_message` (an echo downstream) so the server registers and runs
standalone. To ship for real, replace two things:

1. `handler` → your real downstream call.
2. `context()` → a provider that returns the grounded pool for the call (query your backend for the
   valid channels/users), and — once the L28076 seam is wired — the transcript.

Programmatic use:

```ts
import { createPreflightServer } from '@preflight/adapter-voiceos';
const { server } = createPreflightServer({
  mode: 'enforce',
  tools: [{
    name: 'send_message', tier: 3,
    params: { target: { class: 'routing', required: true, slot: 'destination' },
              text:   { class: 'content', required: true } },
    handler: (args) => slack.chat.postMessage(args),
    context: async (args) => ({ referents: await listSlackTargets() }),
  }],
  onReceipt: (r) => appendFileSync('preflight.jsonl', JSON.stringify(r) + '\n'),
});
// server.connect(new StdioServerTransport())  ← bin.ts does this for you
```

---

## Test (Definition of Done)

```
cd packages/adapters/voiceos
npm test          # node --test — starts the server in-process, no VoiceOS needed
```

The self-test (`test/server.test.ts`) wires an MCP `Client` to the server over the SDK's in-memory
linked transport and asserts: a clean call **forwards**, an ambiguity **HOLDs**, an injection
**BLOCKs** (downstream never called), OBSERVE forwards + records `would_have_blocked`, and degraded
mode **labels** the firewall unavailable instead of faking it. 7/7.

`test/plan.test.ts` adds the trust-runtime contract: a clean plan **all-green**, *email the lead you
found* **PASS** (composition), *pay the email address* **BLOCK** (taint), poison → **deferred**, the
autonomy dial at L0/L1, observe-shadow labeling, and the `verify_plan` tool over the wire. 11/11
(package total: 18/18 — 7 in `server.test.ts` + 11 in `plan.test.ts`).
