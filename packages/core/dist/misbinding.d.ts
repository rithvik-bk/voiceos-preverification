import type { FinalizedTranscript } from './transcript.ts';
/**
 * Word index → clause index. A connective token belongs to NO clause (marked -1) and opens the
 * next; a token whose raw text ends in `,` or `;` closes its clause after itself.
 */
export declare function clauseIndexByWord(transcript: FinalizedTranscript): number[];
/** A routing param and the transcript word indices its licensing span covered. */
export interface RoutingSpanRef {
    param: string;
    wordIndices: number[];
}
/** Parse the covered word indices out of a receipt span id ("u1.w5+u1.w6" → [5, 6]). */
export declare function parseWordIndices(spanId: string): number[];
/**
 * The check. Throws `misbound_param` (HOLD) when two-or-more span-licensed routing params share
 * NO common clause. Fewer than two participating params ⇒ nothing to bind ⇒ returns silently.
 */
export declare function assertCoClausal(transcript: FinalizedTranscript, routing: readonly RoutingSpanRef[]): void;
//# sourceMappingURL=misbinding.d.ts.map