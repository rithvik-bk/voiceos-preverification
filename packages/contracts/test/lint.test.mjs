/* Contract lint tests — SPEC S20.2 (the three FAIL conditions), the WARN-not-FAIL rule for
 * declared-but-unbuilt inverses (S16 honesty), and S20.3 (coverage is computed and reported).
 * Zero dependencies: node:test + node:assert only. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lintCatalog, renderReport } from '../src/lint.mjs';

/** Minimal well-formed write tool; tests mutate copies of this. */
function goodWrite(overrides = {}) {
  return {
    tier: 3,
    side_effect_free: false,
    reversibility: 'compensable',
    inverse: { tool: 'other_tool_delete', status: 'unbuilt', via: 'api.delete' },
    schema_params: ['target', 'text'],
    params: {
      target: { provenance: 'routing', min_rank: 3 },
      text: { provenance: 'content', taint: 'propagate' },
    },
    ...overrides,
  };
}

test('a fully annotated catalog passes with 100% coverage', () => {
  const report = lintCatalog({ tools: { send: goodWrite() } });
  assert.equal(report.failed, false);
  assert.equal(report.writes, 1);
  assert.equal(report.coverage, 100);
});

test('FAIL: unannotated parameter on a Tier 3 write tool', () => {
  const ann = goodWrite();
  delete ann.params.text; // text is in schema_params but carries no annotation
  const report = lintCatalog({ tools: { send: ann } });
  assert.equal(report.failed, true);
  assert.match(report.tools[0].fails.join(' '), /unannotated parameter "text"/);
  assert.equal(report.coverage, 0);
});

test('FAIL: missing inverse when reversibility is not irreversible', () => {
  const report = lintCatalog({ tools: { send: goodWrite({ inverse: undefined }) } });
  assert.equal(report.failed, true);
  assert.match(report.tools[0].fails.join(' '), /missing inverse/);
  assert.equal(report.inverses.missing, 1);
});

test('FAIL: undeclared tier', () => {
  const ann = goodWrite();
  delete ann.tier;
  const report = lintCatalog({ tools: { send: ann } });
  assert.equal(report.failed, true);
  assert.match(report.tools[0].fails.join(' '), /undeclared or invalid tier/);
});

test('FAIL: routing param without min_rank, content param without taint (writes only)', () => {
  const ann = goodWrite();
  delete ann.params.target.min_rank;
  delete ann.params.text.taint;
  const report = lintCatalog({ tools: { send: ann } });
  assert.equal(report.failed, true);
  const all = report.tools[0].fails.join(' ');
  assert.match(all, /min_rank .* required/);
  assert.match(all, /taint .* required/);
});

test('PASS: irreversible tool needs no inverse', () => {
  const report = lintCatalog({
    tools: { burn: goodWrite({ reversibility: 'irreversible', inverse: undefined }) },
  });
  assert.equal(report.failed, false);
});

test('WARN not FAIL: declared-but-unbuilt inverse, and the distinction is visible', () => {
  const report = lintCatalog({ tools: { send: goodWrite() } }); // inverse tool not in catalog
  assert.equal(report.failed, false); // does NOT fail the build
  assert.equal(report.tools[0].result, 'WARN'); // but it is never silently green
  assert.match(report.tools[0].warns.join(' '), /declared but UNBUILT/);
  assert.equal(report.inverses.unbuilt, 1);
  assert.match(renderReport('t', report), /declared-but-unbuilt \(WARN\)/);
});

test('built inverse (string shorthand naming a catalog tool) is clean', () => {
  const report = lintCatalog({
    tools: {
      connect: goodWrite({
        tier: 2,
        reversibility: 'reversible',
        inverse: 'disconnect',
        schema_params: [],
        params: {},
      }),
      disconnect: goodWrite({
        tier: 2,
        reversibility: 'reversible',
        inverse: 'connect',
        schema_params: [],
        params: {},
      }),
    },
  });
  assert.equal(report.failed, false);
  assert.equal(report.inverses.built, 2);
  assert.equal(report.tools.every((t) => t.result === 'PASS'), true);
});

test('FAIL: inverse claiming status built while absent from the catalog', () => {
  const report = lintCatalog({
    tools: { send: goodWrite({ inverse: { tool: 'ghost_tool', status: 'built' } }) },
  });
  assert.equal(report.failed, true);
  assert.match(report.tools[0].fails.join(' '), /claims status:"built" but is not in this catalog/);
});

test('tier-1 read: unannotated params warn (declarative gap), never fail', () => {
  const report = lintCatalog({
    tools: { read: { tier: 1, side_effect_free: true, schema_params: ['channel'], params: {} } },
  });
  assert.equal(report.failed, false);
  assert.equal(report.tools[0].result, 'WARN');
});

/* ── the real catalog ─────────────────────────────────────────────────────────────────────── */

const slack = JSON.parse(
  readFileSync(new URL('../catalogs/slack.annotations.json', import.meta.url), 'utf8'),
);

test('slack catalog: 16 tools, 9 writes, zero FAILs, coverage 100%', () => {
  const report = lintCatalog(slack);
  assert.equal(report.tools.length, 16);
  assert.equal(report.writes, 9);
  assert.equal(report.failed, false);
  assert.equal(report.coverage, 100);
});

test('slack catalog: exactly 7 declared-but-unbuilt inverses (honest WARNs), 2 built, 0 missing', () => {
  const report = lintCatalog(slack);
  assert.equal(report.inverses.unbuilt, 7);
  assert.equal(report.inverses.built, 2);
  assert.equal(report.inverses.missing, 0);
  // the famous one from RECON: slack_undo_scheduled is declared and flagged unbuilt
  const schedule = report.tools.find((t) => t.name === 'slack_schedule_message');
  assert.match(schedule.warns.join(' '), /slack_undo_scheduled.*UNBUILT/);
});

test('slack catalog: the 7 confirm-gated tools are all annotated write tools', () => {
  const confirmed = Object.entries(slack.tools).filter(([, a]) => a.confirm === true);
  assert.equal(confirmed.length, 7);
  const report = lintCatalog(slack);
  for (const [name] of confirmed) {
    const t = report.tools.find((r) => r.name === name);
    assert.equal(t.kind, 'write');
    assert.equal(t.fails.length, 0);
  }
});
