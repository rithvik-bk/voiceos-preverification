/* ─────────────────────────────────────── shadow mode ──────────────────────────────────────
 *
 * SPEC-v4 §19: rollout is staged — `shadow` (observe and log what would have been blocked,
 * change NOTHING), then `warn`, then `enforce`. Shadow mode is the entire reason this can
 * ship with zero product risk. Phase 2 builds ONLY shadow.
 *
 * The contract of `shadowGate`: it NEVER throws, it NEVER stops the call. It runs the real
 * gate, writes one ShadowRecord, and hands back the verdict as data. The host proceeds with
 * the call exactly as if the gate did not exist. Nothing here is enforcement.
 */
import { runGate } from "./gate.js";
export class ShadowLog {
    records = [];
    seq = 0;
    now;
    constructor(opts = {}) {
        this.now = opts.now ?? Date.now;
    }
    append(record) {
        this.seq += 1;
        const full = { mode: 'shadow', seq: this.seq, at: this.now(), ...record };
        this.records.push(full);
        return full;
    }
    /** JSONL, one record per line — what the demo tails and what a founder is shown. */
    toJsonl() {
        return this.records.map((record) => JSON.stringify(record)).join('\n');
    }
}
export function shadowGate(call, contract, store, log) {
    const verdict = runGate(call, contract, store);
    if (verdict.verdict === 'pass') {
        const record = log.append({
            tool: call.tool,
            utterance_id: call.transcript?.utterance_id ?? '',
            decision: 'would_have_passed',
            receipt: verdict.receipt,
        });
        return { enforced: false, decision: 'would_have_passed', record };
    }
    const record = log.append({
        tool: call.tool,
        utterance_id: call.transcript.utterance_id,
        decision: 'would_have_blocked',
        code: verdict.code,
        detail: verdict.detail,
    });
    return { enforced: false, decision: 'would_have_blocked', record };
}
//# sourceMappingURL=shadow.js.map