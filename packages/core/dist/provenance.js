/* ─────────────────────────────────── the provenance lattice ───────────────────────────────
 *
 * SPEC-v4 §1: every value in an outgoing call resolves to one of four typed, ranked sources.
 * The rule is a lattice, not a checklist: each parameter class declares a minimum provenance
 * rank, and a call that cannot name its sources is a TYPE ERROR, not a heuristic miss.
 *
 * New in the port (not in the v3 Slack gate, which enforced this discipline per-handler):
 * the ranks are reified as data so the gate can check `rank >= minRankFor(class)` generically
 * and so receipts (§17) can name the rank of every source they cite.
 */
export const RANK = {
    transcript_span: 4,
    tool_output: 3,
    known_state: 2,
    screen: 1,
    model_composed: 0,
};
/** Minimum provenance rank per parameter class (§1: Tier-3 routing requires rank ≥ 3). */
export const MIN_RANK = {
    routing: 3,
    content: 0, // pass-through: consent-surfaced, not rank-gated
};
export function minRankFor(paramClass) {
    return MIN_RANK[paramClass];
}
/** Highest rank among a value's cited sources — the rank the lattice rule judges. */
export function bestRank(sources) {
    let best = 0;
    for (const source of sources)
        if (source.rank > best)
            best = source.rank;
    return best;
}
/* ──────────────────────────────────────── hashing ─────────────────────────────────────────
 * FNV-1a 32-bit, inline so the core needs no imports at all (not even node:crypto). This is a
 * privacy default for receipts, not a security boundary; the enterprise story (§17) is real
 * signing, and that is a later phase.
 */
export function textHash(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}
//# sourceMappingURL=provenance.js.map