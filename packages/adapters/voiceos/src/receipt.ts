/* ─────────────────────────────── the PreflightReceipt seam ─────────────────────────────────
 *
 * SOLUTION.md "HOW IT SLOTS IN": the seam to Arav's post-verifier is a PreflightReceipt keyed on
 * the executionId VoiceOS already round-trips. We build the receipt; we build NONE of
 * post-verification. Shape (verbatim from the spec, plus the two honesty labels that make the
 * receipt auditable):
 *   { interactionId, serverId, toolName, args, verdict, routingParams[{name,value,source,
 *     transcriptSpan?}], contentParams, transcriptSnapshot, firedAt }
 *   + mode (observe|enforce) · transcriptMode (full|args_only_degraded) ·
 *     injectionFirewall (active|unavailable_no_transcript) — so a reader can never mistake a
 *     degraded run for a full one.
 *
 * The receipt is data only. `firedAt` comes from an INJECTED clock (test seam, ported from
 * core's ShadowLog `now`) so the self-test is byte-deterministic.
 */

import type { Receipt } from '../../../core/src/index.ts';
import type { Disposition, Discrepancy } from './repair.ts';

export interface RoutingParamReceipt {
  name: string;
  value: string;
  /** the highest-rank source kind that vouched for the value. */
  source: string;
  sourceRank: number;
  /** present iff the value (or its resolving descriptor) was licensed by a transcript span. */
  transcriptSpan?: string;
  resolvedId?: string;
  resolvedLabel?: string;
}

export interface ContentParamReceipt {
  name: string;
  value: string;
  source: string;
  sourceRank: number;
  /** true when the content was model-composed (not spoken) — consent-surfaced, never blocked. */
  surfaced: boolean;
}

export interface PreflightReceipt {
  interactionId: string;
  serverId: string;
  toolName: string;
  /** the real tool args (the `_preflight` control field stripped out). */
  args: Record<string, unknown>;
  mode: 'observe' | 'enforce';
  transcriptMode: 'full' | 'args_only_degraded';
  injectionFirewall: 'active' | 'unavailable_no_transcript';
  verdict: Disposition;
  /** true in observe mode iff the gate WOULD have refused (the call was forwarded anyway). */
  observeWouldHaveBlocked?: boolean;
  /** the raw core machine code, when the gate refused. */
  coreCode?: string;
  discrepancy?: Discrepancy;
  repair?: string;
  routingParams: RoutingParamReceipt[];
  contentParams: ContentParamReceipt[];
  transcriptSnapshot: { utteranceId: string; text: string; spanIds: string[] } | null;
  firedAt: number;
}

/** Split a core pass-Receipt's params into routing/content receipt rows (§17 param→source map). */
export function paramsFromReceipt(receipt: Receipt): {
  routingParams: RoutingParamReceipt[];
  contentParams: ContentParamReceipt[];
} {
  const routingParams: RoutingParamReceipt[] = [];
  const contentParams: ContentParamReceipt[] = [];

  for (const [name, param] of Object.entries(receipt.params)) {
    // The highest-rank source is the one the lattice judged by.
    let best = param.sources[0];
    for (const source of param.sources) if (best === undefined || source.rank > best.rank) best = source;
    const transcriptSpan = param.sources.find((source) => source.kind === 'transcript_span')?.span_id;

    if (param.class === 'routing') {
      routingParams.push({
        name,
        value: param.resolved?.label ?? '',
        source: best?.kind ?? 'unknown',
        sourceRank: best?.rank ?? 0,
        ...(transcriptSpan !== undefined ? { transcriptSpan } : {}),
        ...(param.resolved !== undefined ? { resolvedId: param.resolved.id, resolvedLabel: param.resolved.label } : {}),
      });
    } else {
      const surfaced = best?.kind === 'model_composed';
      contentParams.push({
        name,
        value: '',
        source: best?.kind ?? 'unknown',
        sourceRank: best?.rank ?? 0,
        surfaced,
      });
    }
  }
  return { routingParams, contentParams };
}
