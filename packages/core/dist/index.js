/* @preflight/core — the gate core. Zero runtime deps, zero LLM, zero network (enforced by
 * test/enforcement.test.ts). Everything here is pure compute over plain data. */
export { PreflightBlock, requiredText } from "./block.js";
export { RANK, MIN_RANK, minRankFor, bestRank, textHash, } from "./provenance.js";
export { finalizeUtterance, attributeToTranscript, transcriptSource, } from "./transcript.js";
export { GroundingStore, } from "./grounding.js";
export { licensingDescriptor } from "./licensing.js";
export { resolveTarget, candidateSummary, normalizeLoose, normalizeTight, editDistance, } from "./resolve.js";
export { preflight, runGate, SEND_MESSAGE, THREAD_REPLY, REFUND, } from "./gate.js";
export { shadowGate, ShadowLog } from "./shadow.js";
export { REASON_CODES, dispositionFor, pfNameFor, isFirewallBlock, } from "./codes.js";
export { assertCoClausal, clauseIndexByWord, parseWordIndices, } from "./misbinding.js";
export { emitReceipt, } from "./receipt.js";
//# sourceMappingURL=index.js.map