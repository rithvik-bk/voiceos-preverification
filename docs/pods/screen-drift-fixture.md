# SCREEN-DRIFT FIXTURE — §13 PROVEN-IN-HARNESS (G0 amendment 3)
*TEST-ENG, 2026-08-21. One fixture, two runs, mirroring replay-corpus case R1 (the community-reported calendar end-time bug: screen inspection is on-demand and one turn lagged, so the model fills a value from a stale frame).*

## Runnable command

```
cd /Users/rithvik/universal-voiceos-oauth
node tools/screen-drift-fixture.mjs          # human transcript, exit 0 = pass
node tools/screen-drift-fixture.mjs --json   # machine-readable
npm test                                     # includes engine/test/screen-drift.test.ts (spawns the fixture, asserts both halves)
```

Both files are ADDITIVE — no existing source or test file in `universal-voiceos-oauth` was touched:
- `tools/screen-drift-fixture.mjs` (the harness)
- `engine/test/screen-drift.test.ts` (2 tests, same spawn-`--json` convention as `slack-integration.test.ts` uses for `preflight-eval.mjs`)

## What is SIMULATED vs what is REAL — explicit

**SIMULATED (harness code only, labeled in the file header and in every output line it produces):**
- The surface ring buffer: bounded (~10 s) buffer of observations keyed by **composite surface id** (app / window / document / view-hash), transitions detected by id change only, never content heuristics. VoiceOS exposes no surface-transition events to integrations (recon-inventory §2.2), so this layer must be simulated — stated, not hidden.
- The §13 transition policy itself (deixis binding at the deictic-token timestamp; rank-0 demotion; auto-selection disable).
- The Slack HTTP transport (same in-memory stub pattern as `preflight-eval.mjs`; the stub records every write method requested).

**REAL (imported unmodified from the deployed integration — the verdict comes from gate code, never from the harness):**
- The prior read: the actual `slack_read_channel` T1 handler, its result handed to the actual `groundFromToolResult()` — the exact one-line wire `server.ts` uses.
- The licensing check: `isGrounded()` (registry membership) — screen evidence may only rank candidates a real read licensed.
- **The gate:** the actual `slack_react` T2 handler → `resolveTarget` → `groundMessage` → `PreflightBlock('ungrounded_message')` (`integrations/slack/tools-t2.ts`). Catch evidence is behavioral, same criterion as the eval: the stub recorded **no** write method.

R1 mapping note: the calendar end-time maps to the message referent (`channel`+`ts`) — the routing value whose provenance the real gate actually checks. The mechanism is identical to R1's verified root cause (a value filled from a stale/never-read source is ungrounded), which `replay-corpus-candidates.md` R8 already identifies as the same mechanism.

## Exact §13 rules exercised

1. **Deixis resolves at utterance time, not dispatch time** — "that" binds against the observation at t=400 ms, not at finalization (t=1600 ms).
2. **Invalidate, never re-point** — surface id changes between the deictic token and finalization → screen evidence demoted to **rank 0**, contributes nothing; the policy function returns *without ever reading the post-transition surface*. The fixture sets a trap: surface B carries a **grounded** referent that WOULD pass the gate if re-pointed — asserted that no write ever touches it. That trap is why the rule exists: the gate alone can't catch a re-point to a licensed-but-wrong target.
3. **Auto-selection is disabled on transition** — with selection off, the model's stale-sourced proposal reaches the gate as-is and is blocked; worst outcome is a block/ask, never a silent wrong write.
4. (§12, exercised in the stable case) **Screen ranks, never introduces** — a stale row rendered on A but never surfaced by a read is filtered from candidates even when the surface is stable.

**Negative half (proves the fixture tests the policy, not a wall):** same workspace, same prior reads, same model proposal, no transition → screen evidence stays rank 1, auto-selection picks the read-licensed candidate, and the real gate **passes** it — `reactions.add` fires exactly once.

## Output transcript of a passing run (this session, 2026-08-21)

```
SCREEN-DRIFT FIXTURE — §13 transition policy vs the REAL preflight gate
SIMULATED: surface ring buffer + §13 policy + Slack transport stub.
REAL:      slack_read_channel, groundFromToolResult, isGrounded, slack_react → PreflightBlock.

── case: drift ───────────────────────────────────────────────────────
   REAL       slack_read_channel(#design-reviews) → groundFromToolResult harvested 1 referent(s)
   REAL       slack_read_channel(#general) → groundFromToolResult harvested 1 referent(s)
   REAL       isGrounded(C0CAL, TS_EVENT)=true  isGrounded(C0CAL, TS_STALE)=false
   SIMULATED  t=900ms: surface transition A → B (alt-tab mid-utterance)
   SIMULATED  §13 policy: screenRank=0 autoSelection=disabled candidates=[] invalidated=true
   SIMULATED  dispatch args: channel=C0CAL ts=1787324400.000450 (model proposal, stale-sourced)
   REAL       slack_react → blocked before the write, code=ungrounded_message
   PASS  transition detected, screen evidence demoted to rank 0
   PASS  never re-pointed at surface B (no write to B ever)
   PASS  REAL gate blocked the stale-sourced value (ungrounded_message)
   PASS  write never fired (behavioral catch, stub recorded nothing)

── case: stable ──────────────────────────────────────────────────────
   REAL       slack_read_channel(#design-reviews) → groundFromToolResult harvested 1 referent(s)
   REAL       slack_read_channel(#general) → groundFromToolResult harvested 1 referent(s)
   REAL       isGrounded(C0CAL, TS_EVENT)=true  isGrounded(C0CAL, TS_STALE)=false
   SIMULATED  surface A stays focused through finalization
   SIMULATED  §13 policy: screenRank=1 autoSelection=enabled candidates=[row#evt-42] invalidated=false
   SIMULATED  dispatch args: channel=C0CAL ts=1787328000.000200 (screen-selected row#evt-42)
   REAL       slack_react → WRITE FIRED (reactions.add)
   PASS  no transition, screen evidence kept at rank 1
   PASS  screen ranked ONLY read-licensed candidates (stale row filtered by §12)
   PASS  auto-selection routed the grounded referent
   PASS  REAL gate passed it — the write fired exactly once

RESULT: PASS — both halves held.
```

## Regression evidence (this session)

- `npm test`: **23 files, 418 tests passed** (416 pre-existing + the 2 new screen-drift tests; nothing regressed).
- `node tools/preflight-eval.mjs`: **50/50 drifts caught, 0/6 false blocks** — unchanged.
- `npm run typecheck`: clean.
- Additive-only confirmed: the only files this work added to the repo are the two listed above; no existing file modified.

## The honest sentence on stage

> "The surface buffer is simulated; the gate that catches it is the real one."
