/* Latency bench for the walking skeleton (KICKOFF Phase 2 (d)).
 *
 * Measures the FULL shadow pipeline per call — transcript attribution + resolver ladder +
 * lattice check + receipt build + shadow-log append — mean over ≥1000 iterations per case.
 *
 * HONESTY NOTE (same discipline as the v3 harness, preflight-eval.mjs): this is the gate's
 * COMPUTE cost, in-process, against a static fixture. No network, no ASR, no model, no real
 * send anywhere in the number. Deterministic input; the only nondeterminism is the JIT.
 */

import { SEND_MESSAGE, type ToolCall } from '../src/gate.ts';
import { ShadowLog, shadowGate } from '../src/shadow.ts';
import { finalizeUtterance } from '../src/transcript.ts';
import { groundedStore, storeWithInjectedReferent } from '../test/fixtures.ts';

const ITERATIONS = 5000; // per case; contract requires >= 1000
const WARMUP = 1000;

const CASES: Array<{ name: string; call: ToolCall; expect: 'would_have_passed' | 'would_have_blocked' }> = [
  {
    name: 'clean send (passes, full receipt)',
    call: {
      tool: 'send_message',
      args: { target: 'eng backend', text: 'deploy is done' },
      transcript: finalizeUtterance('u1', 'send deploy is done to eng backend'),
    },
    expect: 'would_have_passed',
  },
  {
    name: 'misheard target (would_have_blocked)',
    call: {
      tool: 'send_message',
      args: { target: 'ing backend', text: 'deploy is done' },
      transcript: finalizeUtterance('u2', 'send deploy is done to ing backend'),
    },
    expect: 'would_have_blocked',
  },
  {
    // S11.2 injection firewall (Act 1): a destination that only appeared in read content.
    // Uses the injected-referent store so the address resolves (rank-3 tool_output) but has
    // no transcript span → provenance_mismatch. This is the new path added this build.
    name: 'injected destination (would_have_blocked, S11.2)',
    call: {
      tool: 'send_message',
      args: { target: 'evil@corp.com', text: "you're invited to standup" },
      transcript: finalizeUtterance('u3', 'read the latest message in general'),
    },
    expect: 'would_have_blocked',
  },
];

// Cases 1-2 run against the plain grounded store; case 3 needs the injected read referent.
const store = storeWithInjectedReferent();

function runCase(entry: (typeof CASES)[number]): { meanUs: number; p95Us: number } {
  // Warmup (JIT); fresh log per batch so append cost stays realistic without unbounded growth.
  let log = new ShadowLog({ now: () => 0 });
  for (let index = 0; index < WARMUP; index += 1) shadowGate(entry.call, SEND_MESSAGE, store, log);

  const samples = new Float64Array(ITERATIONS);
  log = new ShadowLog({ now: () => 0 });
  for (let index = 0; index < ITERATIONS; index += 1) {
    const started = performance.now();
    const outcome = shadowGate(entry.call, SEND_MESSAGE, store, log);
    samples[index] = performance.now() - started;
    if (outcome.decision !== entry.expect) throw new Error(`bench case drifted: ${entry.name}`);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const meanMs = sorted.reduce((sum, value) => sum + value, 0) / ITERATIONS;
  const p95Ms = sorted[Math.floor(ITERATIONS * 0.95)]!;
  return { meanUs: meanMs * 1000, p95Us: p95Ms * 1000 };
}

console.log('preflight core — shadow-pipeline latency (in-process compute only, static fixture)');
console.log(`node ${process.version} · ${ITERATIONS} iterations per case after ${WARMUP} warmup\n`);
for (const entry of CASES) {
  const { meanUs, p95Us } = runCase(entry);
  console.log(`  ${entry.name.padEnd(42)} mean ${meanUs.toFixed(1)} µs · p95 ${p95Us.toFixed(1)} µs`);
}
console.log('\nNo network, no ASR, no LLM, no real send is included in these numbers.');
