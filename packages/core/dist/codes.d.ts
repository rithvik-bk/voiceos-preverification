export type Disposition = 'PASS' | 'HOLD' | 'BLOCK' | 'SURFACE';
export interface ReasonCode {
    /** the machine string emitted in PreflightBlock.code / Verdict.code — the eval-count unit. */
    code: string;
    /** canonical PF_* alias (SOLUTION.md vocabulary); what the PreflightReceipt / audit trail carries. */
    pf: string;
    disposition: Disposition;
    /** true iff this is a routing-provenance failure (vs. a structural / schema failure). */
    routing: boolean;
    summary: string;
}
/**
 * Every reason code, keyed by wire code. The injection firewall (`provenance_mismatch`) and the
 * min-rank firewall (`insufficient_provenance`) are the two BLOCK codes — the only dispositions
 * that are NOT "ask a question": a routing target sourced from screen/content can never be
 * completed by speaking, so there is nothing to ask (SOLUTION.md check #1).
 */
export declare const REASON_CODES: Record<string, ReasonCode>;
/** The disposition for a wire code, or a safe default (HOLD) for any unregistered code. */
export declare function dispositionFor(code: string): Disposition;
/** The canonical PF_* alias for a wire code, or the wire code itself if unregistered. */
export declare function pfNameFor(code: string): string;
/** True iff this code is a hard BLOCK (the injection / min-rank firewall) rather than a HOLD. */
export declare function isFirewallBlock(code: string): boolean;
//# sourceMappingURL=codes.d.ts.map