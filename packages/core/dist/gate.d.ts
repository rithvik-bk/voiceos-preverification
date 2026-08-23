import type { GroundingStore } from './grounding.ts';
import { type ParamClass, type Source } from './provenance.ts';
import { type FinalizedTranscript } from './transcript.ts';
/**
 * SPEC-v4 §11.2: a Tier-3 destination / amount / permission slot is not just "routing" — it
 * demands transcript-span licensing. Declaring the slot on a routing param turns on that rule.
 * A routing param with no `slot` (a thread/reply target) keeps the plain rank-3 rule, so a
 * read-content referent (rank 3) is a valid reply target — the split the task calls out.
 */
export type Tier3Slot = 'destination' | 'amount' | 'permission';
export interface ParamSpec {
    class: ParamClass;
    required?: boolean;
    /** routing only: marks a Tier-3 destination/amount/permission slot (S11.2 transcript-span rule). */
    slot?: Tier3Slot;
}
export interface ToolContract {
    tool: string;
    /** Tier per SPEC-v4 §5; the skeleton's only tool is Tier 3 (outbound send). */
    tier: 1 | 2 | 3;
    params: Record<string, ParamSpec>;
}
/**
 * The outbound send of the walking skeleton. `target` is a Tier-3 DESTINATION slot, so S11.2
 * applies: it must carry a transcript span. An address that only ever appeared inside read
 * content is structurally unroutable here (Act 1).
 */
export declare const SEND_MESSAGE: ToolContract;
/**
 * Thread reply — Tier-3, but its `target` is the message/thread being replied to, which is
 * exactly a read-content structural referent (rank 3). No `slot`, so the plain routing rule
 * governs: a rank-3 tool-output referent is a valid reply target even if it was never spoken.
 * This is the other half of S11.2: read-content referents STAY valid for thread/reply.
 */
export declare const THREAD_REPLY: ToolContract;
/**
 * A refund: TWO Tier-3 routing params — a `recipient` (destination slot) AND an `amount` (amount
 * slot). This is the contract that exercises BOTH halves of Jonah's number class: `amount` must
 * be in the spoken number-set (number-twin, `amount_not_in_speech`), AND the two routing params
 * must trace to the SAME transcript clause (misbinding, `misbound_param`). A single-routing-param
 * tool (send_message) can never misbind; it takes two to cross a binding.
 */
export declare const REFUND: ToolContract;
export interface ToolCall {
    tool: string;
    args: Record<string, unknown>;
    /**
     * The finalized utterance this call claims to act for. OPTIONAL: at zero-mod inside VoiceOS the
     * custom-MCP subprocess boundary carries only {name, arguments} (L21045) — transcript-blind. A
     * call with no transcript runs the ARGS-ONLY degraded path (see `preflight`): schema + ambiguity
     * against queryable state only. The injection firewall, number-twin, and misbinding checks all
     * require the transcript and are NOT run without it — the receipt's `mode` + `checksRun` say so.
     */
    transcript?: FinalizedTranscript;
}
export interface ParamReceipt {
    class: ParamClass;
    /** every source that vouches for this value, each with its rank (§17: param → source map). */
    sources: Source[];
    /** routing: the machine id the spoken value resolved to, and via which ladder tier. */
    resolved?: {
        id: string;
        label: string;
        via: 'id' | 'exact' | 'normalized' | 'substring';
    };
    /** content: never rank-gated; surfaced for consent in the composer instead (§2). */
    disposition: 'rank_gated' | 'consent_surfaced';
}
/**
 * Which checks actually ran (SOLUTION.md collapse-risk #1 — never claim the firewall ran without
 * the transcript). In `transcript_present` mode all are true; in `args_only` mode the three
 * transcript-dependent checks are false, and this object is the honest, machine-readable proof.
 */
export interface ChecksRun {
    /** required-field / malformed-call structural check (always). */
    schema: boolean;
    /** resolution + cardinality + min-rank against queryable state (always). */
    ambiguity: boolean;
    /** S11.2 destination-slot firewall: routing needs a transcript span (transcript only). */
    injectionFirewall: boolean;
    /** amount ∈ spoken number-set (transcript only). */
    numberTwin: boolean;
    /** routing params trace to one clause (transcript only). */
    misbinding: boolean;
}
export type GateMode = 'transcript_present' | 'args_only';
export interface Receipt {
    tool: string;
    utterance_id: string;
    /** which path ran — full grounding vs. args-only degraded (zero-mod). */
    mode: GateMode;
    /** the honest ledger of which checks this verdict is backed by. */
    checksRun: ChecksRun;
    params: Record<string, ParamReceipt>;
}
export type Verdict = {
    verdict: 'pass';
    receipt: Receipt;
} | {
    verdict: 'block';
    code: string;
    detail: Record<string, unknown>;
};
/**
 * Run the gate; throws PreflightBlock on refusal, returns the receipt on pass.
 * Pure compute: no I/O, no clock, no network, no model.
 */
export declare function preflight(call: ToolCall, contract: ToolContract, store: GroundingStore): Receipt;
/** Catch-wrapper form: PreflightBlock → a data verdict. Anything else is a real bug and rethrows. */
export declare function runGate(call: ToolCall, contract: ToolContract, store: GroundingStore): Verdict;
//# sourceMappingURL=gate.d.ts.map