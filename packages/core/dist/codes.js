/* ───────────────────────────────── the reason-code registry ────────────────────────────────
 *
 * THE HONEST SCOPE, IN CODE (SOLUTION.md §"THE HONEST SCOPE" + §"THE FLAGSHIP CHECKS").
 *
 * This is the single, authoritative list of every reason code the gate can emit, its canonical
 * PF_* name (the vocabulary SOLUTION.md speaks), its DISPOSITION, and whether it is a routing-
 * provenance failure. `report.ts` in the eval package counts by the wire `code`; the smart-card
 * repair ladder keys off the DISPOSITION; Arav's post-verifier reads the PF_* name off the
 * PreflightReceipt. One table, three readers — the interop point of SOLUTION.md §MOAT.
 *
 * Wire codes stay lowercase_snake (ported from the v3 gate; the existing corpus + tests lock
 * them). The PF_* name is the canonical alias. Do NOT rename a wire code — add a row instead.
 *
 * DISPOSITION vocabulary (SOLUTION.md §FLAGSHIP CHECKS):
 *   PASS    — proof complete, the action fires untouched (no code; the absence of a block).
 *   HOLD    — proof incomplete; one spoken question completes it (ask, then re-check).
 *   BLOCK   — injection only: a routing target sourced from screen/content, never speakable.
 *   SURFACE — fires, discrepancy shown (content params: consent-surfaced, never hard-blocked).
 *
 * ── STRUCTURALLY OUT OF SCOPE (state this before an adversary finds it) ──────────────────────
 * ASR-MISHEAR is NOT catchable here and never claimed. If the ear writes "54.99" when the user
 * said "54.79", the transcript itself is wrong; provenance faithfully grounds the WRONG words.
 * Preflight grounds what was transcribed — it does not second-guess transcription. That class is
 * a read-back-confirmation problem, a different layer (SOLUTION.md §HONEST SCOPE, collapse-risk
 * #2). There is deliberately NO reason code for it: inventing one would be a fabricated catch.
 *
 * WRONG-TOOL is caught only INDIRECTLY (SOLUTION.md check #6): a wrong tool usually needs a
 * routing param the user never spoke → held by `target_not_found`. The residual tool-swap where
 * every param happens to ground is NOT a provenance question → it is Arav's post-verifier, not
 * ours. No deterministic wrong-tool detector is claimed and none is registered here.
 */
/**
 * Every reason code, keyed by wire code. The injection firewall (`provenance_mismatch`) and the
 * min-rank firewall (`insufficient_provenance`) are the two BLOCK codes — the only dispositions
 * that are NOT "ask a question": a routing target sourced from screen/content can never be
 * completed by speaking, so there is nothing to ask (SOLUTION.md check #1).
 */
export const REASON_CODES = {
    provenance_mismatch: {
        code: 'provenance_mismatch',
        pf: 'PF_INJECTION_ROUTING_FROM_CONTENT',
        disposition: 'BLOCK',
        routing: true,
        summary: 'a Tier-3 destination/amount/permission slot resolved to a referent that carries NO ' +
            'transcript span — its only provenance is read content (the injection firewall).',
    },
    insufficient_provenance: {
        code: 'insufficient_provenance',
        pf: 'PF_ROUTING_RANK_TOO_LOW',
        disposition: 'BLOCK',
        routing: true,
        summary: 'a routing param resolved, but its grounding source ranks below the routing minimum ' +
            '(screen rank-1 / model rank-0 can NEVER license routing — the other face of the firewall).',
    },
    amount_not_in_speech: {
        code: 'amount_not_in_speech',
        pf: 'PF_AMOUNT_NOT_IN_SPEECH',
        disposition: 'HOLD',
        routing: true,
        summary: 'the filled amount is not in the spoken number-set (number-twin / magnitude); ' +
            'e.g. 54.99 ∉ {54.79}. Hard inequality — no tolerance to slip under. Money ⇒ smart card.',
    },
    misbound_param: {
        code: 'misbound_param',
        pf: 'PF_MISBOUND_PARAM',
        disposition: 'HOLD',
        routing: true,
        summary: 'each routing param was spoken, but they trace to DIFFERENT transcript clauses — the ' +
            'pairing is wrong ("refund Dan $50 and Sarah $30" → refund(Dan,$30)). The second half ' +
            'of the number class: check #3 passes (both numbers present) but the binding is crossed.',
    },
    ambiguous_target: {
        code: 'ambiguous_target',
        pf: 'PF_AMBIGUOUS_TARGET',
        disposition: 'HOLD',
        routing: true,
        summary: 'two or more real targets match the spoken descriptor (|candidates| ≥ 2); selection ' +
            'needs cardinality 1. (v1 over-asks; context-disambiguation is Tier 2, unbuilt.)',
    },
    target_not_found: {
        code: 'target_not_found',
        pf: 'PF_UNGROUNDED_ROUTING_PARAM',
        disposition: 'HOLD',
        routing: true,
        summary: 'a routing param resolved to no grounded referent (hallucinated / misheard target). ' +
            'Also the INDIRECT wrong-tool catch: a wrong tool usually needs a param never spoken.',
    },
    missing_parameter: {
        code: 'missing_parameter',
        pf: 'PF_MISSING_PARAMETER',
        disposition: 'HOLD',
        routing: false,
        summary: 'a required field is missing or blank (structural malformed-call check, §1).',
    },
};
/** The disposition for a wire code, or a safe default (HOLD) for any unregistered code. */
export function dispositionFor(code) {
    return REASON_CODES[code]?.disposition ?? 'HOLD';
}
/** The canonical PF_* alias for a wire code, or the wire code itself if unregistered. */
export function pfNameFor(code) {
    return REASON_CODES[code]?.pf ?? code;
}
/** True iff this code is a hard BLOCK (the injection / min-rank firewall) rather than a HOLD. */
export function isFirewallBlock(code) {
    return dispositionFor(code) === 'BLOCK';
}
//# sourceMappingURL=codes.js.map