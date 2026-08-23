/* @preflight/adapter-voiceos — the production drop-in.
 *
 * A local stdio MCP server that wraps a downstream tool with the @preflight/core gate (the
 * withPreflight pattern). OBSERVE (shadow) by default; ENFORCE opt-in. Emits a PreflightReceipt
 * per call — the seam to Arav's post-verifier. Full injection/span checks need the transcript
 * seam; without it, the adapter runs an honestly-labeled args-only degraded mode.
 */

export { createPreflightServer, type PreflightServerConfig } from './server.ts';
export {
  makeRunCall,
  PREFLIGHT_ARG_KEY,
  type WrappedTool,
  type WrapOptions,
  type CallResult,
} from './withPreflight.ts';
export {
  buildGroundingStore,
  buildTranscript,
  hasTranscript,
  rankOfOrigin,
  type PreflightContext,
  type Referent,
  type ReferentOrigin,
} from './context.ts';
export {
  refusalFrom,
  type Disposition,
  type Discrepancy,
  type Refusal,
} from './repair.ts';
export {
  paramsFromReceipt,
  type PreflightReceipt,
  type RoutingParamReceipt,
  type ContentParamReceipt,
} from './receipt.ts';
export {
  verifyPlan,
  toCorePlan,
  type AdapterPlan,
  type AdapterPlanStep,
  type PlanToolSpec,
  type PlanState,
} from './plan.ts';
export {
  runPlan,
  type PlanRunOptions,
  type PlanRunResult,
  type PlanStepDecision,
  type PlanStepReceipt,
} from './runtime.ts';
