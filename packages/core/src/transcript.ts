/* ─────────────────────────────── the finalized transcript ─────────────────────────────────
 *
 * Phase-2 skeleton: a STATIC FIXTURE — one finalized utterance, already stabilized, no
 * streaming, no revisions. SPEC-v4 §6 (stable token ids, versioning, the stability horizon)
 * is deliberately NOT here; the span ids below are the anchor that §6 will later version.
 * What the skeleton needs from a transcript is exactly two things: (1) stable span ids that
 * receipts can cite as rank-4 sources, and (2) an attribution check — "did the user actually
 * say the words this argument claims" — over normalized text.
 */

import { textHash, type Source } from './provenance.ts';

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
export function finalizeUtterance(utteranceId: string, text: string): FinalizedTranscript {
  const words = text.split(/\s+/).filter((word) => word !== '');
  return {
    utterance_id: utteranceId,
    text,
    final: true,
    spans: words.map((word, index) => ({ span_id: `${utteranceId}.w${index}`, text: word })),
  };
}

/** Same normalization family as resolve.ts's `normalizeTight`: match on letters+digits only. */
function tight(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

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
export function attributeToTranscript(
  transcript: FinalizedTranscript,
  value: string,
): TranscriptSpan[] | null {
  const wanted = tight(value);
  if (wanted === '') return null;
  const spans = transcript.spans;
  for (let start = 0; start < spans.length; start += 1) {
    let joined = '';
    for (let end = start; end < spans.length; end += 1) {
      joined += tight(spans[end]!.text);
      if (joined === wanted) return spans.slice(start, end + 1);
      if (joined.length > wanted.length) break;
    }
  }
  return null;
}

/** The rank-4 receipt source for an attributed value: span references + hash, never raw text (§17). */
export function transcriptSource(spans: readonly TranscriptSpan[], value: string): Source {
  return {
    kind: 'transcript_span',
    rank: 4,
    span_id: spans.map((span) => span.span_id).join('+'),
    text_hash: textHash(value),
  };
}
