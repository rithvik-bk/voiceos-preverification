/* ─────────────────────────────── the misbinding check (PF_MISBOUND_PARAM) ───────────────────
 *
 * SOLUTION.md check #5 (the adversary caught this hole). The number-twin check (#3,
 * `amount_not_in_speech`) proves each amount is SOMEWHERE in the spoken number-set. It does NOT
 * prove the routing params of one call were spoken about the SAME thing. Both halves matter:
 *
 *   spoken:  "refund Dan $50 and Sarah $30"
 *   emitted: refund(recipient: Dan, amount: $30)
 *
 * "Dan" is spoken (check #3 passes for the recipient), "$30" is spoken (check #3 passes for the
 * amount) — every param grounds. But Dan was paired with $50 and Sarah with $30; the emitted
 * pairing crosses the clause boundary. This is the second half of Jonah's number class.
 *
 * THE DETERMINISTIC RULE (no LLM, no parser guess): segment the transcript into CLAUSES at
 * connectives (and / then / also / plus) and trailing separators (, ;). Every routing param that
 * was licensed by a transcript span maps to the clause(s) its licensing span sits in. The proof
 * is complete only if there is a SINGLE clause common to every span-licensed routing param — one
 * clause the whole action traces to. Empty intersection with ≥2 span-licensed routing params ⇒
 * the binding is crossed ⇒ HOLD (ask which pairing).
 *
 * SCOPE / HONEST LIMITS:
 *  - Uses ONLY licensing spans the gate already produced (transcript.ts / licensing.ts) — no new
 *    provenance surface, nothing to fool beyond what already licensed each param.
 *  - Params with NO transcript span (a rank-3 read-content reply target, or an amount only in
 *    args-only degraded mode) do NOT participate — misbinding is about SPOKEN-clause pairing.
 *  - Clause segmentation is intentionally conservative (word-level connectives + trailing
 *    punctuation). It biases to FALSE-NEGATIVE (a missed cross-binding) over a false catch: a
 *    fabricated misbinding block would be exactly the nag SOLUTION.md §UX warns against.
 *  - A single-clause utterance can never misbind (the intersection is that one clause).
 */

import { PreflightBlock } from './block.ts';
import type { FinalizedTranscript } from './transcript.ts';

/** Words that open a new clause. Kept small and literal — no stemming, no NLP. */
const CLAUSE_CONNECTIVES = new Set(['and', 'then', 'also', 'plus']);

function loose(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Word index → clause index. A connective token belongs to NO clause (marked -1) and opens the
 * next; a token whose raw text ends in `,` or `;` closes its clause after itself.
 */
export function clauseIndexByWord(transcript: FinalizedTranscript): number[] {
  const result: number[] = [];
  let clause = 0;
  transcript.spans.forEach((span, index) => {
    if (CLAUSE_CONNECTIVES.has(loose(span.text))) {
      result[index] = -1; // the connective is a boundary, not part of a clause
      clause += 1;
      return;
    }
    result[index] = clause;
    if (/[,;]$/.test(span.text.trim())) clause += 1;
  });
  return result;
}

/** A routing param and the transcript word indices its licensing span covered. */
export interface RoutingSpanRef {
  param: string;
  wordIndices: number[];
}

/** Parse the covered word indices out of a receipt span id ("u1.w5+u1.w6" → [5, 6]). */
export function parseWordIndices(spanId: string): number[] {
  const indices: number[] = [];
  for (const part of spanId.split('+')) {
    const match = /\.w(\d+)$/.exec(part);
    if (match !== null) indices.push(Number(match[1]));
  }
  return indices;
}

/**
 * The check. Throws `misbound_param` (HOLD) when two-or-more span-licensed routing params share
 * NO common clause. Fewer than two participating params ⇒ nothing to bind ⇒ returns silently.
 */
export function assertCoClausal(transcript: FinalizedTranscript, routing: readonly RoutingSpanRef[]): void {
  const participating = routing.filter((ref) => ref.wordIndices.length > 0);
  if (participating.length < 2) return;

  const clauseByWord = clauseIndexByWord(transcript);
  const perParam = participating.map((ref) => {
    const clauses = new Set<number>();
    for (const wordIndex of ref.wordIndices) {
      const clause = clauseByWord[wordIndex];
      if (clause !== undefined && clause >= 0) clauses.add(clause);
    }
    return { param: ref.param, clauses };
  });

  // Intersection of every param's clause-set: the clause(s) the whole action traces to.
  let common: Set<number> | null = null;
  for (const entry of perParam) {
    if (common === null) {
      common = new Set(entry.clauses);
    } else {
      common = new Set([...common].filter((clause) => entry.clauses.has(clause)));
    }
  }

  if (common === null || common.size === 0) {
    throw new PreflightBlock('misbound_param', {
      reason: 'routing params trace to different transcript clauses',
      params: perParam.map((entry) => ({ param: entry.param, clauses: [...entry.clauses].sort((a, b) => a - b) })),
    });
  }
}
