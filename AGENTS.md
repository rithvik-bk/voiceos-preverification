# AGENTS.md

Instructions for an AI agent (or a human) to install, wire, and operate Preflight end to end. Follow the steps in order. Every command is copy-pasteable.

## What you are installing

Preflight is a deterministic pre-verification gate for voice-agent tool calls. It runs BEFORE an irreversible action fires and checks that every routing parameter (recipient, amount, destination) traces back to something the user actually said. It has zero runtime dependencies, zero LLM calls, and zero network access in the hot path.

## Requirements

- Node.js `>=23.6` (the repo runs TypeScript natively; no build step is needed to run the core, adapter, contracts, or demos)
- No API keys. No accounts. Nothing to configure to try it.

## Step 1: Get the code

```bash
git clone https://github.com/rithvik-bk/voiceos-preverification
cd voiceos-preverification
```

## Step 2: Verify it works on this machine

```bash
npm test
```

This runs every workspace's tests. All tests must pass before you continue. If Node is older than 23.6, stop and upgrade Node first; that is the only environmental requirement.

## Step 3: Run the demos to see real verdicts

```bash
npm run demo --workspace @preflight/demo --if-present
```

The demos in `packages/demo` are driven by the real gate (`packages/core/src/gate.ts`), not hand-faked output. Read what gets blocked and why before wiring anything.

## Step 4: Wrap your MCP tool server in OBSERVE mode

The adapter in `packages/adapters/voiceos` is a stdio MCP server that wraps your downstream tools:

```ts
import { withPreflight } from "@preflight/adapters-voiceos";

withPreflight(server, { mode: "OBSERVE" });
```

- **OBSERVE** never blocks anything. It logs every action the gate WOULD have refused, with the reason.
- Point your MCP client (VoiceOS, Claude, any MCP host) at the wrapped server exactly as it pointed at the original one. Nothing else about your product changes.

## Step 5: Declare which parameters need provenance

Provenance requirements live as annotations on the tool schema, never as logic in your code. Copy the pattern from the shipped catalogs:

- `packages/contracts/voiceos.annotations.json`
- `packages/contracts/slack.annotations.json`
- Format reference: `packages/contracts/FORMAT.md`

For each tool, mark which parameters are routing parameters (who it goes to, how much, where). Run the contracts linter in `packages/contracts` to validate your catalog.

## Step 6: Read the OBSERVE log, then enforce

Run your real traffic in OBSERVE mode. Read the log of would-have-blocked calls. When the log convinces you the gate only catches genuinely wrong actions:

```ts
withPreflight(server, { mode: "ENFORCE" });
```

ENFORCE refuses blocked calls with the verdict and the failed parameter as structured data your agent can read and recover from.

## Step 7 (optional): Run the eval corpora

```bash
npm run test --workspace @preflight/eval --if-present
```

The eval harness in `packages/eval` runs the `self`, `blind`, and `replay` corpora and reports them separately. Cases the current build cannot run are scored `NOT-RUNNABLE-YET` with the missing capability named, never silently passed.

## Where everything lives

| Path | What it is |
|:---|:---|
| `packages/core` | The gate and trust runtime: provenance lattice, transcript spans, fuzzy resolution, `gate.ts` |
| `packages/adapters/voiceos` | The stdio MCP wrapper, `withPreflight(server, { mode })` |
| `packages/contracts` | Annotation catalogs, the linter, and `FORMAT.md` |
| `packages/eval` | The eval harness and corpora |
| `packages/demo` | Deterministic demos driven by the real gate |
| `docs/PREFLIGHT-EXPLAINED.md` | The full concept, every design decision argued |
| `docs/EDGE-CASES.md` | Concrete, reproducible cases the gate catches |
| `docs/THREATMODEL.md` | What an attacker can try and why the type system stops it |

## Rules for agents operating this repo

- Never put an LLM call inside the gate path. The gate's guarantee is determinism: same input, same verdict.
- Never bypass a `target_not_found` or `ambiguous_target` verdict by guessing. Both return candidates as data; surface them to the user.
- Start every integration in OBSERVE. Flip to ENFORCE only after reading the log.
