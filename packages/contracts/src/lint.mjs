/**
 * Contract lint — SPEC S20.2/S20.3.
 *
 * FAILS (exit 1) when any Tier 2/3 write tool has:
 *   - an undeclared or invalid tier,
 *   - an unannotated parameter (every key in the tool's schema_params snapshot must carry
 *     a `provenance` annotation; routing params must carry `min_rank`, content params `taint`),
 *   - a missing or invalid `reversibility` class,
 *   - a missing `inverse` while reversibility is not "irreversible".
 *
 * WARNS (does NOT fail) when:
 *   - an inverse is declared but the named tool is not built in this catalog — the
 *     declared-but-unbuilt distinction S16.x needs kept visible, never silently green,
 *   - an annotation names a parameter absent from the schema_params snapshot (drift),
 *   - a tier-1 tool omits `side_effect_free: true` (not speculation-eligible until declared),
 *   - a tier-1 parameter has no annotation (declarative gap only — reads are not gated),
 *   - an irreversible tool also declares an inverse (contradiction).
 *
 * COVERAGE (S20.3) = write tools with zero FAIL findings / write tools, printed every run.
 *
 * Zero dependencies. Node 20+. Usage: node src/lint.mjs <annotations.json> [...more]
 */

export const REVERSIBILITY = ['reversible', 'compensable', 'irreversible'];
export const PROVENANCE = ['routing', 'content'];
export const TAINT = ['propagate', 'none'];

const isInt = (v) => Number.isInteger(v);

/** Normalize the two inverse spellings (string shorthand | object) into one shape. */
function readInverse(inverse) {
  if (typeof inverse === 'string' && inverse.trim() !== '') {
    return { tool: inverse, status: undefined, via: undefined, note: undefined };
  }
  if (inverse !== null && typeof inverse === 'object' && !Array.isArray(inverse)) {
    return {
      tool: typeof inverse.tool === 'string' ? inverse.tool : undefined,
      status: typeof inverse.status === 'string' ? inverse.status : undefined,
      via: typeof inverse.via === 'string' ? inverse.via : undefined,
      note: typeof inverse.note === 'string' ? inverse.note : undefined,
    };
  }
  return null; // absent, null, or malformed — caller decides fail/ok by reversibility class
}

/**
 * Lint one catalog object ({ tools: { name: annotation } }).
 * Returns { tools: [...], writes, fullyAnnotatedWrites, coverage, inverses, failed }.
 */
