# Preflight — the pre-verification pitch (talk-track for the room)

*Not the lead. OAuth + integrations is the hero; the eval harness is proof; this is the scoped-project proposal you plant so they can picture where you take them. Keep it to ~3 minutes + the demo. Say the vision as vision; say the honest scope out loud — that's what makes Kai trust you.*

---

## The frame (open with this)
> **"This doesn't make VoiceOS safer. It makes VoiceOS *allowed to be bigger*."**

The ceiling on what VoiceOS attempts today isn't the model — it's how much you can trust it not to fire something ungrounded. Every action carrying a proof of where it came from *raises that ceiling*. Provenance isn't defense. It's what unlocks offense.

## The problem (point at their own code — this earns the room)
- Your confirmation card asks me to approve, then **classifies my yes/no** (`classifyAgentConfirmationIntent`). It never checks the actual parameters against what I said.
- Native actions (Mail/iMessage/Notes) fire **with no card at all** (`requiresConfirmation: false`).
- `agent_tool_calls.input_json` is **NULL on every logged call** — you can't even measure parameter accuracy today.

→ So the only thing between *"refund $54.79"* and *$54.99 going out* is the model getting it right every single time. It won't — because the model doesn't copy your number, it **re-types** it token by token.

## The demo (30 seconds — the one concrete thing, on the real gate)
```
cd packages/demo && node amount-catch.mjs
```
- You say **$54.79**. Model re-types **$54.99**. Preflight parses the numbers out of your transcript → `{54.79}`, checks `54.99 ∈ {54.79}?` → **no → HOLD**, one spoken question.
- The correct **$54.79** fires instantly, zero added words (proof it's not a nag).
- **No AI, ~microseconds.** Pinned by a passing test: `node --test packages/core/test/misbinding.test.ts` → `amount_not_in_speech (HOLD)`.

*(For Jonah/visual: `setup.html`. For Kai: the script + the test — a rigor guy trusts "run it yourself" over a webpage.)*

## Why it's not "an AI checking an AI" (Kai's line)
The check is a **number-parse and a set-membership test.** A person can run it by hand with a highlighter; same input → same output, forever. There is no second model, no probability, nothing to hallucinate. That's the guarantee he asked for.

## The unlock — say this as *vision*, not a claim of today
Once every action carries a proof, you can ship what's un-shippable now:
1. **40-step autonomous tasks that touch real things** ("scour my inbox, find every lead, draft PDFs, send them, report back"). Un-shippable today because one silent wrong step in 40 is catastrophic. Per-action provenance makes each step checkable, so you can let it run.
2. **A trust dial** — Siri ("confirm everything") ↔ Jarvis ("just do it, stop me only when a step can't be proven"). Impossible without a provenance layer underneath.
3. **Injection defense that gets *stronger* as autonomy grows** — the more of my world it reads (emails, pages, screens) to act, the more hidden instructions it's exposed to. The rule *"content can never license a destination"* is the one structural defense that strengthens with autonomy instead of weakening. So this isn't a tax on the Jarvis roadmap — it's the **precondition** for it.

## The honest scope (hold this line — do not oversell)
- **Built + demoable today:** single-call grounding. Catches model drift, contamination, injected recipients, and not-spoken amounts (`amount_not_in_speech`). Core is green (`node --test` in `packages/core`).
- **Not caught by this layer:** a true ASR mishear (if the audio itself is misheard, the transcript is already wrong — that's the ASR's confidence + a read-back, a different layer). Say this before they ask.
- **The multi-step version is the vision above** — I prototyped the per-step check; it's *not* wired into your product because you don't ship multi-step yet. When you do, it's ready.

## The ask
> "We're not here with a finished product. Here's a real gap, here's the direction, and here's a working single-call demo. Can we run this as a **scoped project** — we ship you real updates every week, you decide what to merge? You don't have to figure out what to hand us. We hand you the project."

---
### Verify before you walk in
- `cd packages/demo && node amount-catch.mjs` — the $54.79 catch
- `cd packages/core && node --test 'test/**/*.test.ts'` — core green (50 tests, 1 honest todo)
- Repo says nothing false about amount checking anymore (fixed the stale disclaimer in `run.mjs`).
