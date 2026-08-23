# Integrating Preflight with VoiceOS

Preflight is a deterministic **pre-verification** gate for tool calls. It runs the core gate
(`packages/core`) on a proposed tool call's arguments *before* the call executes, and either
forwards the call (PASS/SURFACE) or refuses it (HOLD/BLOCK). There is no LLM and no network in the
check — it is enforced pure compute (see `packages/core/test/enforcement.test.ts`), same input →
same output, latency in microseconds (`packages/core/bench/bench.ts`).

Scope of this document: **pre-verification only.** Post-verification (checking the *result* of a
call) is a separate lane owned by a teammate and is not designed or discussed here.

Status: this is a clean, well-tested **prototype** built for an internship audition with VoiceOS
(WakoAI). It is not deployed to production. What follows is the integration path we would take, the
exact split between what works with zero changes to VoiceOS and the single change that unlocks the
full check set, and a rollout that ships nothing risky first.

---

## 1. Where Preflight sits

Based on our analysis of the VoiceOS client, VoiceOS launches custom MCP servers as **local stdio
subprocesses** (`StdioClientTransport`) via its `custom-mcp:add {command, args, env}` mechanism.
Preflight ships as exactly one such server.

```
  VoiceOS agent ──(stdio: JSON-RPC MCP)──▶  Preflight MCP server  ──▶  downstream tool
     (dispatch fork)                        (packages/adapters/voiceos)   (Slack, payments, …)
```

The Preflight server (`packages/adapters/voiceos/src/server.ts`) exposes **one proxy tool per
wrapped downstream tool**. On `callTool` it runs the gate over the arguments and maps the result
onto a standard MCP `CallToolResult`:

- **PASS / SURFACE** — the call is forwarded to the downstream; the downstream payload is returned,
  with the verdict + receipt attached under `structuredContent.preflight` so the UI can render the
  proof.
- **HOLD** (ENFORCE mode) — not forwarded; `structuredContent.preflight` carries the reason code,
  the discrepancy, and a spoken repair line. `isError: false` — a HOLD means "needs one answer,"
  not a failure.
- **BLOCK** (ENFORCE mode) — not forwarded; same payload, `isError: true` — a hard refusal (the
  injection firewall).

The server deliberately uses the low-level MCP `Server` (not the Zod-schema `McpServer`) so it can
pass arbitrary arguments through **untouched** — including the reserved seam field described below —
and control `isError` / `structuredContent` precisely. No input schema is imposed on the caller.

---

## 2. Zero-mod vs the one-field transcript seam

This is the honest split. Two operating modes are **auto-detected per call** (never assumed) from
whether a transcript is present in the call context — see `hasTranscript` in
`packages/adapters/voiceos/src/context.ts` and the branch in `withPreflight.ts`.

### 2a. Zero-modification mode (`args_only_degraded`)

The custom-MCP stdio boundary carries only `{ name, arguments }`. That boundary is
**transcript-blind**. With no transcript, Preflight runs in `args_only_degraded` mode and the
following checks **still run**, against the grounding pool:

- **Schema / class checks** — routing vs content classification of each parameter.
- **Ambiguity** — a target that matches more than one known referent → HOLD.
- **Target resolution + rank** — a hallucinated destination the pool has never seen →
  `target_not_found` → HOLD; a destination whose only witness is a screen-scraped name (lattice
  rank 1) can never license a routing slot.

What is **not** available in this mode, and is labeled as such — never faked:

- **The injection firewall** (transcript-span licensing) and any transcript-span rule are stripped
  from the contract for the call (`stripSlots` in `withPreflight.ts`). An empty transcript would
  otherwise false-block *every* destination as "injection." The receipt records
  `injectionFirewall: 'unavailable_no_transcript'` and `transcriptMode: 'args_only_degraded'`.

So a fully zero-mod install gives real value (ambiguity, hallucinated-target, idempotency/rank
checks) but cannot do the checks that depend on comparing the call against what was actually spoken.

