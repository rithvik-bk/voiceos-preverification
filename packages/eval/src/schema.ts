/* ─────────────────────────────── corpus case schema (types) ───────────────────────────────
 *
 * The shape of `cases.json` as defined by the BLIND corpus author in
 * corpora/blind/SCHEMA.md — authored from the spec alone, never from the implementation.
 * The eval harness adapts TO this schema (SCHEMA.md: "An adapter maps these fields onto the
 * real harness; if a field cannot be represented in the harness, that is itself a finding").
 * The replay and self-generated corpora reuse the same shape, plus:
 *   - `provenance` / `source` (replay: verbatim-report vs reconstructed, per
 *     docs/pods/replay-corpus-candidates.md — marked exactly as the source doc marks them);
 *   - `x_screen_targets`, `known_state.targets`, `x_generated` (self corpus: emitted by the
 *     fixture generator, which must be able to serialize ANY gate block — including blocks
 *     whose grounding came from known state or a screen scrape — without inventing reads);
 *   - `x_preconditions` (replay R3/R4: environment invariants the call depends on).
 */

export interface PriorToolOutput {
  referent_id: string;
  tool: string;
  ts?: string | null;
  /** ids/timestamps/channels/names-as-directory-entries — rank 3 per S11.1. */
  structural?: Record<string, unknown> | null;
  /** untrusted content — NEVER a referent (S11.1). The adapter never loads this into the pool. */
  free_text?: string | null;
}

export interface ScreenObservation {
  surface?: string;
  hash?: string;
  ts_ms?: number;
  user_attributed?: boolean;
  visible?: string[];
  [key: string]: unknown;
}

export interface CorpusCase {
  id: string;
  category?: string;
  tests?: string[];
  rationale?: string;
  /** replay corpus: 'verbatim-report' | 'reconstructed', copied from the source doc. */
  provenance?: string;
  /** replay corpus: citation into the local intel that reported the failure. */
  source?: string;
  clock?: string;
  transcript?: {
    tokens: string[];
    descriptor?: { text: string; token?: string };
    token_ts_ms?: Record<string, number>;
    volatile_tokens?: string[];
    transcript_version?: number;
  };
  prior_tool_outputs?: PriorToolOutput[];
  known_state?: Record<string, unknown>;
  card_taps?: Array<Record<string, unknown>>;
  screen?: { observations: ScreenObservation[] } | null;
  /** self corpus only: pool entries whose grounding source was a rank-1 screen scrape. */
  x_screen_targets?: Array<{ id: string; label: string; kind: string; aliases?: string[] }>;
  /** replay only: environment invariants (connection verified, app running) the call rides on. */
  x_preconditions?: string[];
  /** self corpus only: provenance of the generated fixture (shadow record seq etc.). */
  x_generated?: Record<string, unknown>;
  proposed_call: {
    tool: string;
    tier?: number;
    params: Record<string, unknown>;
    model_claimed_source?: Record<string, unknown>;
    repair_stage?: string;
    candidate_set?: unknown[];
  };
  expected: {
    verdict: 'PASS' | 'BLOCK' | 'CARD';
    spec?: string;
    code?: string;
    card_question?: string;
    required_behavior?: string[];
    blocked_write?: boolean;
  };
}

export interface Corpus {
  meta: { name: string; [key: string]: unknown };
  cases: CorpusCase[];
}
