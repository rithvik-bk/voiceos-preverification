# The Meeting — how Preflight (and everything else) wins the internship

*For Rithvik. Private strategy. The teaching doc (`preflight-taught-from-scratch.html`) is what you know cold; THIS is why any of it matters and how you carry the room.*

---

## The one thing to remember
**The demo is not what gets you hired. The alignment is.** They will almost certainly say "this is cool, we might adopt it." That's not the win. The win is when they think: *"these two think about our exact problem the way we do, they understood our product better than we expected, and they ship — we want them around."* You use the builds to earn that thought. You don't lead with the builds.

The texts got you into the room. The room is about showing you're **aligned and worth betting on.**

## What they actually want from you (read them, not the ask)
- **Jonah** — product taste. He tests by hand, cares about edge cases and the *feel* of a fix (his real worry: how do you catch a mistake without breaking the voice flow?). He wants people who notice the thing that breaks and care how it feels to the user.
- **Kai** — rigor. "Guarantee tool-calling accuracy, no speed sacrifice, no AI grading AI." He wants people who prove things instead of asserting them, and who are honest about limits.
- **Underneath both:** people who **understand their product deeply** and can **ship real things they can trust**. That's the whole hiring bar. Everything you show should ladder to *those two words: understand, trust.*

## Your loadout, in order
1. **Codebase-intel depth — your real jaw-drop lever.** You reverse-engineered their app: the dead OAuth slot, `input_json` NULL on every logged call (they can't measure param accuracy today), a dormant DAG workflow engine with zero rows, native actions firing with no confirmation card. **Open by describing their own architecture back to them.** That's the moment a founder thinks "how do these kids know our code this well?" — more than any feature.
2. **OAuth + integrations — the working hero.** Real, demoable, fills a gap they actually have (the dead oauth2 slot). This is what you *demo*.
3. **The eval harness — proof, not vibes.** Kai's literal ask. Measures accuracy on labeled corpora, reports honestly, refuses to fake a number.
4. **Preflight — the safety seed + the vision.** A clean prototype that catches the $54.79 class of error deterministically, with a real integration path. Present it as *"here's a problem you have, here's a working prototype, here's where it goes"* — the scoped-project seed, not the star.

## The pitch arc (how the conversation flows)
1. **"Here's what we found in your codebase."** The intel. Earns the room's attention and proves you're not tourists.
2. **"Here's what we built on it."** OAuth + integrations (demo) → eval harness (proof) → Preflight (the $54.79 catch, live: `node amount-catch.mjs`).
3. **"Here's how it fits your product."** The integration path — OBSERVE first, then ENFORCE; the one-field seam. Adoption looks *easy*, low-risk.
4. **"Here's my plan for the future — and I want your feedback."** This is the alignment beat. The vision: voice is stuck on small tasks because you can't trust it on big ones; provenance is the precondition for the autonomy you'll want to build (the trust dial, the safe multi-step). You're not pitching a finished product — you're showing you see the same road they do, and asking them to shape it. **Then the ask:** *"Can we run this as a scoped project — we ship you real updates every week, you decide what to merge?"*

## The vision, in plain words (this is what "aligned" sounds like)
Voice assistants do small things today — a timer, a text — not because the model can't do more, but because no one can *trust* it on the things that matter (money, real messages, autonomous chains). The ceiling on what VoiceOS is allowed to attempt is a **trust** ceiling, not a capability one. Provenance — every action proving where it came from — is what raises that ceiling. It turns "confirm everything" (Siri) into "just do it, stop me only when a step can't be proven" (the thing everyone actually wants). Preflight is the first brick of that: prove one action. The road from there is proving a chain. **You want to build toward voice you can actually hand real work to — and you want their feedback on how.** That's the future you're asking to build *with* them.

## The honest scope lines to hold (saying these is a strength, not a weakness)
- It's a **prototype**, not production-deployed. A clean one, well-tested, with a real integration path.
- It catches model drift / injection / ambiguity / not-spoken amounts. It **does not** catch a true ASR mishear (that's a different layer — say it before they find it).
- The multi-step piece is a **prototype that shows the direction**, not something shipped — because they don't ship multi-step autonomy yet.
- The eval numbers are **measured, per-corpus, honest** — unrunnable cases counted as unrunnable, never faked.

## Hard questions — and your honest answers
- **Kai: "How do you know it's right?"** → It's deterministic — a number-parse and a set-membership test, no model. Run it yourself; same input, same output. And the eval harness measures the catch/false-block rate on labeled corpora.
- **Kai: "What's your false-block rate?"** → Small-N so far; I won't quote a number I haven't earned. The harness measures it per-corpus; here's the honest data and how it grows.
- **Jonah: "How do you tell the user without breaking the flow?"** → One spoken repair line that rides your existing revise loop (`repair.ts`) — "You said $54.79, which amount?" — not a modal, not a wall.
- **Anyone: "Is this shipped / production?"** → No — a prototype with a defined integration path (OBSERVE → ENFORCE, a one-field seam). That honesty is the point.
- **Anyone: "Isn't the multi-step stuff overreach?"** → Yes for today — that's why it's a prototype, not the pitch. The shipped-today piece is the single-action gate. The multi-step is where it goes when you want it.

## What winning actually looks like (don't mis-grade yourself)
A yes to a scoped project, "come back and show us," or "we want you two" **is the win** — a big one. Hiring on the spot is rare, mostly outside your control (budget, process, you're a minor). Grade tomorrow on: *did they see we understand their product and can be trusted to build on it?* The intel + the working OAuth build gets you there. Preflight rounds it out.

## The repo, in one line for them
`github.com/rithvik-bk/voiceos-preverification` (private) — share it read-only from your laptop; don't make it public (it cites their internal code).