> Partial recovery without touching VoiceOS: a `WrappedTool` may supply a `context()` provider that
> queries the downstream for its own pool (e.g. Slack `conversations.list`) to populate referents.
> That improves resolution/ambiguity coverage. It does **not** recover the firewall — that needs the
> transcript.

### 2b. The one-field seam (`full`)

Based on our analysis of the VoiceOS client, the client already holds `currentTranscript` at its
dispatch fork. Threading that one field into the tool-call context — delivered to Preflight as a
reserved `_preflight` argument (`PREFLIGHT_ARG_KEY = '_preflight'`, `withPreflight.ts`) — flips the
call into `full` mode and unlocks the checks the zero-mod path can't do:

- **Injection / ungrounded-destination firewall** — content can never license a routing
  destination; a destination that appears only in injected/tool content and was never spoken is
  BLOCKED.
- **Number-twin / not-spoken-amount** — an amount in the args that is not in the speech
  (`amount_not_in_speech`, e.g. `54.99` proposed when only `54.79` was said).
- **Span attribution / cross-clause misbinding** — each argument is licensed by the transcript span
  that actually authorized it; a value bound to the wrong clause is caught.

The `_preflight` payload is a plain `PreflightContext` object (`context.ts`):

```jsonc
{
  "_preflight": {
    "transcript": "send fifty four seventy nine to Alex for lunch",
    "utteranceId": "u_8821",
    "interactionId": "exec_4477",          // round-tripped; keys the receipt
    "referents": [                          // routing-eligible pool, each with provenance
      { "kind": "person", "id": "U04", "label": "Alex", "origin": "tool_output" }
    ]
  }
}
```

`origin` maps directly onto the provenance lattice: `tool_output` → rank 3, `known_state` → rank 2,
`screen` → rank 1. Rank 1 is below the routing minimum, so screen-scraped names load into the pool
but can never license a routing slot — that *is* the firewall, enforced by the lattice, not by the
loader.

**This is a one-field seam, not a rewrite.** Everything downstream of it (the whole gate) already
exists. The only change on the VoiceOS side is adding `currentTranscript` (and, where available, the
referent pool and execution id) to the tool-call context at the dispatch fork.

### What neither mode catches — stated plainly

Preflight grounds the call against what was **transcribed**. It cannot catch a true **ASR
mishear**: if the transcript itself is wrong, this layer cannot see it. That is an ASR-confidence +
read-back concern — a different layer, not this one.

---

## 3. Rollout: OBSERVE → ENFORCE

Every wrapped tool runs in one of two modes, selected per server (default is the safe one). See the
branch in `makeRunCall` (`withPreflight.ts`) and the shadow log (`packages/core/src/shadow.ts`).

- **OBSERVE (default, ships first).** The gate runs, and on a refusal the receipt records
  `observeWouldHaveBlocked: true` with the reason code, discrepancy, and repair — **then forwards
  the real call anyway.** Nothing is ever withheld. This lets you run Preflight in production against
  live traffic, collect what it *would* have held/blocked, and tune contracts and annotations with
  zero product risk.
- **ENFORCE.** On a refusal the structured HOLD/BLOCK is returned to VoiceOS and the downstream is
  **not** called; PASS/SURFACE still forward.

Recommended path: **OBSERVE-first.** Wire the server, run OBSERVE across the tool set, review the
`observeWouldHaveBlocked` receipts, confirm the block set is exactly the wrong calls (no false
positives on legitimate traffic), then flip individual tools to ENFORCE.

The multi-step trust runtime (`plan.ts` / `compose.ts` / `taint.ts` / `autonomy.ts`, surfaced via
the optional `verify_plan` tool and `runtime.ts`) carries the *same* OBSERVE/ENFORCE split for whole
plans. It is a **prototype that demonstrates the idea** — proof-tree composition, a taint firewall,
and an autonomy dial. VoiceOS does not ship multi-step autonomy today, so this is off by default
(`exposePlanVerification: false`) and is not wired into any live product.

