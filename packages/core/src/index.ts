/* @preflight/core — the gate core. Zero runtime deps, zero LLM, zero network (enforced by
 * test/enforcement.test.ts). Everything here is pure compute over plain data. */

export { PreflightBlock, requiredText } from './block.ts';
export {
  RANK,
  MIN_RANK,
  minRankFor,
  bestRank,
  textHash,
  type Source,
  type SourceKind,
  type ProvenanceRank,
  type ParamClass,
} from './provenance.ts';
export {
  finalizeUtterance,
  attributeToTranscript,
  transcriptSource,
  type FinalizedTranscript,
  type TranscriptSpan,
} from './transcript.ts';
export {
  GroundingStore,
  type GroundedMessage,
  type GroundedTargetEntry,
  type TargetOrigin,
} from './grounding.ts';
export { licensingDescriptor, type DescriptorLicense } from './licensing.ts';
export {
  resolveTarget,
  candidateSummary,
  normalizeLoose,
  normalizeTight,
  editDistance,
  type Target,
  type EntityKind,
  type Resolution,
  type CandidateSummary,
} from './resolve.ts';
export {
  preflight,
  runGate,
  SEND_MESSAGE,
  THREAD_REPLY,
  REFUND,
  type ToolContract,
  type ToolCall,
  type ParamSpec,
  type Tier3Slot,
  type Receipt,
  type ParamReceipt,
  type Verdict,
  type GateMode,
  type ChecksRun,
} from './gate.ts';
export { shadowGate, ShadowLog, type ShadowRecord, type ShadowOutcome } from './shadow.ts';
export {
  REASON_CODES,
  dispositionFor,
  pfNameFor,
  isFirewallBlock,
  type Disposition,
  type ReasonCode,
} from './codes.ts';
export {
  assertCoClausal,
  clauseIndexByWord,
  parseWordIndices,
  type RoutingSpanRef,
} from './misbinding.ts';
export {
  emitReceipt,
  type PreflightReceipt,
  type ReceiptRoutingParam,
  type ReceiptContentParam,
  type ReceiptMeta,
} from './receipt.ts';

/* ── the trust runtime: multi-step plan verification (proof-tree + taint firewall + autonomy) ── */
export {
  type Plan,
  type PlanStep,
  type StepOutput,
  type StepOutputKind,
  type ProofTree,
  type ProofNode,
  type NodeVerdict,
  type LicensedBy,
} from './plan.ts';
export { verifyPlan, type VerifyOpts } from './compose.ts';
export {
  TaintLedger,
  normalizeValue,
  taintedRoutingSink,
  assertNoTaintedRoutingSink,
  type TaintViolation,
} from './taint.ts';
export {
  AUTONOMY_POLICY,
  AUTONOMY_META,
  actionFor,
  metaFor,
  type AutonomyLevel,
  type AutonomyAction,
  type AutonomyMeta,
} from './autonomy.ts';
