/* ──────────────────────────────── the proof-tree composer ──────────────────────────────────
 *
 * SOLUTION.md §"THE PROOF-TREE": verify a whole autonomous PLAN before any step fires. This is a
 * graph walk that REUSES the built single-step gate (runGate) per node — no gate logic is
 * duplicated. What the walk adds is exactly the three composition rules (plan.ts):
 *
 *   1. COMPOSITION — a passed step whose output is STRUCTURED and SURFACED contributes its
 *      grounded targets to a session-wide licensing pool. A later step routing to one of those
 *      targets is licensed `prior_step` (card-tap-equivalent, rank-4). Expressed to the unmodified
 *      gate as a rank-4 store source tagged `prior_step:<id>`; the honest provenance is recorded
 *      in ProofNode.licensedBy. This makes "email the top lead you FOUND" PASS.
 *
 *   2. TAINT — the invariant `no tainted value reaches a routing sink` (taint.ts) is checked per
 *      node BEFORE the gate. A CONTENT_READ taints; taint propagates along declared derive edges.
 *      This makes "read the billing email and PAY it" BLOCK.
 *
 *   3. POISON — a node whose any dependency did not cleanly `pass` is `deferred`: no green
 *      downstream of a hole. Applied first, so a poisoned node never runs the gate or mutates state.
 *
 * Deterministic: topological order, no clock, no IO, no LLM. Same plan + same store → same tree.
 */

import { runGate } from './gate.ts';
import { dispositionFor } from './codes.ts';
import { GroundingStore } from './grounding.ts';
import { PreflightBlock } from './block.ts';
import type { Target } from './resolve.ts';
import {
  type LicensedBy,
  type NodeVerdict,
  type Plan,
  type PlanStep,
  type ProofNode,
  type ProofTree,
} from './plan.ts';
import { assertNoTaintedRoutingSink, normalizeValue, TaintLedger } from './taint.ts';

export interface VerifyOpts {
  /** Reserved: the autonomy level a runtime would apply to the resulting tree (see autonomy.ts). */
  autonomy?: number;
}

/** A surfaced structured target plus the step that surfaced it — the composition licensing unit. */
interface SurfacedTarget {
  target: Target;
  stepId: string;
}

/**
 * Verify a plan: walk the DAG in dependency order, thread licensing + taint forward, run the built
 * gate per node, and classify each node pass / hold / block / deferred. Returns the proof tree.
 */
export function verifyPlan(plan: Plan, store: GroundingStore, _opts: VerifyOpts = {}): ProofTree {
  const byId = new Map<string, PlanStep>(plan.steps.map((step) => [step.id, step]));
  const order = topoOrder(plan.steps);

  const verdictById = new Map<string, NodeVerdict>();
  const ledger = new TaintLedger();
  const surfaced: SurfacedTarget[] = [];
  const licensedByValue = new Map<string, string>(); // normalized value → surfacing stepId
  const nodes: ProofNode[] = [];

  for (const id of order) {
    const step = byId.get(id);
    if (step === undefined) continue;
    const node = evaluateStep(step, store, verdictById, ledger, surfaced, licensedByValue);
    verdictById.set(id, node.verdict);
    nodes.push(node);
  }

  // Emit nodes in the plan's declared order (topo order is an internal detail).
  const declared = plan.steps
    .map((step) => nodes.find((node) => node.id === step.id))
    .filter((node): node is ProofNode => node !== undefined);

  return { nodes: declared, summary: summarize(declared) };
}

function evaluateStep(
  step: PlanStep,
  baseStore: GroundingStore,
  verdictById: Map<string, NodeVerdict>,
  ledger: TaintLedger,
  surfaced: SurfacedTarget[],
  licensedByValue: Map<string, string>,
): ProofNode {
  const tool = step.contract.tool;

  // ── RULE 3: POISON. Any dependency that did not cleanly pass poisons this node. Checked first:
  // a poisoned node never runs the gate and never mutates taint/licensing state. ──
  const poisoned = step.dependsOn.some((dep) => verdictById.get(dep) !== 'pass');
  if (poisoned) {
    return { id: step.id, tool, verdict: 'deferred', dependsOn: step.dependsOn };
  }

  // ── RULE 1: COMPOSITION. Build a per-node store = base session grounding + every surfaced
  // structured target from earlier passed steps, admitted as a rank-4 `prior_step` source so the
  // unmodified gate treats it as card-tap-authorized for a destination slot. ──
  const composed = cloneStore(baseStore);
  for (const entry of surfaced) {
    composed.rememberTargets([entry.target], {
      kind: 'transcript_span',
      tool: `prior_step:${entry.stepId}`,
    });
  }

  // ── RULE 2: TAINT. The invariant, checked before the gate: no tainted value reaches a routing
  // sink. Throws the same firewall block (provenance_mismatch/BLOCK) the single-step gate uses. ──
  let verdict: NodeVerdict;
  let receipt: ProofNode['receipt'];
  let block: ProofNode['block'];
  try {
    assertNoTaintedRoutingSink(step.call, step.contract, ledger);
    const gate = runGate(step.call, step.contract, composed);
    if (gate.verdict === 'pass') {
      verdict = 'pass';
      receipt = gate.receipt;
    } else {
      verdict = dispositionFor(gate.code) === 'BLOCK' ? 'block' : 'hold';
      block = { code: gate.code, detail: gate.detail };
    }
  } catch (error) {
    if (!(error instanceof PreflightBlock)) throw error;
    verdict = dispositionFor(error.code) === 'BLOCK' ? 'block' : 'hold';
    block = { code: error.code, detail: error.detail };
  }

  const licensedBy = licensingFor(step, licensedByValue);

  // ── State mutation happens ONLY for a node that passed (an action that would actually fire). ──
  if (verdict === 'pass' && step.output !== undefined) {
    applyOutput(step, ledger, surfaced, licensedByValue);
  }

  const result: ProofNode = { id: step.id, tool, verdict, dependsOn: step.dependsOn };
  if (receipt !== undefined) result.receipt = receipt;
  if (block !== undefined) result.block = block;
  if (licensedBy.length > 0) result.licensedBy = licensedBy;
  return result;
}

