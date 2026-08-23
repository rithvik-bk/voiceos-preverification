export type SourceKind = 'transcript_span' | 'tool_output' | 'known_state' | 'screen' | 'model_composed';
export type ProvenanceRank = 0 | 1 | 2 | 3 | 4;
export declare const RANK: Record<SourceKind, ProvenanceRank>;
/** One provenance citation, exactly as it appears in a receipt (§17). */
export interface Source {
    kind: SourceKind;
    rank: ProvenanceRank;
    /** transcript_span: the stable span id. */
    span_id?: string;
    /** tool_output / known_state: which read produced it. */
    tool?: string;
    /** the grounded machine id this source vouches for (a channel id, a user id). */
    id?: string;
    /** human label, card-safe (never a raw id). */
    label?: string;
    /** salted-hash stand-in for raw text (§17: span references + hashes by default, raw text opt-in). */
    text_hash?: string;
}
/**
 * SPEC-v4 §2: routing parameters (who/where/when/how much) select targets — provenance-gated.
 * Content parameters (what to say) are the model's legitimate job — never provenance-blocked,
 * consent-surfaced in the composer instead.
 */
export type ParamClass = 'routing' | 'content';
/** Minimum provenance rank per parameter class (§1: Tier-3 routing requires rank ≥ 3). */
export declare const MIN_RANK: Record<ParamClass, ProvenanceRank>;
export declare function minRankFor(paramClass: ParamClass): ProvenanceRank;
/** Highest rank among a value's cited sources — the rank the lattice rule judges. */
export declare function bestRank(sources: readonly Source[]): ProvenanceRank;
export declare function textHash(text: string): string;
//# sourceMappingURL=provenance.d.ts.map