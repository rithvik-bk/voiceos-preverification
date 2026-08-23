/* ─────────────────────────── the adapter plan-verification API ─────────────────────────────
 *
 * The single-action drop-in (withPreflight) gates ONE call. This module is the multi-step twin:
 * given a whole autonomous PLAN (a DAG of steps the model produced) it returns a ProofTree —
 * every step classified pass / hold / block / deferred BEFORE any step fires. It is a thin,
 * honest translation layer: it builds core's `Plan` + `GroundingStore` from adapter-shaped inputs
 * (per-step args + a per-step or session transcript + the grounded referent pool = `state`) and
 * DELEGATES to `@preflight/core`'s `verifyPlan`. No gate logic, no composition/taint/poison logic
 * is re-implemented here — the trust runtime lives in core; this file only marshals data into it.
 *
 * LANE (hard): PRE-verification only. We verify the plan the model produced; we do NOT run the
 * model or the agent, and we do NOT do post-verification (Arav's). The per-step receipt (see
 * runtime.ts) is the seam to that layer — emitted, never consumed here.
 *
 * WHY per-step transcripts: a plan is many utterances ("find the top lead" then "email it"). Each
 * step carries the utterance it claims to act for; steps that omit one fall back to the session
 * transcript. An empty transcript ⇒ that step runs args-only degraded exactly as the single-step
 * adapter does — the destination-slot rule is stripped so an empty transcript can't false-block.
 */

import {
  finalizeUtterance,
  verifyPlan as coreVerifyPlan,
  type ParamSpec,
  type Plan as CorePlan,
  type PlanStep as CorePlanStep,
  type ProofTree,
  type StepOutput,
  type ToolCall,
  type ToolContract,
} from '../../../core/src/index.ts';

import { buildGroundingStore, type Referent } from './context.ts';

/** A downstream tool a plan step calls — the same {name, tier, params} contract seed as WrappedTool. */
export interface PlanToolSpec {
  name: string;
  tier?: 1 | 2 | 3;
  /** routing/content classification of each param — the ToolContract seed (§20 annotation). */
  params: Record<string, ParamSpec>;
}

/** One node of an adapter plan: a tool call plus the utterance it claims to act for + its output. */
export interface AdapterPlanStep {
  id: string;
  /** the downstream tool + its param annotation. */
  tool: PlanToolSpec;
  /** the proposed arguments the model produced for this step. */
  args: Record<string, unknown>;
  /** the utterance this step acts for; absent ⇒ the session transcript ⇒ (if empty) degraded. */
  transcript?: string;
  utteranceId?: string;
  /** dependency edges (step ids). A step after a non-passing step is POISONED → deferred. */
  dependsOn?: string[];
  /** what this step yields when it executes — the composition / taint unit (core StepOutput). */
  output?: StepOutput;
}

export interface AdapterPlan {
  steps: AdapterPlanStep[];
}

/** The grounding the whole plan is verified against — the session's routing-eligible referent pool. */
export interface PlanState {
  referents?: Referent[];
}

/**
 * Verify a plan. `transcript` is the SESSION fallback utterance (used for any step that does not
 * carry its own); `state.referents` is the grounded pool. Returns core's ProofTree unchanged.
 *
 * Deterministic: no clock, no IO, no LLM — same plan + transcript + state ⇒ byte-identical tree.
 */
export function verifyPlan(plan: AdapterPlan, transcript?: string, state?: PlanState): ProofTree {
  const store = buildGroundingStore({ referents: state?.referents ?? [] });
  return coreVerifyPlan(toCorePlan(plan, transcript), store);
}

/** Translate an adapter plan into core's Plan — per-step ToolCall + ToolContract, deps + output. */
export function toCorePlan(plan: AdapterPlan, sessionTranscript?: string): CorePlan {
  const steps: CorePlanStep[] = plan.steps.map((step) => {
    const text = step.transcript ?? sessionTranscript ?? '';
    const call: ToolCall = {
      tool: step.tool.name,
      args: step.args,
      transcript: finalizeUtterance(step.utteranceId ?? step.id, text),
    };
    const contract: ToolContract = {
      tool: step.tool.name,
      tier: step.tool.tier ?? 3,
      params: step.tool.params,
    };
    return {
      id: step.id,
      call,
      contract,
      dependsOn: step.dependsOn ?? [],
      ...(step.output !== undefined ? { output: step.output } : {}),
    };
  });
  return { steps };
}
