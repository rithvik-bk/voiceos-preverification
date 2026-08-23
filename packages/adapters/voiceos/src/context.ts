/* ─────────────────────────── the VoiceOS grounding context seam ───────────────────────────
 *
 * The core gate is pure compute over three inputs: a finalized transcript, a grounding store
 * (the pool of routing-eligible targets, each stamped with the SOURCE that vouches for it), and
 * the proposed call's args. This module reconstructs those two context inputs from ONE plain
 * object — a `PreflightContext` — so the adapter never smuggles session state into the gate.
 *
 * WHERE THE CONTEXT COMES FROM (the two honest modes, per the VoiceOS RE facts):
 *   (a) transcript-PRESENT — VoiceOS threads `currentTranscript` into the tool ctx at its
 *       dispatch fork (L28076). Wired through, it arrives as `arguments._preflight` (or via a
 *       `context()` provider the wrapper author supplies). With a transcript, the FULL checks
 *       run: injection firewall (transcript-span licensing), span attribution, ambiguity.
 *   (b) transcript-ABSENT — the zero-mod custom-MCP subprocess boundary carries only
 *       {name, arguments} (L21045), which is transcript-blind. Then `transcript` is empty and
 *       the caller runs ARGS-ONLY DEGRADED mode (see withPreflight.ts): ambiguity /
 *       target-resolution / rank checks still run against the queryable pool, but the injection
 *       firewall and any transcript-span rule are UNAVAILABLE and labeled as such — never faked.
 *
 * A referent's `origin` maps directly onto the provenance lattice (provenance.ts RANK):
 *   tool_output → rank 3 (read this session) · known_state → rank 2 · screen → rank 1.
 * SCREEN referents are loaded into the pool (a screen-scraped name is a real thing on the glass)
 * but rank 1 < the routing minimum (3), so they can never license a routing slot — that IS the
 * firewall, enforced by the lattice, not by this loader.
 */

import {
  GroundingStore,
  finalizeUtterance,
  type FinalizedTranscript,
  type Target,
  type EntityKind,
} from '../../../core/src/index.ts';

/** Where a referent came from — one of the three non-speech lattice sources. */
export type ReferentOrigin = 'tool_output' | 'known_state' | 'screen';

/**
 * One routing-eligible target the session has seen, with explicit provenance. This is exactly
 * what a VoiceOS seam (or a `context()` provider that queries the downstream — e.g. Slack
 * conversations.list) hands the adapter. `id`/`label`/`kind` mirror core's Target; `origin`
 * stamps the lattice rank; `tool` (optional) lands verbatim in the receipt.
 */
export interface Referent {
  kind: EntityKind; // 'channel' | 'group' | 'person'
  id: string;
  label: string;
  aliases?: string[];
  origin: ReferentOrigin;
  tool?: string;
}

/**
 * The whole context object the seam (or provider) supplies for one call. Every field optional:
 * absent `transcript` ⇒ degraded args-only mode; absent `referents` ⇒ empty pool (everything
 * resolves to target_not_found → HOLD, which is the correct conservative answer).
 */
export interface PreflightContext {
  /** The finalized utterance this call claims to act for. Empty/absent ⇒ degraded mode. */
  transcript?: string;
  utteranceId?: string;
  /** The executionId VoiceOS round-trips; keys the PreflightReceipt to the post-verifier. */
  interactionId?: string;
  /** The routing-eligible pool with per-referent provenance. */
  referents?: Referent[];
}

const RANK_OF_ORIGIN: Record<ReferentOrigin, number> = { tool_output: 3, known_state: 2, screen: 1 };

/** Build the grounding store from the context's referents, each stamped with its lattice source. */
export function buildGroundingStore(context: PreflightContext): GroundingStore {
  const store = new GroundingStore();
  for (const referent of context.referents ?? []) {
    if (referent.id === '' || referent.label === '') continue;
    const target: Target = {
      id: referent.id,
      label: referent.label,
      kind: referent.kind,
      ...(referent.aliases !== undefined && referent.aliases.length > 0 ? { aliases: referent.aliases } : {}),
    };
    store.rememberTargets([target], {
      kind: referent.origin,
      ...(referent.tool !== undefined ? { tool: referent.tool } : {}),
    });
  }
  return store;
}

/** True when a real transcript is present — the gate can run its full (transcript-dependent) checks. */
export function hasTranscript(context: PreflightContext): boolean {
  return typeof context.transcript === 'string' && context.transcript.trim() !== '';
}

/**
 * Build the finalized transcript. In degraded mode (no transcript) this returns an EMPTY
 * finalized utterance; the caller has already stripped the transcript-span rules from the
 * contract, so no span attribution is attempted against it (an empty transcript would otherwise
 * false-block every destination slot as "injection").
 */
export function buildTranscript(context: PreflightContext): FinalizedTranscript {
  const utteranceId = context.utteranceId ?? 'u1';
  return finalizeUtterance(utteranceId, context.transcript ?? '');
}

/** Rank of a referent origin — exported for receipt annotation and tests. */
export function rankOfOrigin(origin: ReferentOrigin): number {
  return RANK_OF_ORIGIN[origin];
}
