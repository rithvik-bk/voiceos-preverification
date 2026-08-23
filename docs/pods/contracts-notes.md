# CONTRACTS NOTES — Phase: annotation format + lint + real catalog
*Written 2026-08-21 by CONTRACTS. Every number from a command run this session. Companions: `../../packages/contracts/FORMAT.md` (the format), `recon-inventory.md` (catalog ground truth), `skeleton-notes.md` (core shapes aligned to).*

## What was built

`packages/contracts` — three things, zero dependencies, zero installs:

1. **Format** (`FORMAT.md`, `preflight-contract-annotations` v1): JSON-schema-adjacent per-tool `tier` / `reversibility` / `inverse` / `inverse_window_s`, per-param `provenance` / `min_rank` / `taint` / `derivable_from` / `reversible_by`, exactly the S20.1 vocabulary. Sits *next to* a catalog rather than forking its schemas; embeds into `inputSchema` unchanged for the §22 MCP RFC.
2. **Lint** (`src/lint.mjs` + `test/lint.test.mjs`, plain node, no deps): FAILs on undeclared tier, any unannotated parameter of a tier 2/3 write, missing `min_rank` (routing) / `taint` (content), missing reversibility, or missing inverse unless `irreversible`. Prints per-tool pass/fail + coverage every run. Exit 1 on FAIL — verified with a bad fixture (exit=1) and green catalog (exit=0).
3. **Real catalog** (`catalogs/slack.annotations.json`): all **16 tools** of Rithvik's own Slack integration in `universal-voiceos-oauth` (read, untouched), truthfully — 7 tier-1 reads, 9 writes (7 of them confirm-gated: send, react, schedule, reminder, upload, thread_reply, set_status; connect/disconnect are toggle-grade writes without cards, recorded as such).

## The numbers (this session's run)

- `cd packages/contracts && npm test` → **13/13 tests pass**, then the lint over the real catalog: **COVERAGE 100.0% (9/9 write tools fully annotated)**, **0 FAILs**, exit 0, no node_modules anywhere.
- Inverses: **2 built** (connect ⇄ disconnect — the only true pair in the catalog), **7 declared-but-unbuilt** (WARN, per-tool visible: delete_message ×2, remove_reaction, undo_scheduled, delete_reminder, delete_file, clear_status), **0 missing**. The famous RECON one — `slack_undo_scheduled` — is annotated with its live handle (`scheduled_message_id`, tools-t2.ts:904) and flagged UNBUILT.

## Format decisions worth defending

- **WARN ≠ FAIL is a three-state inverse model**: built (named tool in catalog) / declared-but-unbuilt (`{tool, status:"unbuilt", via}` — API compensation named, WARN) / missing (FAIL). Claiming `status:"built"` for an absent tool is a FAIL — you can't lie upward. The report counts the three states separately every run.
- **`schema_params` snapshot**: completeness is checked against a per-tool parameter list transcribed from the real source (dated, path-cited in the file). Enforced: annotations cover the snapshot. Manual today: snapshot fidelity to the TS source — the codegen extractor is the next increment, and until it exists this is the format's honest soft spot.
- **Truthful classifications over convenient ones**: send/thread_reply/upload = *compensable* (delete exists but recipients saw/notified), react/schedule/reminder/set_status = *reversible* (true API inverse, schedule's window dynamic until `post_at`), upload `path` = min_rank 2 (known_state, statSync hard block), display args (`message`, `replying_to`, `filename`) = content/taint-none with grounding-check notes.
- **Awkwardness found**: boolean mode flags (`broadcast`, `snooze`, `switch`) fit the two-class routing/content vocabulary badly — classed routing/min_rank 4 ("must be spoken") with notes, but nothing enforces rank on flags at runtime; §2's "model_composed never routing-eligible" meets its edge case here. Also `min_rank` on the v3 Slack handlers is entirely declarative — their gates are hand-coded approximations; only `@preflight/core`'s skeleton path consumes contracts at runtime. Both stated in FORMAT.md's enforced-vs-declarative table.

## Verdict

✅ VERIFIED-DONE — `cd /Users/rithvik/preflight/packages/contracts && npm test` this session: 13 pass / 0 fail, lint printed `COVERAGE 100.0%`, `2 built, 7 declared-but-unbuilt (WARN), 0 missing`, verdict PASS, exit 0.
