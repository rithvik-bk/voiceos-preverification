/* ─────────────────────────────── the PreflightReceipt emitter (the seam) ─────────────────────
 *
 * SOLUTION.md §"HOW IT SLOTS IN": the ONE object that crosses every boundary — the smart card
 * renders it, the enterprise audit trail stores it (immutable, which the app's own db cannot do:
 * input_json is 134/134 NULL, L26838), and ARAV'S POST-VERIFIER consumes it. This module builds
 * exactly that object and NOTHING else. Post-verification logic is not ours (KICKOFF lane) — we
 * define only the seam.
 *
 * It is a PURE FUNCTION of the gate result. It reads no clock (firedAt is passed in — the
 * determinism rule of SOLUTION.md §TESTING HARNESS: "no Date.now in any library path"), does no
 * I/O, and makes no decision the gate did not already make. Same inputs ⇒ byte-identical receipt.
 */
import { dispositionFor } from "./codes.js";
/** On a block, the source kind the gate named as the OFFENDING one for `param`, if any. */
function offendingSource(param, verdict) {
    if (verdict.verdict !== 'block')
        return undefined;
    if (verdict.detail['param'] !== param)
        return undefined;
    const found = verdict.detail['found'];
    return typeof found === 'string' ? found : undefined;
}
/**
 * Build the PreflightReceipt from a gate Verdict. Pure: derives every field from the call, the
 * contract, and the verdict — never re-runs the gate, never adds a check.
 */
export function emitReceipt(call, contract, verdict, meta) {
    const receipt = verdict.verdict === 'pass' ? verdict.receipt : undefined;
    const routingParams = [];
    const contentParams = [];
    for (const [name, spec] of Object.entries(contract.params)) {
        const raw = call.args[name];
        if (spec.class === 'content') {
            contentParams.push({ name, consentSurfaced: raw !== undefined });
            continue;
        }
        if (raw === undefined)
            continue;
        const param = receipt?.params[name];
        // Prefer the transcript span (the audit-grade "your words" proof); else the best cited source.
        const licensing = param?.sources.find((source) => source.kind === 'transcript_span') ?? param?.sources[0];
        const entry = {
            name,
            value: String(raw),
            source: licensing?.kind ?? offendingSource(name, verdict) ?? 'model_composed',
        };
        if (licensing?.span_id !== undefined)
            entry.transcriptSpan = licensing.span_id;
        routingParams.push(entry);
    }
    return {
        interactionId: meta.interactionId,
        voiceSessionId: meta.voiceSessionId,
        serverId: meta.serverId,
        toolName: call.tool,
        args: call.args,
        verdict: verdict.verdict === 'pass' ? 'PASS' : dispositionFor(verdict.code),
        code: verdict.verdict === 'pass' ? '' : verdict.code,
        routingParams,
        contentParams,
        transcriptSnapshot: call.transcript?.text ?? '',
        firedAt: meta.firedAt,
    };
}
//# sourceMappingURL=receipt.js.map