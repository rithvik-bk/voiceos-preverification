/* Enforcement tests (KICKOFF rules 6 + 7, STAFF-ENG veto conditions):
 *   (c1) packages/core imports no network client and no LLM client — a build with either FAILS;
 *   (c2) package.json declares ZERO runtime dependencies (dev deps unrestricted);
 *   (c3) the gate source performs no fetch and imports no node built-in capable of I/O —
 *        the core's only imports are its own files. Its availability is the process's (§19).
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(PKG_ROOT, 'src');

/** Module specifiers that would mean the gate path can reach a network or an LLM. */
const BANNED_SPECIFIERS = [
  'node:http', 'node:https', 'node:net', 'node:tls', 'node:dgram', 'node:dns',
  'http', 'https', 'net', 'tls', 'dgram', 'dns',
  'undici', 'axios', 'node-fetch', 'got', 'ws',
  'openai', 'anthropic', '@anthropic-ai/sdk', '@google/generative-ai', 'groq-sdk', 'cohere-ai',
];

function sourceFiles(): string[] {
  return readdirSync(SRC)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(SRC, name));
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /import\s+[^'"]*?from\s*['"]([^'"]+)['"]/g,
    /import\s*['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]!);
  }
  return specifiers;
}

test('gate core imports no network client and no LLM client', () => {
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      const base = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0]!;
      assert.ok(
        !BANNED_SPECIFIERS.includes(base) && !BANNED_SPECIFIERS.includes(specifier),
        `${file} imports banned module: ${specifier}`,
      );
    }
  }
});

test('gate core imports ONLY its own relative modules — not even node built-ins', () => {
  // Stricter than the rule requires, and true today: pure compute needs no platform at all.
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      assert.ok(specifier.startsWith('./') || specifier.startsWith('../'),
        `${file} imports non-local module: ${specifier}`);
    }
  }
});

test('gate core never calls fetch or opens a socket', () => {
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    assert.ok(!/\bfetch\s*\(/.test(source), `${file} calls fetch()`);
    assert.ok(!/\bWebSocket\b/.test(source), `${file} references WebSocket`);
    assert.ok(!/\bXMLHttpRequest\b/.test(source), `${file} references XMLHttpRequest`);
  }
});

test('package.json declares zero runtime dependencies', () => {
  const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')) as Record<string, unknown>;
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies', 'bundledDependencies']) {
    const deps = pkg[field];
    assert.ok(
      deps === undefined || Object.keys(deps as object).length === 0,
      `package.json must not declare ${field} (KICKOFF rule 6); found: ${JSON.stringify(deps)}`,
    );
  }
  // devDependencies are unrestricted by rule 6 — no assertion on them.
});
