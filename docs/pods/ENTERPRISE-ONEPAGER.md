# Preflight — the trust runtime for voice agents that touch real systems

*A deterministic pre-verification layer that sits in front of every tool call a voice agent makes — and now in front of every multi-step **plan** — and constructs a proof that each routing parameter (who, where, when, how much) traces to something a human actually authorized. Zero LLM in the hot path. Microseconds per step; under ~10 ms for a 40-step plan. Pre-verification only; what happens after an action fires is a separate layer we don't touch.*

---

## The blocker isn't capability. It's un-auditable authority.

Enterprises already believe the voice agent *can* issue the refund, send the invoice, schedule the call. That's not what stalls the deal. What stalls it is a question no probabilistic system can answer:

> **"What guarantees this action traces to something a human authorized — and can you prove it after the fact?"**

A model-based safety check answers "probably." Procurement doesn't buy "probably" for anything that moves money, sends externally, or can't be undone. **Preflight installs the floor beneath the model: the model can be wrong and still cannot fire an ungrounded action.** Not because a smarter model reviewed it — because the action had no valid, provable form to exist in.

---

## The unlock: it raises the autonomy ceiling, not just the safety floor

The reason a voice agent is stuck at "send one email you dictated" is that no one will let it run a real multi-step task unsupervised — one poisoned email in the inbox and it pays an attacker. Preflight changes what the agent is *allowed to attempt*:

