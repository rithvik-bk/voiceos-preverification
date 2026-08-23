/* ─────────────────────── transcript-span licensing via the RRP (S10.3 / S11.2) ───────────────
 *
 * S11.2 licenses a Tier-3 destination / amount / permission value THREE ways:
 *   (a) it was literally spoken            → attributeToTranscript(value) in transcript.ts;
 *   (b) a SPOKEN descriptor resolved to it → this module (the Referent Resolution Procedure);
 *   (c) the user tapped it on a card       → not modeled in the skeleton (no card input path).
 *
 * The bug this fixes (eval-notes.md gap #1): a model that SPEAKS "dan" and EMITS the resolved
 * machine id `U_DAN` — the normal thing a model does — carried no literal transcript span for
 * "U_DAN", so arm (a) failed and the send false-blocked with `provenance_mismatch`. Arm (b) is
 * the specified cure: the license flows from the spoken descriptor to the id it resolves to.
 *
 * THE INJECTION BLOCK STILL HOLDS, by construction. This procedure only ever consults spans of
 * the ACTUAL transcript as descriptors; a value that appears only inside READ CONTENT has no
 * spoken descriptor that resolves to it, so it is never licensed here. A read-content address
 * that rode into the routing pool at rank 3 (the worst case S11.1 allows) still fails S11.2
 * unless the user genuinely spoke a descriptor that the RRP resolves to it — which is exactly
 * the spec's rule (§11.2) and exactly what makes the firewall a type check, not a classifier.
 *
 * S10.3 fidelity + scope: this implements the non-deictic branch of the RRP (steps a/b/d for a
 * unique resolution). It resolves a descriptor UNIQUELY to the emitted target or licenses
 * nothing — it never silently binds an ambiguous or fuzzy-stage descriptor (S10.3 c/e), and it
 * introduces no screen ordering or recency (SPECIFIED-ONLY in the skeleton). Bare deictics
 * ("that", "it"), which S10.3 resolves via screen ordering / recency, are out of the skeleton's
 * scope and license nothing here.
 */

import { resolveTarget, type Target } from './resolve.ts';
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
export function licensingDescriptor(
  transcript: FinalizedTranscript,
  pool: readonly Target[],
  target: Target,
): DescriptorLicense | null {
  const spans = transcript.spans;
  for (let length = 1; length <= spans.length; length += 1) {
    for (let start = 0; start + length <= spans.length; start += 1) {
      const run = spans.slice(start, start + length);
      const descriptor = run.map((span) => span.text).join(' ');
      const resolution = resolveTarget(descriptor, pool as Target[]);
      if (resolution.reason === 'match' && resolution.match !== undefined && resolution.match.id === target.id) {
        return { spans: run, descriptor };
      }
    }
  }
  return null;
}
