import { type Disposition } from './codes.ts';
import type { ToolCall, ToolContract, Verdict } from './gate.ts';
import type { SourceKind } from './provenance.ts';
/** A routing param as the receipt carries it: value + the source that licensed it (+ span). */
export interface ReceiptRoutingParam {
    name: string;
    value: string;
    /** the licensing source kind (transcript_span when spoken; the offending source on a block). */
    source: SourceKind;
    /** present iff a transcript span licensed it — the audit-grade proof of "your words". */
    transcriptSpan?: string;
}
/** A content param as the receipt carries it: never routing-gated, only consent-surfaced (§2). */
export interface ReceiptContentParam {
    name: string;
    consentSurfaced: boolean;
}
/**
 * The receipt object, field-for-field from SOLUTION.md §"HOW IT SLOTS IN". `verdict` carries the
 * DISPOSITION (PASS / HOLD / BLOCK / SURFACE); the reason `code` is co-located for the audit log.
 */
export interface PreflightReceipt {
    interactionId: string;
    voiceSessionId: string;
    serverId: string;
    toolName: string;
    args: Record<string, unknown>;
    verdict: Disposition;
    /** the wire reason code on a non-pass ('' on pass) — the eval-count / audit unit. */
    code: string;
    routingParams: ReceiptRoutingParam[];
    contentParams: ReceiptContentParam[];
    transcriptSnapshot: string;
    firedAt: number;
}
/** The identity + timing the host stamps on the receipt. `firedAt` is the host's clock, not ours. */
export interface ReceiptMeta {
    interactionId: string;
    voiceSessionId: string;
    serverId: string;
    firedAt: number;
}
/**
 * Build the PreflightReceipt from a gate Verdict. Pure: derives every field from the call, the
 * contract, and the verdict — never re-runs the gate, never adds a check.
 */
export declare function emitReceipt(call: ToolCall, contract: ToolContract, verdict: Verdict, meta: ReceiptMeta): PreflightReceipt;
//# sourceMappingURL=receipt.d.ts.map