- **It verifies the whole plan before any step fires.** A plan is a DAG of steps; Preflight walks it, threads authorized sources forward, and produces a **proof-tree** — every step marked pass / hold / block / deferred, with the reason attached.
- **Provenance composes safely across steps.** A value the agent **found and read back to you** (a structured tool result) becomes a legitimate destination for a later step — so "email the top lead you found" runs without you dictating the address. A value the agent merely **read out of content** (an email body, a web page) is **tainted**, the taint **follows it through every downstream step**, and it can **never** reach a destination or amount slot — so "pay the account in this billing email" blocks, even after the value is copied and reformatted three steps later. **The invariant: no tainted value reaches a routing sink.** (Denning's information-flow control, 1976 — a proven model, not a heuristic.)
- **The autonomy dial is a knob the enterprise sets.** L0 confirm-everything → L3 full-auto, stop only when a step can't be proven. It's a pure policy table `(level × verdict → auto-run | hold | block)` — no model decides it, so the autonomy posture itself is auditable and can be set per role or per tool class.
- **Nothing green fires below a hole.** A step depending on a held or blocked step is automatically deferred — you never get "half the workflow ran and the important half silently didn't."

**The enterprise version of the pitch:** you can turn the agent's autonomy up — let it work an inbox, reconcile a queue, process a batch — because every step it takes is proof-carrying, and the injection defense gets *more* valuable the more of your systems the agent reads, not less.

---

## Why *deterministic* is a procurement requirement, not a performance nicety

A control you can't reproduce is a control you can't audit, and a control you can't audit doesn't clear security review. Determinism is what makes the whole chain hold:

**auditable → reproducible → defensible → procurable.**

- **No LLM in the decision path.** The gate is set-membership and equality math. There is no temperature, no sampling, no "it depended on the prompt that day." The plan verifier reads no clock and no ambient state — a proof-tree is a pure function of the plan and the grounding store.
- **Reproducible by construction.** Same inputs + same code = byte-identical verdict, every time (the run timestamp is an explicit input; there is no hidden clock). A regulator or a customer's security team can re-run the exact decision — one action or a forty-step plan — a year later and get the exact same answer.
- **No self-grading.** The system cannot emit a blended "94% safe" number — there is no code path that aggregates one, and a test asserts its absence. "No AI grading AI" isn't a slogan here; it's a structural property you can verify in an afternoon.

"Deterministic, microseconds, no AI grading AI" *is* the procurement thesis, stated in the buyer's own language.

---

## Five sellable controls — and they're all one mechanism

This is the part that makes it a wedge rather than a feature: the provenance layer that catches drift and injection **is the same object** that produces every control a security review asks for. Build the proof once; report it five ways.

1. **Immutable audit trail.** Every action ships with a receipt: the attempted arguments, each routing parameter, its licensed source, and the verdict. *This is a capability the incumbent stack literally lacks* — the VoiceOS DB stores tool-call arguments as null (verified: `input_json` NULL on 134/134 calls), so today there is no way to reconstruct what a past action was told to do. Preflight is the point where that record first exists.
2. **Policy-as-code.** Because every routing value is typed and sourced before it fires, deterministic policies attach cleanly: deny over $X, approved-recipients-only, no external sends after hours, cap the autonomy level for a given role. Rules over a proof, not guesses over a string.
3. **RBAC / authority binding.** The proof names *what authorized this* — a spoken instruction, a read-back value, app state. That's the raw material for "this role may authorize refunds up to $Y," enforced at the one chokepoint every action passes through.
4. **PII / secret guards.** The layer separates routing from content and tracks where each value came from, across the whole plan. A value that originated in read content can never silently become a routing target (that rule *is* the taint firewall) — and a content value crossing from a private source toward an external destination is exactly the span the layer already marks and blocks.
5. **Compliance-shaped receipts.** The same proof object renders three ways with no rework: the confirmation the user sees, the audit record the enterprise parses, and the hand-off the downstream verifier consumes.

Five line items on a security questionnaire. One deterministic mechanism underneath.

---

## The moat: the drift map and the annotation library

The receipt is not just an audit artifact — it's the seed of the flywheel a copier cannot start:

- **Every held or blocked action is labeled data.** At the one chokepoint that sees `{transcript → attempted args → grounded verdict}` for every call, each hold and block is a labeled example of where the agent tried to drift. Aggregate them and you get a **live drift map** — a per-tool, per-family picture of exactly where *your* agent goes wrong, growing with every session. VoiceOS's own DB can't produce this: past arguments are null, so they have no history to map. Preflight is where that record begins to exist.
- **The annotation library compounds.** Each safely-gated tool needs a small annotation (which params are routing, which are content, what slot each fills). That library is "DefinitelyTyped for tool safety" — a copier inherits an empty type-library and has to re-annotate every integration from scratch. The library, the labeled chokepoint data, and the proof format as an interop standard are the three assets that turn a feature into a moat.
- **Honest today:** the moat is a *bet*, magnitude zero until there are adopters — a strong feature with a credible path to a moat. We'd rather you hear that from us than discover we oversold it.

---

## Honest scope (state it in the room — it's the trust move)

- **Pre-verification only.** Preflight checks an action *before* it fires. What happens after — reconciling the effect against intent — is a distinct post-verification layer, and not ours to claim.
- **Catches model-drift and injection. Not ASR-mishear.** If the transcription itself is wrong, Preflight faithfully grounds the wrong words; that's a read-back layer, a different control.
- **Coverage is per-annotated-tool, not whole-app.** Proof-carrying actions apply to tools that carry annotations; unannotated tools pass through today. The control library grows per integration — say "here's what's covered," never "everything is covered."
- **The plan demo is a scripted-but-real plan.** The verification — every verdict, every taint label, the proof-tree — is real and deterministic. The multi-step *plan* is scripted for the demo; we don't build the agent that reads the inbox. That's their model, and the seam to it is one field.

---

## The two one-liners

**For the buyer (security / compliance):**
> *"Your voice agent can be wrong and still cannot fire an action — at step one or step forty of an autonomous plan — that doesn't trace, provably and reproducibly, to something a human authorized; and every action leaves an audit record your current stack can't produce."*

**For the founders (why this is the wedge):**
> *"We own the one chokepoint every voice action passes through, we turn each one into a reproducible proof, and we compose those proofs across a whole plan — so you can turn autonomy up instead of down. The same object clears the security review, feeds the policy engine, and becomes the drift map nobody else has the data to build."*
