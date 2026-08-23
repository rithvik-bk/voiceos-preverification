export type EntityKind = 'channel' | 'group' | 'person';
export interface Target {
    id: string;
    label: string;
    kind: EntityKind;
    aliases?: string[];
}
export declare function normalizeLoose(value: string): string;
export declare function normalizeTight(value: string): string;
/** Levenshtein, bounded — used ONLY to order suggestions, never to auto-pick a target. */
export declare function editDistance(a: string, b: string): number;
export interface Resolution {
    match?: Target;
    candidates: Target[];
    /** `match` = one answer · `ambiguous` = several real ones · `not_found` = none, candidates are near names. */
    reason: 'match' | 'ambiguous' | 'not_found';
}
export interface CandidateSummary {
    name: string;
    kind: EntityKind;
    id?: string;
}
export declare function candidateSummary(target: Target): CandidateSummary;
/**
 * Spoken name → exactly one target out of a prebuilt pool, or a disambiguation list.
 * Tiered and strictly ordered (source repo DESIGN-SPEC §2 / RESOLVER-DESIGN §4):
 * known-id passthrough → exact → normalized → substring → nearest-names miss.
 * A tier with 2+ matches is an ambiguity, never a coin flip.
 */
export declare function resolveTarget(spoken: string, pool: Target[]): Resolution;
//# sourceMappingURL=resolve.d.ts.map