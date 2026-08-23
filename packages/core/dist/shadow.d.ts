import type { GroundingStore } from './grounding.ts';
import { type Receipt, type ToolCall, type ToolContract } from './gate.ts';
export interface ShadowRecord {
    mode: 'shadow';
    seq: number;
    /** ms epoch from the injected clock (test seam, ported idea: tools-t2.ts `useClock`). */
    at: number;
    tool: string;
    utterance_id: string;
    decision: 'would_have_blocked' | 'would_have_passed';
    /** present iff would_have_blocked: the machine code + evidence a founder reads in the log. */
    code?: string;
    detail?: Record<string, unknown>;
    /** present iff would_have_passed: the full provenance receipt (§17). */
    receipt?: Receipt;
}
export interface ShadowOutcome {
    /** Always false in shadow mode — the record IS the output; the call is untouched. */
    enforced: false;
    decision: 'would_have_blocked' | 'would_have_passed';
    record: ShadowRecord;
}
export declare class ShadowLog {
    readonly records: ShadowRecord[];
    private seq;
    private readonly now;
    constructor(opts?: {
        now?: () => number;
    });
    append(record: Omit<ShadowRecord, 'mode' | 'seq' | 'at'>): ShadowRecord;
    /** JSONL, one record per line — what the demo tails and what a founder is shown. */
    toJsonl(): string;
}
export declare function shadowGate(call: ToolCall, contract: ToolContract, store: GroundingStore, log: ShadowLog): ShadowOutcome;
//# sourceMappingURL=shadow.d.ts.map