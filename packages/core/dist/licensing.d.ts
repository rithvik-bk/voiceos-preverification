import { type Target } from './resolve.ts';
import type { FinalizedTranscript, TranscriptSpan } from './transcript.ts';
export interface DescriptorLicense {
    /** the transcript spans that make up the licensing descriptor (cited in the receipt). */
    spans: TranscriptSpan[];
    /** the spoken descriptor text those spans carry. */
    descriptor: string;
}
/**
 * S11.2 arm (b): does a SPOKEN descriptor in `transcript` resolve, via the RRP over `pool`,
 * UNIQUELY to `target` — the referent the model's emitted value already resolved to? If so the
 * license flows from that spoken descriptor to the emitted id; return the descriptor's spans so
 * the receipt cites the real span that licensed the slot. If not, return null (block stands).
 *
 * Candidate descriptors are contiguous runs of transcript spans (the skeleton has no parsed
 * descriptor boundary), tried shortest-first so the tightest licensing span is cited. A run
 * licenses only when it resolves to a single target whose id is exactly `target.id` — an
 * ambiguous or missed run licenses nothing (never a coin flip; S10.3 c/e).
 */
export declare function licensingDescriptor(transcript: FinalizedTranscript, pool: readonly Target[], target: Target): DescriptorLicense | null;
//# sourceMappingURL=licensing.d.ts.map