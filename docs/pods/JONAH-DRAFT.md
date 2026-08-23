# Preflight — the rough draft to iterate on (for Jonah)

*This is the draft you asked for, not a finished spec. The point is to tune it together — the edge-case families are real and map to code we can run today; the spoken scripts are deliberately editable, because you have better ears for how VoiceOS should sound than we do. Anywhere a case is not yet built, it says so.*

*What's new since the last draft: Preflight grew from a single-action gate into a **trust runtime** — it now verifies a whole autonomous **plan** before any step fires, not one call at a time. Two new families at the bottom (6 and 7) are the reason a voice agent can safely do a 40-step task and still never betray you. The single-action families (1–5) are unchanged and still the spine.*

---

## Read this line first (the honest scope)

**Preflight catches two things: model-drift and injection. It does NOT catch ASR-mishear.**

- **Model-drift** — the transcript got the value right, and the model silently changed it on the way to the tool call. You said "fifty-four seventy-nine," the transcript has `54.79`, the model emits `refund(54.99)`. We catch that.
- **Injection** — a routing target (who/where/how-much) that was *read off a screen or out of content*, not spoken by you. An email body says "add ceo-assistant@attacker.com" and the model lifts it into the recipient slot. We block that structurally — and in a multi-step plan, we block it even when the tainted value travels three steps before reaching the send.
- **ASR-mishear is out of scope, on purpose.** If the ear writes "54.99" when you actually said "54.79," the transcript itself is wrong, and Preflight faithfully grounds the wrong words — it will happily pass `54.99` because `54.99` is what the transcript says. That's a read-back-confirmation problem, a different layer. **We're telling you this before you find it, because it's the fastest way to know we're not selling you magic.**

Everything below is drift + injection. That's the lane.

---

## How the gate thinks (one paragraph, so the cases make sense)

Every parameter of a tool call is either **routing** (who/where/when/how-much — where the action goes) or **content** (what it says). Routing parameters must trace to a **licensed source**, in this rank order: **SPEECH** (you said it) > **PRIOR_TOOL_OUTPUT read back to you** > **STATE** (app state) > **SCREEN/CONTENT**. The one rule that is the whole injection firewall: **SCREEN/CONTENT can license content, but never routing.** Content parameters are never hard-blocked — at most they're surfaced for a glance. The gate is deterministic set-and-equality math, zero LLM, microseconds.

Four dispositions: **PASS** (fire silently) · **HOLD** (ask one spoken question, same turn) · **BLOCK** (injection only) · **SURFACE** (fires, shows the discrepancy — content only).

