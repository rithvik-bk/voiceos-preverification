# SKELETON NOTES — Phase 2 walking skeleton
*Written 2026-08-21 by STAFF-ENG. Every number below is from a command run this session. Companion: `recon-inventory.md` (source map), `../decisions/2026-08-21-g0-approved-with-amendments.md`.*

## What was built

Exactly one path, end to end, in shadow mode, in `/Users/rithvik/preflight/packages/core`:

```
finalized transcript (static fixture, src/transcript.ts)
  → grounding store (src/grounding.ts — session registry + target pool with per-target Source)
  → provenance gate (src/gate.ts — min-rank lattice for routing; content passes consent-surfaced)
  → verdict (pass / PreflightBlock with machine code, src/block.ts)
  → provenance receipt (JSON param→source map, §17 shape)
  → shadow output (src/shadow.ts — would_have_blocked logged, NOTHING enforced)
```

One tool (`send_message`, declared as a `ToolContract` — the seed of §20's annotation format). One drift family (misheard target → machine code `target_not_found` with real candidates as data).

## Verified runs (this session, node v24.14.0)

- `cd /Users/rithvik/preflight/packages/core && npm test` → **9/9 pass**, from a checkout with **no node_modules anywhere** (verified: `find` returns none). Tests cover the four contract items: (a) clean pass + receipt naming every param's source, (b) misheard drift → shadow log `would_have_blocked` + `target_not_found` + host proceeds untouched, (c) enforcement — no network/LLM imports, in fact **no imports at all outside `./`-relative core files**, and zero runtime deps in package.json (dev deps unchecked by design), (d) covered by bench below. Plus two extra: the lattice refuses a rank-1 screen-sourced target that resolves perfectly (`insufficient_provenance`), and blank required field → `missing_parameter`.
- `npm run bench` → **clean send mean 7.1 µs / p95 7.8 µs; misheard-blocked mean 19.0 µs / p95 20.3 µs** (5000 iterations per case after 1000 warmup, full shadow pipeline per call: attribution + ladder + lattice + receipt + log append). In-process compute only, static fixture — no ASR, no network, no LLM, no real send in the number. Same honesty framing the v3 harness prints.

## What was ported from where (universal-voiceos-oauth, read-only, untouched)

| Core file | Ported from | What |
|---|---|---|
| `src/block.ts` | `integrations/slack/tools-t2.ts:98` (PreflightBlock), `:407` (requiredText) | verbatim minus Slack comments |
| `src/resolve.ts` | `integrations/slack/resolve.ts:294-417` | normalizeLoose/Tight, bounded editDistance, runLadder (exact→normalized→substring), nearestTargets, dedupeTargets, resolveTarget, Resolution/CandidateSummary — function shapes intact |
| `src/grounding.ts` | `integrations/slack/tools-t2.ts:186-310` | rememberMessage(s)/isGrounded/forgetGroundedMessages + GROUNDING_LIMIT=500 LRU, plus new target-pool half |
| `src/gate.ts` | `tools-t2.ts:433-458` (resolveHandle/resolveTarget → PreflightBlock-with-candidates) | generalized off a declarative contract instead of per-handler code |
| machine codes | v3 vocabulary | `target_not_found`, `ambiguous_target`, `missing_parameter` unchanged; **one new code**: `insufficient_provenance` (see below) |
| test fixture | `tools/preflight-eval.mjs:66-79` | the awkward workspace (eng-backend/eng-frontend prefix collision, two Aravs) and the misheard family (`ing backend` style) |

Slack surface simplified away, per the adapter rule: C…/U… raw-id regex passthrough → pool-membership id match (an id the store never saw does NOT pass through in core; a verifying adapter may re-add it); async directory fetch/TTL/miss-retry → the pool arrives from the store, fetching is adapter work; mrkdwn decode, conversations.open, cards → adapter/host work.

## Shape decisions (defend these at G2)

1. **Build = plain `node` running `.ts` via native type stripping** (default since 23.6; we're on 24.14). No tsc/tsx/ts-node, zero dev deps, `npm test` runs with zero installs. Cost: erasable-TS syntax only. Recorded in package.json `//build-choice`.
2. **GroundingStore is an instance, not module globals.** v3 kept one module-level Map (one process = one Slack session). A portable core must not smuggle session state into module scope. Method names preserved so the port is recognizable.
3. **Targets carry their Source.** v3's directory was rank-3 by construction (everything came from conversations.list). The core makes rank explicit per entry — this is what turns §1's lattice from a discipline into a checkable type rule, and it is what the `insufficient_provenance` test exercises.
4. **Content gets rank 0 (`model_composed`) when unattributable to the transcript.** Never blocked (§2), but rank 0 means content can never satisfy a routing slot's min-rank — §2's promotion ban made structural, for free.
5. **Receipts store span ids + FNV hashes, not raw transcript text** (§17 privacy default). No node:crypto import — core has literally zero imports.
6. **Shadow contract:** `shadowGate` never throws, never stops the call; returns `{enforced: false, decision, record}` and the host proceeds. warn/enforce are later phases.

## Awkwardness found (design signals for G1+G2 — Rithvik must hear these)

- **The blocked path is ~2.7× slower than the clean path** (19 µs vs 7 µs) because a miss runs bounded Levenshtein over the whole pool to build the candidate list. Harmless at 19 µs with a 7-entry pool; at a 10k-entry directory the miss path is the one to watch. Not a today problem; is a §24-numbers problem if we quote "the gate costs 7 µs" without saying which path.
- **Attribution is claimed-transcript-deep only.** `attributeToTranscript` proves the arg is consistent with the transcript object we were handed — and on the real platform that arrives model-filled (`said` pattern, RECON §2.1). Rank 4 in a receipt therefore means "consistent with the claimed utterance," not "platform-attested audio." This is exactly the §22 adoption ask and must be said that way in the room.
- **A paraphrased-but-correct routing arg still passes at rank 3** (pool grounding) with no rank-4 source cited. Honest, and arguably right — but it means transcript attribution is currently informative, not load-bearing, for routing. Whether Tier-3 routing should *require* a rank-4 co-source is a real G2 question (v3 never asked it; the lattice as specced says rank ≥3 suffices).
- **Required-field checks on content params** (`text` blank → `missing_parameter`) sit in tension with §2's "content is never blocked" if read literally. Resolution taken: §1 explicitly classes missing-required-field as *malformed call*, not provenance blocking. Wrote it into the code comment; spec (`docs/SPEC.md`, Phase 1) should say it in RFC 2119 words.
- **The ported message-registry half of GroundingStore is not exercised by send_message.** Kept because it is the literal centerpiece of the v3 gate and the substrate of the next path (react/thread_reply, ungrounded_ref family). If G2 hates dead weight, it lifts out in one cut.
- **Not awkward, worth saying:** nothing in the port fought the pipeline shape. Grounding+resolution logic moved by cut-and-carry exactly as RECON's portability judgment predicted; the only genuinely new code is the reified lattice (provenance.ts), receipts, and the shadow log — ~300 lines. The skeleton did its job of finding no architectural mistake in the transcript→store→gate→receipt→shadow decomposition so far.

## Verdict

✅ VERIFIED-DONE — `cd /Users/rithvik/preflight/packages/core && npm test` → 9 pass / 0 fail, and `npm run bench` printed mean 7.1 µs (pass path) / 19.0 µs (block path), both executed this session on node v24.14.0 with zero installed dependencies.