---

## 4. Minimal wiring example

Taken from the real adapter (`withPreflight.ts` `WrappedTool` / `makeRunCall`, `server.ts`
`createPreflightServer`). You describe each downstream tool once — its parameter classes and its
real handler — and Preflight builds the gated proxy.

```ts
import { createPreflightServer } from '@preflight/adapters-voiceos';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const { server } = createPreflightServer({
  serverId: 'preflight-voiceos',
  mode: 'observe',                 // default; flip to 'enforce' per rollout
  onReceipt: (r) => logReceipt(r), // receipt sink — MUST NOT write to stdout (that is the MCP wire)
  tools: [
    {
      name: 'send_message',
      tier: 2,
      // routing/content classification of each param — the ToolContract seed (§5).
      params: {
        channel: { class: 'routing', required: true },   // a destination → firewalled
        text:    { class: 'content', required: true },    // a payload → may be model-composed
      },
      // the real downstream call. Only invoked on PASS/SURFACE (and always in OBSERVE).
      handler: async (args) => slack.chat.postMessage(args),
    },
  ],
});

await server.connect(new StdioServerTransport());
```

Mechanically, for each tool `createPreflightServer` builds a `runCall(args)` via `makeRunCall`. On
every invocation `runCall`:

1. pulls the `_preflight` seam field out of the args (`extractSeamContext`), leaving the clean args
   the downstream will receive;
2. merges the seam context with any `context()` provider (inline transcript is authoritative; the
   provider fills gaps such as the pool);
3. picks `full` vs `args_only_degraded` from `hasTranscript`, and in degraded mode strips the slot
   rules (`stripSlots`);
4. runs `runGate(call, contract, store)` from core;
5. on PASS forwards to `handler` and returns the downstream payload + a receipt; on refusal returns
   the structured HOLD/BLOCK (ENFORCE) or forwards anyway and flags `observeWouldHaveBlocked`
   (OBSERVE).

Every call emits exactly one `PreflightReceipt` (`packages/adapters/voiceos/src/receipt.ts`) through
the `onReceipt` sink, carrying the mode, the transcript mode, the injection-firewall state, and the
per-parameter proof.

---

## 5. What annotations a tool needs

A tool becomes gate-aware by declaring, per parameter, whether it is a **routing** slot (a
destination/target/amount/permission — firewalled, must be licensed by speech + the pool) or a
**content** slot (a payload — may be model-composed and will `SURFACE`). This is the
`params: Record<string, ParamSpec>` seed shown above; the `class` (and optional `slot`) is exactly
what distinguishes a destination that must be grounded from free text that need not be.

Reusable, checked-in catalogs and the format live in `packages/contracts`:

- **Catalogs** — `packages/contracts/catalogs/voiceos.annotations.json` and
  `packages/contracts/catalogs/slack.annotations.json`: worked examples of tool → parameter
  annotations you can copy and adapt.
- **Format spec** — `packages/contracts/FORMAT.md`: the annotation schema (parameter classes,
  slots, tiers) and the rules for writing them.
- **Linter** — `packages/contracts/src/lint.mjs`: validates a catalog against the format. Run it in
  CI so annotations can't drift from the spec.

Start from the VoiceOS catalog, annotate each tool you intend to wrap, lint it, and feed those
annotations in as the `params` of each `WrappedTool`.

---

## Test posture

Run per package with `node --test`:

- `packages/core` — 51 tests / 50 pass / 0 fail / 1 todo
- `packages/adapters/voiceos` — 18 / 18
- `packages/contracts` — 13 / 13
- `packages/eval` — 20 / 20

Total: **102 tests, 101 pass, 0 fail, 1 honest todo.** The one todo is a documented residual — an
undeclared-taint-launder / confused-deputy case that pure pre-verification cannot catch without
executor dataflow. It is left as a labeled todo, not a hidden failure and not something claimed to
work.