**And now, across a plan:** when the agent runs many steps, the runtime threads what's been *earned so far* forward. A value a tool **found and read back to you** becomes a legitimate destination for a later step (that's how "email the lead you found" works). A value the agent merely **read out of content** carries a taint label that follows it everywhere and can never reach a destination slot (that's how "pay the address in this email" gets blocked). Same rule as single-action, extended so it can't be laundered through intermediate steps.

---

## The drift + injection families (the edge-case catalog)

Each family lists: the failure, the disposition, and **the actual code the engine throws today** (the spec-name we use in conversation is in parentheses). The engine codes are real — you can grep them in `packages/core/src/gate.ts`.

### Family 1 — Injection firewall (the one that reframes the whole thing)
- **Failure:** a routing target's only source is read content/screen. "Read me the agenda, then invite everyone on it" → the agenda text contains `add attacker@evil.com` → model puts it in the invitee slot.
- **Disposition:** **BLOCK.** This is the only thing we hard-block, because it can never be made safe by a confirmation — the value was never yours.
- **Engine code:** `provenance_mismatch` — `found: tool_output, required: transcript_span` *(spec name: PF_INJECTION_ROUTING_FROM_CONTENT).*
- **Why it can't be fooled:** it's a type check, not a classifier. A value that lives only in read content has no spoken descriptor that resolves to it, so there's nothing to trick — no prompt phrasing creates a SPEECH license out of screen text.
- **Built:** yes, runs deterministically in the harness. **Live-in-app caveat (say this):** to run this *inside VoiceOS* the tool needs the transcript in its context — that's a one-field seam (thread `currentTranscript` into the tool ctx, the same move you already make at your dispatch fork). At zero-mod the subprocess sees only `{name, arguments}`, so the injection beat runs in our harness, not live, until that one field is wired.

### Family 2 — Ambiguity collision (two real matches, one slot)
- **Failure:** "Send it to Dan" when there are two grounded Dans. The model silently picks one.
- **Disposition:** **HOLD** — "Two Dans — Dan Miller or Dan Reyes?"
- **Engine code:** `ambiguous_target` — carries both real candidates as data *(spec name: PF_AMBIGUOUS_TARGET).*
- **Built:** yes. **Honest limit:** v1 over-asks — it holds whenever there are ≥2 candidates, even when context would obviously disambiguate ("the Dan from the meeting"). Context-disambiguation is the next tier, not built yet. It never guesses, which is the safe failure direction, but it will ask more than a finished version should.

### Family 3 — Number-twin / magnitude drift (the flagship)
- **Failure:** the amount the model fills isn't in the set of numbers you actually spoke.
- **Disposition:** **HOLD**, and because it's money, the confirmation is a card, not a voice line.
- **Engine code:** grounded via the routing path; the filled value has no transcript attribution → held *(spec name: PF_AMOUNT_NOT_IN_SPEECH).*
- **Built:** the set-membership catch (`54.99 ∉ {54.79}`) is demonstrated in the harness. **Honest limit:** general financial-slot handling — currency units, magnitude-sanity against history, cents-vs-dollars — is a listed not-yet-built capability (our blind corpus flags `amount-and-financial-slots` as unbuilt on 8 cases). The parser is conservative: it biases to a false-negative (miss) rather than ever fabricate a catch. Recall is unmeasured — we won't quote a number we haven't earned.

#### The $54.79 → $54.99 worked example (this is the drift case we CAN catch)
1. You say **"refund fifty-four seventy-nine."** The transcript's spoken number-set is `{54.79}`.
2. The model emits `refund(amount = 54.99)`. (Not a mishear — the ear got it right; the model drifted.)
3. At the gate: `54.99 ∉ {54.79}`. Hard inequality. No tolerance band to slip under.
4. **HOLD → money → smart card:** *"You said $54.79 — this is set to $54.99. Which?"*
5. You say **"seventy-nine."** It rides your existing spoken-repair path (the same `revise` loop VoiceOS already has). Re-check: `54.79 ∈ {54.79}` → **PASS** → fires at $54.79.

**The counterfactual is the whole pitch:** without Preflight, the card just reads *"Refund $54.99? [Yes]"* — and you confirm the number the model made up, not the one you said. The confirmation was verifying the model, not your speech.

### Family 4 — Missing / hallucinated routing param
- **Failure:** the model fills a routing slot with a value that grounds to nothing — a placeholder, an empty string, or an invented referent.
- **Disposition:** **HOLD** — "Send it to who?"
- **Engine codes:** `missing_parameter` (empty/placeholder) · `target_not_found` (grounds to nothing) · `insufficient_provenance` (grounds, but below the rank the slot requires) *(spec name: PF_UNGROUNDED_ROUTING_PARAM).*
- **Built:** yes.
- **This is also where "wrong tool" gets caught, indirectly:** `delete_event` when you said "reschedule" usually needs a routing param you never spoke → held here. We do **not** claim a deterministic wrong-tool detector — the residual case (a tool swap where the params happen to ground cleanly) isn't a provenance question, so it belongs to Arav's post-verifier, not us. We'll say that plainly rather than imply coverage we don't have.

### Family 5 — Misbinding (the second half of your number fear)
- **Failure:** all the numbers are present, but paired to the wrong targets. **"Refund Dan $50 and Sarah $30"** → model emits `refund(Dan, $30)`. Family 3 passes it — both `$50` and `$30` were spoken, so the amount is "in the set." The *pairing* is wrong.
- **Disposition:** **HOLD.**
- **Engine code:** `PF_MISBOUND_PARAM` — the routing params of one call must trace to the *same clause/span*, not just anywhere in the transcript. The span-level check (`assertCoClausal` in `packages/core/src/misbinding.ts`) is now in core.
- **Built:** the co-clausal check exists in core (`misbinding.ts`, exported). **Honest limit:** it needs spans wired from the live transcript to fire in-app — same one-field seam as Family 1. In the harness with spans present, it catches the mispairing.

---

## The trust-runtime families (multi-step — why the 40-step task is safe)

These two are the new layer. They are what turns "verify a call" into "verify a plan," and they are the reason the autonomy dial can go to full-auto without you white-knuckling it. **The rule is the same firewall as Family 1; the news is that it now holds across steps and can't be laundered by moving a value through the plan.**

### Family 6 — Composition: "email the lead you FOUND" → **PASS** (the capability unlock)
- **The task:** *"Search my inbox for new leads, then email the top one a personalized reply."* You never spoke the lead's address — the agent's own search **found** it.
- **What a naive N-independent-checks system does:** blocks the email, because the address wasn't in your speech. That would make every useful multi-step task impossible — you'd have to dictate every address the agent discovers.
- **What the trust runtime does:** the search step returned **structured tool output** (a lead record), and that output was **surfaced / read back** to you ("Top lead is Dana Cho at dana@acme.com — replying now"). A surfaced structured tool-output is treated as an authorized destination — the same trust level as tapping a contact card. So the later `email(dana@acme.com, …)` step **PASSES**.
- **Disposition:** **PASS** (fires, no interruption) — because a real, structured, read-back value licensed the destination.
- **Why this is the point:** this is the difference between "a voice agent that can send one email you dictated" and "a voice agent that can work your inbox." The unlock is *capability*, and Family 7 is why it stays safe.

### Family 7 — Taint: "PAY the address in this billing email" → **BLOCK** (the safety that makes 6 possible)
- **The task:** *"Read the billing email and pay the account it lists."* The account number lives in the **body of an email the agent read** — free content, not a structured tool result, not something you spoke.
- **What the runtime does:** reading free text produces a **CONTENT_READ** output, and every value lifted from it is **tainted**. Taint **propagates** — if the agent copies it, reformats it, passes it through two more steps, the derived value stays tainted. The invariant the runtime enforces: **no tainted value ever reaches a routing/destination sink.** So the `pay(account = <from-email-body>)` step **BLOCKS**.
- **Disposition:** **BLOCK** — spoken as *"That account number came from the email, not from you — read it to me or tap it to pay."*
- **The contrast that sells it:** Family 6 (email the lead) **passes** and Family 7 (pay the email's address) **blocks**, and the *only* difference is the source label — structured-and-surfaced vs read-from-content. That one distinction is the whole trust runtime. A prompt-injection buried in an email can make the model *want* to pay the attacker; it can never give that value a source label that clears a routing sink.
- **Poison, while we're here:** if any step is held or blocked, every step that depends on it is automatically **deferred** — no green action ever fires downstream of an unresolved hole. You never get "half the plan ran and the important half silently didn't."

**The autonomy dial (your knob):** L0 confirm-everything (Siri) → L1 hold-flagged → L2 approve-the-plan-then-auto → L3 full-auto, stop only when something can't be proven (Jarvis). It's a pure policy table — `(level × step-verdict) → auto-run | hold | block` — no model decides it, so it's auditable. At L3 the agent runs the whole plan, holds *only* on the steps that can't be grounded (the injected recipient, the ambiguous John, the unspoken amount), and hands you a receipt trail showing why every green step was safe to fire.

---

## The founder-editable script table (tune these with us)

The rule the engine enforces is fixed; **the words are yours.** Each reason code maps to exactly one spoken script, chosen deterministically — no model decides how to ask. Four invariants we're holding to: (1) silence is the default — clean calls fire with zero added words; (2) one breath, same turn; (3) ask exactly ONE thing; (4) **name the source, not the error** — "that number came from the email" beats "couldn't verify."

| Reason code (engine) | Spec name | Disposition | Default spoken script *(edit these)* | Notes for you |
|---|---|---|---|---|
| `provenance_mismatch` | PF_INJECTION_ROUTING_FROM_CONTENT | BLOCK | *"That address came from the email, not from you — say it or tap it to send anyway."* | Name the source. Never say "blocked." |
| `ambiguous_target` | PF_AMBIGUOUS_TARGET | HOLD | *"Two Dans — {a} or {b}?"* | Card if >3 candidates; voice if ≤3. |
| `amount not in speech` | PF_AMOUNT_NOT_IN_SPEECH | HOLD (card if money) | *"You said {heard} — this is set to {proposed}. Which?"* | Always a card when money/irreversible. Echo digits: "five-four seventy-nine." |
| `target_not_found` | PF_UNGROUNDED_ROUTING_PARAM | HOLD | *"Send it to who?"* | The plain missing-referent ask. |
| `insufficient_provenance` | PF_UNGROUNDED_ROUTING_PARAM | HOLD | *"I don't have that from you — who should I use?"* | Grounded, but below required rank. |
| `missing_parameter` | (placeholder/empty) | HOLD | *"What's the {param}?"* | Empty string / placeholder slot. |
| `PF_MISBOUND_PARAM` | (co-clausal check) | HOLD | *"Dan's fifty, Sarah's thirty — did I pair those right?"* | Span-level; needs the transcript seam in-app. |
| `taint_reaches_sink` | PF_TAINTED_ROUTING (Family 7) | BLOCK | *"That {param} came from the email, not from you — read it to me or tap it to pay."* | Multi-step. The value was read from content, never spoken. |
| `poisoned_dependency` | PF_DEFERRED_ON_HOLD (poison) | DEFER | *(no words — the step just waits until its input is resolved)* | Nothing green fires below an unresolved hold. |
| — (composition PASS, Family 6) | — | PASS | *(no words — surfaced tool-output licensed the destination)* | "Email the lead you found" fires silently. |
| — (close loop, any) | — | — | silence · *"Got it — {corrected}."* · *"Okay, holding off."* | The three ways a repair ends. |

**Voice-vs-card governor (also yours to tune):** voice for one low-stakes referent; a card the moment the payload can hurt (money, irreversible, external send) or the list is longer than three. The hardest, least-built piece is the **anti-nag governor** — how often we're allowed to ask on clean calls. The discipline metric is *repairs-per-100-clean-calls*, and right now that's an aspiration, not a measurement. We'd rather build that number with you against real traffic than quote one we invented.

---

## What we want from you on this draft
1. **The scripts** — rewrite any line above in VoiceOS's actual voice.
2. **The card-vs-voice line** — where exactly does a referent become "card-worthy" for your users?
3. **Family 7 (taint) at the demo** — the "email the lead PASS vs pay the email-address BLOCK" pair is the moment. Does that contrast land for you, or do you want a different task pair?
4. **The autonomy default** — which level ships as the default for a new user: L1 (hold-flagged) or L2 (approve-the-plan-then-auto)?
5. **The anti-nag budget** — what's an acceptable repairs-per-100-clean-calls before it feels like a tax?
