# Contract annotation format — `preflight-contract-annotations` v1

*SPEC S20.1-S20.3, SPEC-v4 §20-22. Owner: CONTRACTS. The rule this package exists to enforce:
provenance requirements live as annotations on the tool's JSON schema, never as logic inside
gate code — so integration #40 costs what #2 cost.*

An annotations file is JSON-schema-**adjacent**, not a fork of the tool schema: it sits next to
a catalog's real tool definitions and annotates them by name. (For MCP adoption, §22, the same
keys embed directly into the tool's `inputSchema` — the vocabulary is host-neutral on purpose.)

## File shape

```json
{
  "$format": "preflight-contract-annotations",
  "version": 1,
  "catalog": "slack",
  "source": "where the real schemas live + when the snapshot was transcribed",
  "rank_scale": { "4": "transcript_span", "3": "tool_output", "2": "known_state", "1": "screen", "0": "model_composed" },
  "tools": { "<tool_name>": { ...tool annotation... } }
}
```

`rank_scale` is documentation of the shared scale — it must match `@preflight/core`'s `RANK`
(provenance.ts); the lint does not re-derive it.

## Per-tool keys

| key | type | meaning |
|---|---|---|
| `tier` | `1 \| 2 \| 3` | SPEC-v4 §5. **Required on every tool.** Undeclared tier = lint FAIL. |
| `side_effect_free` | boolean | Speculation eligibility (SPEC.md:133). Tier-1 without `true` = WARN (not speculation-eligible). `true` on tier 2/3 = FAIL (contradiction). |
| `confirm` | boolean | Snapshot fact from the catalog (does the tool carry a confirmation card today). Recorded, not judged. |
| `reversibility` | `"reversible" \| "compensable" \| "irreversible"` | S16.3, exactly one class. **Required on tier 2/3.** Missing/invalid = FAIL. |
| `inverse` | string \| object \| null | S16.1. String = name of a tool **in this catalog** (built). Object = `{ tool, status?, via?, note? }` for the honest cases — see below. Missing while not irreversible = FAIL. |
| `inverse_window_s` | number \| null | S16.3 validity window. `null` = no fixed window (explain in `window_note`). |
| `schema_params` | string[] | **The parameter snapshot** — every property name in the tool's real `inputSchema`. Completeness of annotations is checked against this list. Missing snapshot = FAIL. |
| `params` | object | Per-parameter annotations, keyed by parameter name. |
| `note`, `window_note` | string | Free-text honesty. Never parsed. |

### The inverse honesty rule (WARN vs FAIL)

The lint distinguishes three states, and the distinction is visible in every report:

- **built** — the named inverse tool exists in this catalog → clean PASS, counted in "built".
- **declared-but-unbuilt** — `{ "tool": "slack_undo_scheduled", "status": "unbuilt", "via": "chat.deleteScheduledMessage" }`:
  the compensation path exists at the API and the intent is declared, but no tool ships it.
  → **WARN, never FAIL** ("undo cannot ship until it does"), counted separately. Declaring
  `status: "built"` for a tool absent from the catalog = FAIL (you may not lie upward).
- **missing** — no inverse at all on a non-irreversible write → **FAIL** (S20.2).

## Per-parameter keys

| key | type | meaning | lint on tier 2/3 writes |
|---|---|---|---|
| `provenance` | `"routing" \| "content"` | §1/§2 class; same vocabulary as core's `ParamClass`. | **Required for every `schema_params` entry.** Missing = FAIL. Invalid value = FAIL everywhere (reads too). |
| `min_rank` | integer 0-4 | Minimum provenance rank on the shared scale. | Required on `routing` params. Missing = FAIL. |
| `taint` | `"propagate" \| "none"` | Whether the value carries its sources' taint forward. | Required on `content` params. Missing = FAIL. |
| `derivable_from` | string | Where a derived/internal value legitimately comes from (`"prior_read"`, another param, another tool's result). | Optional, declarative. |
| `reversible_by` | string | Which tool compensates the effect this param routes (SPEC-v4 §20 example). | Optional, declarative. |
| `note` | string | Honesty. | Never parsed. |

Tier-1 parameters may be annotated (encouraged); an unannotated tier-1 parameter is a WARN
(declarative gap), never a FAIL — reads are fail-open (S19.2) and not rank-gated.

## What the lint ENFORCES today vs what is DECLARATIVE-ONLY

**Enforced by `src/lint.mjs` (FAIL = CI red, exit 1):**
- tier declared and valid on all 16 tools; `side_effect_free` contradiction on writes
- every snapshot parameter of every tier 2/3 write annotated with a valid `provenance`
- `min_rank` present on routing params, `taint` present on content params (writes)
- `reversibility` declared and valid on every write
- `inverse` present unless irreversible; "built" claims verified against the catalog
- coverage computed and printed on every run (S20.3)

**Enforced as WARN (visible, never red):** unbuilt inverses, snapshot-drift annotations,
tier-1 declarative gaps, irreversible+inverse contradictions.

**Declarative-only today (the honest list):**
- **`min_rank` at runtime.** The generic min-rank lattice runs in `@preflight/core`
  (`preflight()` + `minRankFor`) and gates only tools wired through it — today the walking
  skeleton's `send_message`. The v3 Slack handlers enforce hand-coded *approximations*
  (grounding registry, deterministic time resolution, missing_duration blocks), not these
  numbers. Migrating them onto contract-driven gating is exactly this pod's veto agenda.
- **Rank-4 claims** (`when`, `time`, boolean mode flags like `broadcast`). Attribution to the
  transcript is claimed-transcript-deep even in core (skeleton-notes.md); platform-attested
  audio is the §22 adoption ask. The annotation states the *requirement*; nothing verifies it
  end-to-end yet.
- **`taint` propagation, `derivable_from`, `reversible_by`, `inverse_window_s`** — recorded
  for the receipt/undo engines (§16/§17) to consume; no runtime reads them yet.
- **`schema_params` fidelity to the real source files.** The lint proves annotations cover the
  snapshot; the snapshot was transcribed by hand from the catalog source (paths + date in the
  file's `source` field). A codegen extractor that regenerates the snapshot from the TS source
  is the next step; until then snapshot-vs-source drift is a manual audit.

## Alignment with `@preflight/core` (align, don't fork)

`params.<name>.provenance` ≡ core `ParamSpec.class`; `min_rank` is the per-param override of
core's `MIN_RANK[class]` (routing 3 / content 0); `tier` matches `ToolContract.tier`. A
`ToolContract` is derivable from a tool annotation by projection — codegen target, not built.

## Running

```
cd packages/contracts && npm test   # unit tests + lint over catalogs/slack.annotations.json
npm run lint                        # lint only
```

Zero dependencies, zero installs; exit 1 on any FAIL, exit 0 with visible warnings otherwise.