export function lintCatalog(catalog) {
  const entries = Object.entries(catalog?.tools ?? {});
  const toolNames = new Set(entries.map(([name]) => name));
  const results = [];
  const inverses = { built: 0, unbuilt: 0, missing: 0 };

  for (const [name, ann] of entries) {
    const fails = [];
    const warns = [];

    // ── tier ──────────────────────────────────────────────────────────────────────────────
    const tier = ann?.tier;
    if (![1, 2, 3].includes(tier)) fails.push('undeclared or invalid tier (must be 1|2|3)');
    const write = tier === 2 || tier === 3;

    if (tier === 1 && ann?.side_effect_free !== true) {
      warns.push('tier-1 tool without side_effect_free:true — not speculation-eligible until declared');
    }
    if (write && ann?.side_effect_free === true) {
      fails.push('contradiction: tier 2/3 declared side_effect_free:true');
    }

    // ── parameter snapshot completeness ───────────────────────────────────────────────────
    const snapshot = Array.isArray(ann?.schema_params) ? ann.schema_params : null;
    if (snapshot === null) fails.push('no schema_params snapshot (cannot prove completeness)');
    const params = ann?.params !== null && typeof ann?.params === 'object' ? ann.params : {};

    for (const paramName of snapshot ?? []) {
      const p = params[paramName];
      if (p === undefined) {
        if (write) fails.push(`unannotated parameter "${paramName}"`);
        else warns.push(`tier-1 parameter "${paramName}" unannotated (declarative gap)`);
        continue;
      }
      if (!PROVENANCE.includes(p.provenance)) {
        fails.push(`parameter "${paramName}": provenance must be routing|content`);
        continue;
      }
      if (write && p.provenance === 'routing' && !(isInt(p.min_rank) && p.min_rank >= 0 && p.min_rank <= 4)) {
        fails.push(`routing parameter "${paramName}": min_rank (0-4) required on a write tool`);
      }
      if (write && p.provenance === 'content' && !TAINT.includes(p.taint)) {
        fails.push(`content parameter "${paramName}": taint (propagate|none) required on a write tool`);
      }
    }
    for (const paramName of Object.keys(params)) {
      if (snapshot !== null && !snapshot.includes(paramName)) {
        warns.push(`annotation for unknown parameter "${paramName}" (snapshot drift?)`);
      }
    }

    // ── reversibility + inverse (write tools only) ────────────────────────────────────────
    if (write) {
      const rev = ann?.reversibility;
      if (!REVERSIBILITY.includes(rev)) {
        fails.push('missing or invalid reversibility (reversible|compensable|irreversible)');
      } else if (rev === 'irreversible') {
        if (ann?.inverse !== undefined && ann?.inverse !== null) {
          warns.push('irreversible tool also declares an inverse (contradiction — pick one)');
        }
      } else {
        const inv = readInverse(ann?.inverse);
        if (inv === null || inv.tool === undefined) {
          fails.push(`missing inverse (required unless reversibility:"irreversible")`);
          inverses.missing += 1;
        } else {
          const builtInCatalog = toolNames.has(inv.tool);
          if (inv.status === 'built' && !builtInCatalog) {
            fails.push(`inverse "${inv.tool}" claims status:"built" but is not in this catalog`);
          } else if (builtInCatalog) {
            inverses.built += 1;
          } else {
            inverses.unbuilt += 1;
            const via = inv.via === undefined ? '' : ` (API compensation exists: ${inv.via})`;
            warns.push(`inverse "${inv.tool}" declared but UNBUILT${via} — undo cannot ship until it does`);
          }
        }
      }
    }

    results.push({
      name,
      tier: [1, 2, 3].includes(tier) ? tier : '?',
      kind: write ? 'write' : 'read',
      result: fails.length > 0 ? 'FAIL' : warns.length > 0 ? 'WARN' : 'PASS',
      fails,
      warns,
    });
  }

  const writeTools = results.filter((r) => r.kind === 'write');
  const fullyAnnotated = writeTools.filter((r) => r.fails.length === 0);
  const coverage = writeTools.length === 0 ? 100 : (fullyAnnotated.length / writeTools.length) * 100;

  return {
    tools: results,
    writes: writeTools.length,
    fullyAnnotatedWrites: fullyAnnotated.length,
    coverage,
    inverses,
    failed: results.some((r) => r.result === 'FAIL'),
  };
}

/** Render the per-tool table + the coverage line. Pure string building, for CLI and tests. */
export function renderReport(catalogName, report) {
  const lines = [];
  lines.push(`CONTRACT LINT — catalog: ${catalogName} (${report.tools.length} tools)`);
  const pad = (s, n) => String(s).padEnd(n);
  lines.push(`  ${pad('tool', 26)} ${pad('tier', 5)} ${pad('kind', 6)} result`);
  for (const t of report.tools) {
    lines.push(`  ${pad(t.name, 26)} ${pad(t.tier, 5)} ${pad(t.kind, 6)} ${t.result}`);
    for (const f of t.fails) lines.push(`      ✗ ${f}`);
    for (const w of t.warns) lines.push(`      ⚠ ${w}`);
  }
  lines.push('');
  lines.push(
    `  write tools fully annotated: ${report.fullyAnnotatedWrites}/${report.writes}` +
      ` — COVERAGE ${report.coverage.toFixed(1)}%`,
  );
  lines.push(
    `  inverses: ${report.inverses.built} built, ${report.inverses.unbuilt} declared-but-unbuilt (WARN),` +
      ` ${report.inverses.missing} missing (FAIL)`,
  );
  lines.push(`  verdict: ${report.failed ? 'FAIL' : 'PASS'} (warnings never fail the build; missing declarations do)`);
  return lines.join('\n');
}

/* ─────────────────────────────────────────── CLI ─────────────────────────────────────────── */

const { pathToFileURL } = await import('node:url');
const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const { readFileSync } = await import('node:fs');
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('usage: node src/lint.mjs <annotations.json> [...more]');
    process.exit(2);
  }
  let anyFailed = false;
  for (const file of files) {
    const catalog = JSON.parse(readFileSync(file, 'utf8'));
    const report = lintCatalog(catalog);
    console.log(renderReport(catalog.catalog ?? file, report));
    if (report.failed) anyFailed = true;
  }
  process.exit(anyFailed ? 1 : 0);
}
