/* Fixture generator tests — the §18.1 self-growing loop, proven end to end:
 *   real gate block (shadow-log output shape) → anonymized fixture in the corpus schema →
 *   back through the adapter → the SAME machine code reproduces on the real gate.
 * Also: anonymization is real — no raw workspace word survives serialization. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GroundingStore,
  SEND_MESSAGE,
  ShadowLog,
  finalizeUtterance,
  runGate,
  shadowGate,
  type GroundedTargetEntry,
  type Target,
  type ToolCall,
} from '../../core/src/index.ts';

import { anonymizeText, fixtureFromShadowRecord } from '../src/fixturegen.ts';
import { assessCase, buildGateInput } from '../src/adapter.ts';

const CHANNELS: Target[] = [
  { id: 'C0GEN', label: '#general', kind: 'channel' },
  { id: 'C0ENGB', label: '#eng-backend', kind: 'channel' },
  { id: 'C0ENGF', label: '#eng-frontend', kind: 'channel' },
];
const PEOPLE: Target[] = [
  { id: 'U0ARAVP', label: 'Arav Patel', kind: 'person', aliases: ['arav.patel'] },
  { id: 'U0ARAVK', label: 'Arav Kumar', kind: 'person', aliases: ['arav.kumar'] },
];

function store(extra?: (s: GroundingStore) => void): GroundingStore {
  const s = new GroundingStore();
  s.rememberTargets(CHANNELS, { kind: 'tool_output', tool: 'list_channels' });
  s.rememberTargets(PEOPLE, { kind: 'tool_output', tool: 'list_people' });
  extra?.(s);
  return s;
}

function entriesOf(s: GroundingStore): GroundedTargetEntry[] {
  return s.pool().map((target) => ({ target, source: s.sourceOf(target)! }));
}

function blockToFixture(utterance: string, target: string, extra?: (s: GroundingStore) => void) {
  const groundingStore = store(extra);
  const log = new ShadowLog({ now: () => 0 });
  const call: ToolCall = {
    tool: 'send_message',
    args: { target, text: 'the update' },
    transcript: finalizeUtterance('u1', utterance),
  };
  const outcome = shadowGate(call, SEND_MESSAGE, groundingStore, log);
  assert.equal(outcome.decision, 'would_have_blocked');
  const fixture = fixtureFromShadowRecord(
    outcome.record,
    { call, contract: SEND_MESSAGE, entries: entriesOf(groundingStore) },
    'GEN1',
  );
  return { fixture, code: outcome.record.code! };
}

function rerunCode(fixture: ReturnType<typeof blockToFixture>['fixture']): string | undefined {
  const assessment = assessCase(fixture);
  assert.equal(assessment.runnable, true, `generated fixture must be runnable: ${JSON.stringify(assessment.missing)}`);
  const input = buildGateInput(fixture);
  const verdict = runGate(input.call, input.contract, input.store);
  assert.equal(verdict.verdict, 'block');
  return verdict.verdict === 'block' ? verdict.code : undefined;
}

test('misheard-target block serializes to an anonymized fixture that reproduces target_not_found', () => {
  const { fixture, code } = blockToFixture('send the update to ing backend', 'ing backend');
  assert.equal(code, 'target_not_found');
  assert.equal(fixture.expected.verdict, 'BLOCK');
  assert.equal(fixture.expected.code, 'target_not_found');
  assert.equal(fixture.category, 'misheard-target');

  // Anonymized: no raw workspace or utterance word survives (hex pseudonyms cannot contain
  // these letters: k, g, u, r are outside a-f).
  const serialized = JSON.stringify(fixture);
  for (const raw of ['backend', 'eng', 'general', 'update', 'Arav', 'arav']) {
    assert.ok(!serialized.includes(raw), `raw text "${raw}" leaked into the fixture`);
  }

  // The loop closes: same code through adapter + real gate.
  assert.equal(rerunCode(fixture), 'target_not_found');
});

test('ambiguous-target block reproduces ambiguous_target after anonymization', () => {
  const { fixture, code } = blockToFixture('tell arav the demo is ready', 'arav');
  assert.equal(code, 'ambiguous_target');
  assert.equal(rerunCode(fixture), 'ambiguous_target');
});

test('screen-scraped grounding survives serialization as rank-1 and reproduces insufficient_provenance', () => {
  const { fixture, code } = blockToFixture('send the update to from screen', 'from-screen', (s) =>
    s.rememberTargets([{ id: 'CSCRAPE', label: '#from-screen', kind: 'channel' }], { kind: 'screen' }),
  );
  assert.equal(code, 'insufficient_provenance');
  assert.ok((fixture.x_screen_targets?.length ?? 0) === 1, 'screen-origin entry must serialize as x_screen_targets');
  assert.equal(rerunCode(fixture), 'insufficient_provenance');
});

test('injection block (provenance_mismatch) reproduces: the S11.2 catch survives the loop', () => {
  const { fixture, code } = blockToFixture('read the latest message in general', 'evil@corp.com', (s) =>
    s.rememberTargets([{ id: 'evil@corp.com', label: 'evil@corp.com', kind: 'person' }], { kind: 'tool_output', tool: 'read_channel' }),
  );
  assert.equal(code, 'provenance_mismatch');
  assert.equal(fixture.category, 'injection');
  assert.ok(!JSON.stringify(fixture).includes('evil'), 'the injected address must be anonymized');
  assert.equal(rerunCode(fixture), 'provenance_mismatch');
});

test('would_have_passed records are refused: only blocks serialize (S18.1)', () => {
  const groundingStore = store();
  const log = new ShadowLog({ now: () => 0 });
  const call: ToolCall = {
    tool: 'send_message',
    args: { target: 'eng backend', text: 'deploy is done' },
    transcript: finalizeUtterance('u1', 'send deploy is done to eng backend'),
  };
  const outcome = shadowGate(call, SEND_MESSAGE, groundingStore, log);
  assert.equal(outcome.decision, 'would_have_passed');
  assert.throws(
    () => fixtureFromShadowRecord(outcome.record, { call, contract: SEND_MESSAGE, entries: entriesOf(groundingStore) }, 'GENX'),
    /blocks only/,
  );
});

test('anonymization is deterministic and word-consistent (relations preserved)', () => {
  assert.equal(anonymizeText('eng backend'), anonymizeText('eng backend'));
  const a = anonymizeText('#eng-backend');
  const b = anonymizeText('eng backend');
  assert.equal(a.replace(/^#/, '').replace('-', ' '), b, 'same words map to same pseudonyms across separators');
});
