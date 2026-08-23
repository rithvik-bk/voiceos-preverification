# PREFLIGHT — COMPLETE AUDIT (2026-08-22)
*Grounded in the two canonical docs (preflight-v4.md + PREFLIGHT-BUILD-KICKOFF.md, confirmed byte-identical to the built-against copies) and in commands run this session. No claims from memory.*

## 0. The two boundaries (locked this session)
- **Lane:** Preflight only. The other session owns Universal OAuth + its 6 integrations (ClickUp, Zoom, Stripe, GitHub, Instagram, LinkedIn). I do not touch or depend on their repo/work.
- **Substrate pivot:** the forward plan and demo do not use the retired integration as substrate. VERIFIED this is free: `packages/core` has zero integration imports (the only references are port-provenance comments), core runs 16/16 standalone, and both corpora are tool-agnostic JSON. The gate was always a platform-neutral library with adapters (KICKOFF §2–3) — so it stands on its own.

## 1. WHERE WE ARE — built and verified this session
| Component | State | Evidence (run this session) |
|---|---|---|
| Program spine | done | repo + 21 veto agents + SPEC/INVARIANTS/THREATMODEL/CLAIMS/COMPLETENESS/briefs |
| SPEC.md (RFC 2119, 94 MUSTs) | done | ownership rule as §0 |
| packages/core (lattice, routing/content, S11.2 licensing incl. S10.3 RRP) | done | `node --test` → 16/16, 0 fail; zero deps; ~7µs |
| packages/contracts (§20 format + CI lint + coverage) | done | 13/13, COVERAGE 100.0% |
| packages/eval (3 corpora + §18 fixture generator) | done | 20/20 |
| Blind corpus (40, spec-only, pre-committed) | done | caught 5 false-blocks → fixed via spec'd RRP arm → false-block 5/5→1/5, injection intact |
| Replay corpus (community bugs) | done | 5/5 caught, codes matched |
| §13 screen-drift fixture | done | real gate blocks stale end-time; stable case passes |
| Injection-negative property | done | tool-read body text never becomes a routing referent |

## 2. WHAT IT TAKES TO COMPLETE EVERYTHING (full v4, §1–§32)
Completion = every v4 section at **live / proven-in-harness / modeled** with nothing at **open** (COMPLETENESS.md is the live tracker). Grouped by what each remaining item needs:

**A. Buildable by us, no external dependency (finish these):**
- B38 tier-aware min-rank (the 1 remaining blind false-block) — ~1 file.
- Three-act demo app on a NEUTRAL self-contained toolset (packages/demo) — no retired integration, no OAuth-side code.
- README/quickstart from clean checkout.
- Repair-ladder (§4 constrained re-emit) wired end-to-end in core (currently proven-in-harness).
- Receipts-lite everywhere (§17), taint-propagation surfacing (§2).

**B. Completable only as PROVEN-IN-HARNESS (need a signal the platform doesn't expose to us):**
- §6–§8 streaming (stable token ids, revision invalidation, speculation) — no streaming surface exposed → simulated decoder feeding the real gate. §8 is SPECIFIED-ONLY by G0 amendment.
- §13 screen drift — done as one harness fixture; broader coverage stays harness.
- §15 word-level ASR confidence — platform-internal → this is the adoption ASK, not a build.

**C. Completable only as MODELED / SPECIFIED (honest not-live):**
- §22 MCP annotation RFC (document), §25 cost hypothesis (experiment design), §29 commercial argument (doc).

## 3. FEASIBILITY VERDICT — is it possible?
**Completing the full v4 as LIVE by Sunday: NO — and that was never the target (Rule 14: spec is the target, the demonstrated subset flexes).** Sections in group B/C depend on platform-internal signals we do not have; forcing them live would mean faking capabilities, which violates the honesty contract.

**Completing to a DEFENSIBLE, DEMONSTRABLE bar by Sunday: YES — grounded, not aspirational.** The core is done and neutral; the rigor story (blind corpus caught real bugs, we fixed them) already exists and is the strongest Kai-facing asset; group A is a bounded Saturday build; groups B/C are honestly labeled "specified/proven-in-harness" with the not-live list stated out loud. The feasibility risk is not technical — it is scope discipline: chasing group B/C to "live" is the way to fail. We do not.

## 4. THE OPEN QUESTION FOR THE DEMO SUBSTRATE
The gate needs *something* to gate on stage. Options, his call at approval:
- **(Recommended) Neutral self-contained toolset** in packages/demo — a handful of representative tools (a send, a scheduled action, a destructive delete, a money action) with §20 contracts. Zero dependency on any other lane; demonstrates the layer as a layer.
- Run against the 6 integrations' tool *shapes* as declarative contracts — REJECTED unless he says otherwise: it means reading the other lane's work, which breaches the no-interact boundary.

*Deep agentic workflow specifics deferred: the OAuth session is sending more info on the workflow system; the waved plan below is shaped to accept it, and no build fires before his go.*
