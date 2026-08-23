import { type Source } from './provenance.ts';
export interface TranscriptSpan {
    /** Stable id: `${utterance_id}.w${index}`. §6's revision machinery will version these. */
    span_id: string;
    text: string;
}
export interface FinalizedTranscript {
    utterance_id: string;
    text: string;
    spans: TranscriptSpan[];
    /** The skeleton only ever sees finalized transcripts. */
    final: true;
}
/** The static-fixture constructor: one utterance string → word spans with stable ids. */
export declare function finalizeUtterance(utteranceId: string, text: string): FinalizedTranscript;
/**
 * Attribute an argument value to the transcript: find the shortest run of spans whose
 * tight-normalized concatenation equals the tight-normalized value ("#eng-backend" matches
 * the spoken "eng backend"). Returns the covering spans, or null when the transcript never
 * said it — in which case the value has NO rank-4 source and the receipt says so honestly.
 *
 * HONESTY NOTE (RECON §2.1): on the real platform the transcript reaches us model-filled
 * (`said` pattern), so attribution proves consistency with the *claimed* transcript, not with
 * the audio. Platform-authoritative transcripts are the adoption ask (§22), not a skeleton claim.
 */
export declare function attributeToTranscript(transcript: FinalizedTranscript, value: string): TranscriptSpan[] | null;
/** The rank-4 receipt source for an attributed value: span references + hash, never raw text (§17). */
export declare function transcriptSource(spans: readonly TranscriptSpan[], value: string): Source;
//# sourceMappingURL=transcript.d.ts.map