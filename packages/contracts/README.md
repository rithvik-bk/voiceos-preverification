# @preflight/contracts

The declarative tool-annotation layer (SPEC S20). Every Tier-2/3 write tool a voice agent can call
is described in a JSON catalog — each parameter tagged with its provenance class (`routing` vs
`content`), routing params with a `min_rank`, content params with a `taint` flag, plus the tool's
`tier`, `reversibility`, and `inverse`. A zero-dependency linter enforces that those annotations are
complete and internally consistent, and prints a coverage number. This is what lets the gate run off
a contract instead of hand-written per-handler logic. Pure JS (`.mjs`) + JSON — nothing to compile,
runs from a clean checkout with no `node_modules`. This is a **prototype** annotation format, not a
finalized standard.

## Files

| File | What it does |
|---|---|
| `src/lint.mjs` | The linter: `lintCatalog(catalog)` fails (exit 1) on undeclared/invalid tier, any unannotated Tier-2/3 write parameter, missing/invalid `reversibility`, or a missing `inverse` when reversibility isn't `irreversible`; warns (no fail) on declared-but-unbuilt inverses, schema drift, and tier-1 gaps; prints S20.3 coverage every run. |
| `catalogs/voiceos.annotations.json` | The VoiceOS tool catalog — the annotated write tools the gate/adapter target. |
| `catalogs/slack.annotations.json` | The Slack tool catalog — the second annotated surface, exported for reuse. |
| `test/lint.test.mjs` | The linter's own tests: asserts the fail/warn rules above and the coverage math. |
| `FORMAT.md` | The annotation format reference — the field-by-field spec a catalog author writes to. |

## Run the tests / lint

```
cd packages/contracts
node --test 'test/**/*.test.mjs'          # 13 tests, all pass
node src/lint.mjs catalogs/slack.annotations.json   # lint one catalog, prints coverage
npm test                                  # tests + a lint pass over the Slack catalog
npm run build                             # node --check on the shipped linter (syntax gate)
```

The linter takes one or more catalog paths: `node src/lint.mjs <annotations.json> [...more]`.
