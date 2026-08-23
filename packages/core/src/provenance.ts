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

export type SourceKind =
  | 'transcript_span' // rank 4 — the user's literal, stabilized words
  | 'tool_output' // rank 3 — things read this session (a channel id, a message ts)
  | 'known_state' // rank 2 — connected identity, active workspace, device timezone
  | 'screen' // rank 1 — what is visible; restricted (§14)
  | 'model_composed'; // rank 0 — the model's own prose; content-only, NEVER routing-eligible (§2)

export type ProvenanceRank = 0 | 1 | 2 | 3 | 4;

export const RANK: Record<SourceKind, ProvenanceRank> = {
  transcript_span: 4,
  tool_output: 3,
  known_state: 2,
  screen: 1,
  model_composed: 0,
};

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

/* ─────────────────────────── parameter classes and the min-rank rule ─────────────────────── */

/**
 * SPEC-v4 §2: routing parameters (who/where/when/how much) select targets — provenance-gated.
 * Content parameters (what to say) are the model's legitimate job — never provenance-blocked,
 * consent-surfaced in the composer instead.
 */
export type ParamClass = 'routing' | 'content';

/** Minimum provenance rank per parameter class (§1: Tier-3 routing requires rank ≥ 3). */
export const MIN_RANK: Record<ParamClass, ProvenanceRank> = {
  routing: 3,
  content: 0, // pass-through: consent-surfaced, not rank-gated
};

export function minRankFor(paramClass: ParamClass): ProvenanceRank {
  return MIN_RANK[paramClass];
}

/** Highest rank among a value's cited sources — the rank the lattice rule judges. */
export function bestRank(sources: readonly Source[]): ProvenanceRank {
  let best: ProvenanceRank = 0;
  for (const source of sources) if (source.rank > best) best = source.rank;
  return best;
}

/* ──────────────────────────────────────── hashing ─────────────────────────────────────────
 * FNV-1a 32-bit, inline so the core needs no imports at all (not even node:crypto). This is a
 * privacy default for receipts, not a security boundary; the enterprise story (§17) is real
 * signing, and that is a later phase.
 */
export function textHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
