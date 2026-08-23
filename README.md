# Preflight

A deterministic, zero-LLM **pre-verification gate** for voice-agent tool calls. Before any action fires, every *routing* parameter — the who / where / when / how-much of a tool call — must trace to a **licensed source**. If a destination, amount, or permission slot cannot be shown to come from something the user actually spoke (or tapped), the call does not fire. No model sits in the hot path: the check is pure string and number matching over plain data, so the same input always produces the same verdict, in microseconds.

## The problem

A voice agent hears you, and a language model turns what you said into a tool call. But the model **re-types the arguments** — it does not copy them. Somewhere between "refund fifty-four seventy-nine to Dana" and the `refund(amount, to)` call, a digit flips, a name resolves to the wrong contact, or a destination gets pulled from something on screen that you never named. When the tool is irreversible — a payment, an outbound message, a permission grant — a wrong destination or amount fires once and cannot be recalled. Confirmation cards do not close this gap: they classify *yes/no* on an action the user is often just waving through, and they never check the call's parameters back against what was actually said.

## How it works

Preflight puts a type system on *provenance*. Every value entering the gate carries a source, and sources sit on a rank lattice (`provenance.ts`): a **transcript span** (something the user literally spoke) outranks tool output, which outranks known state, which outranks on-screen content, which outranks anything the model composed on its own. Each routing parameter class declares the minimum rank it will accept.

The load-bearing rule is the **injection firewall**: a Tier-3 destination, amount, or permission slot must be *licensed by a transcript span* — literally spoken, resolved from a spoken descriptor, or card-tapped. **Content can never license a routing destination.** An address that only ever appeared inside read content (an email body, a screen, a prior tool result) has no transcript span, so routing a new action to it fails as a *type error at the parameter level* — there is no classifier to fool and nothing to jailbreak. On top of that, resolution is fuzzy-but-honest (`resolve.ts`): a name that matches nothing is `target_not_found`, a name that matches two things is `ambiguous_target`, and both return candidates as data rather than guessing. A cross-clause check (`misbinding.ts`) stops the amount from one clause binding to the recipient of another.

## Architecture

Five packages under `packages/`:

| Package | Role |
| --- | --- |
| `core` | The gate and trust runtime. Provenance lattice, transcript spans, grounding store, fuzzy resolution, and `gate.ts` (`runGate` / `preflight`) — the heart. Zero deps, zero LLM, zero network. Also holds the multi-step **prototype** (`plan` / `compose` / `taint` / `autonomy`). |
| `adapters/voiceos` | A stdio MCP server that wraps downstream tool calls with the gate (`withPreflight`), in **OBSERVE** (shadow, never refuses) or **ENFORCE** (refuses on block) mode. |
| `contracts` | Tool-annotation catalogs (`voiceos.annotations.json`, `slack.annotations.json`), a linter, and `FORMAT.md`. Provenance requirements live as annotations on the tool schema, never as logic inside the gate. |
| `eval` | The eval harness. Runs `self` / `blind` / `replay` corpora reported **separately, never blended**; a capability-honest adapter scores unrunnable cases `NOT-RUNNABLE-YET` with the missing capability named and counted — never a fake pass. Deterministic (`--timestamp` arg, no clock reads). |
| `demo` | Runnable, deterministic demos driven by the real core gate — no hand-faked verdicts. |

## Quickstart

Requires Node `>=23.6` (developed on v24). No install step is needed for the core, adapter, contracts, or demos — they have zero runtime dependencies and run directly under Node's TypeScript support.

Run the tests per package:

```sh
cd packages/core            && node --test
cd packages/adapters/voiceos && node --test
cd packages/contracts       && node --test
cd packages/eval            && node --test
```

Run the three demos:

```sh
cd packages/demo
node run.mjs           # "The Setup" — 4 scenes over the real gate
node amount-catch.mjs  # the $54.79 -> $54.99 catch
node autonomy.mjs      # the multi-step prototype (plan verification)
```

## Test status

**102 tests, 101 pass, 0 fail, 1 honest todo.**

| Package | Result |
| --- | --- |
| `core` | 51 tests — 50 pass, 0 fail, 1 todo |
| `adapters/voiceos` | 18 / 18 |
| `contracts` | 13 / 13 |
| `eval` | 20 / 20 |

The single `todo` is a documented residual in the multi-step taint firewall (`core/test/taint.test.ts`): taint follows *declared* `derivedFrom` edges, so a structured step that copies a tainted value into its output **without declaring the edge** — an undeclared launder / confused-deputy — is not caught at this pure-data layer. Closing it needs value-level dataflow from the executor, which is outside the pre-verification lane. It is marked `todo` so the gap stays visible rather than papered over.

## Scope — what this catches, and what it does not

**Catches:**

- **Model drift** — a re-typed wrong value that does not match what was spoken.
- **Injected / ungrounded destinations** — content can never license a routing destination.
- **Ambiguous targets** — a name that resolves to more than one referent.
- **Hallucinated targets** — a target the user never said.
- **Amounts not in speech** — e.g. `54.99` when the transcript only contains `54.79` (`amount_not_in_speech`).
- **Cross-clause misbinding** — an amount or recipient binding across clause boundaries.

**Does not catch:**

- **A true ASR mishear.** Preflight grounds against what was *transcribed*. If the transcript itself is wrong — the speech recognizer heard "Dana" as "Dena" — this layer cannot see it, because it has no ground truth but the transcript. That belongs to a different layer (ASR confidence + read-back).

This is **pre-verification only**. Post-verification is a separate lane and is not designed or documented here.

## Status

Preflight is a clean, well-tested **prototype**, built for an integration audition with VoiceOS. It is **not production-deployed**. The single-call gate is complete and covered by tests; the multi-step pieces (`plan` / `compose` / `taint` / `autonomy`) are a **prototype that demonstrates the idea** and are not wired into any live product — VoiceOS does not ship multi-step autonomy today. The integration path (a drop-in MCP wrapper with an OBSERVE shadow mode) is defined and shippable at zero product risk.