/** Record which destination slots were satisfied by a prior step's surfaced structured output. */
function licensingFor(step: PlanStep, licensedByValue: Map<string, string>): LicensedBy[] {
  const out: LicensedBy[] = [];
  for (const [name, spec] of Object.entries(step.contract.params)) {
    if (spec.class !== 'routing' || spec.slot !== 'destination') continue;
    const raw = step.call.args[name];
    if (typeof raw !== 'string') continue;
    const stepId = licensedByValue.get(normalizeValue(raw));
    if (stepId !== undefined) out.push({ stepId, kind: 'prior_step', surfaced: true });
  }
  return out;
}

/**
 * Apply a passed step's output to session state.
 *  - propagate taint along declared derive edges first (derive-from-tainted ⇒ tainted);
 *  - a CONTENT_READ always taints its values;
 *  - a STRUCTURED output licenses its targets IFF it is surfaced AND did not inherit taint.
 */
function applyOutput(
  step: PlanStep,
  ledger: TaintLedger,
  surfaced: SurfacedTarget[],
  licensedByValue: Map<string, string>,
): void {
  const output = step.output!;
  const values = output.values ?? [];
  const inherited =
    output.derivedFrom !== undefined ? ledger.propagate(output.derivedFrom, values) : false;

  if (output.kind === 'content_read') {
    ledger.taint(values);
    return;
  }

  // structured
  if (inherited) {
    ledger.taint(values); // a structured output derived from tainted data is itself tainted — no license
    return;
  }
  if (output.surfaced !== true) return; // unsurfaced structured output can never license routing

  for (const target of output.provides ?? []) {
    surfaced.push({ target, stepId: step.id });
    licensedByValue.set(normalizeValue(target.id), step.id);
    licensedByValue.set(normalizeValue(target.label), step.id);
  }
  for (const value of values) licensedByValue.set(normalizeValue(value), step.id);
}

/** Copy a grounding store, preserving each target's original source kind + tool (and thus rank). */
function cloneStore(base: GroundingStore): GroundingStore {
  const copy = new GroundingStore();
  for (const target of base.pool()) {
    const source = base.sourceOf(target);
    if (source === undefined) continue;
    copy.rememberTargets([target], {
      kind: source.kind,
      ...(source.tool === undefined ? {} : { tool: source.tool }),
    });
  }
  return copy;
}

/** Kahn topological order over dependsOn; unknown deps ignored; any cycle remnant appended last. */
function topoOrder(steps: readonly PlanStep[]): string[] {
  const ids = new Set(steps.map((step) => step.id));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const step of steps) indegree.set(step.id, 0);
  for (const step of steps) {
    for (const dep of step.dependsOn) {
      if (!ids.has(dep)) continue;
      indegree.set(step.id, (indegree.get(step.id) ?? 0) + 1);
      dependents.set(dep, [...(dependents.get(dep) ?? []), step.id]);
    }
  }
  const queue = steps.filter((step) => (indegree.get(step.id) ?? 0) === 0).map((step) => step.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of dependents.get(id) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if ((indegree.get(next) ?? 0) === 0) queue.push(next);
    }
  }
  // Cycle remnants (never reached indegree 0): append in declared order — they will be poisoned.
  for (const step of steps) if (!order.includes(step.id)) order.push(step.id);
  return order;
}

function summarize(nodes: readonly ProofNode[]): ProofTree['summary'] {
  let green = 0;
  let held = 0;
  let blocked = 0;
  let deferred = 0;
  for (const node of nodes) {
    if (node.verdict === 'pass') green += 1;
    else if (node.verdict === 'hold') held += 1;
    else if (node.verdict === 'block') blocked += 1;
    else deferred += 1;
  }
  return { steps: nodes.length, green, held, blocked, deferred };
}
