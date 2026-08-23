/* ─────────────────────── fixture generator — the S18.1 self-growing loop ───────────────────
 *
 * "Every blocked call MUST serialize into an anonymized fixture (context state, drifted
 * parameter, catching rule) feeding the eval harness." (S18.1)
 *
 * Input is the skeleton's shadow-log output shape (ShadowRecord, decision=would_have_blocked)
 * plus the gate context that produced it (the call + the grounded target entries). Output is
 * a corpus case in the blind schema, so generated fixtures run through the SAME adapter and
 * runner as every other corpus — the loop closes: block → fixture → regression case.
 *
 * Anonymization: every alphanumeric run in transcript tokens, param values, target ids,
 * labels, and aliases is replaced by a deterministic pseudonym ('x' + FNV hash prefix),
 * word-by-word with separators kept. Word-level renaming is injective and consistent, so the
 * exact/normalized/substring relations the resolver judges are preserved — re-running the
 * anonymized fixture reproduces the SAME machine code (asserted in test/fixturegen.test.ts).
 * Raw workspace text never lands in the corpus (§17's privacy default, applied to fixtures).
 */

import {
  textHash,
  type GroundedTargetEntry,
  type ShadowRecord,
  type ToolCall,
  type ToolContract,
} from '../../core/src/index.ts';

import type { CorpusCase, PriorToolOutput } from './schema.ts';

export interface FixtureSourceContext {
  call: ToolCall;
  contract: ToolContract;
  /** the grounded pool at block time: store.pool().map(t => ({ target: t, source: store.sourceOf(t)! })) */
  entries: readonly GroundedTargetEntry[];
}

/** Deterministic word-level pseudonymization; separators (#, @, ., -, space) survive. */
export function anonymizeText(text: string): string {
  return text.replace(/[A-Za-z0-9]+/g, (run) => `x${textHash(run.toLowerCase()).slice(0, 6)}`);
}

const CODE_TO_CATEGORY: Record<string, string> = {
  target_not_found: 'misheard-target',
  ambiguous_target: 'ambiguous-target',
  missing_parameter: 'dropped-param',
  insufficient_provenance: 'insufficient-provenance',
  provenance_mismatch: 'injection',
};

const CODE_TO_TESTS: Record<string, string[]> = {
  target_not_found: ['S1.4', 'S14.2'],
  ambiguous_target: ['S10.3'],
  missing_parameter: ['S1.4'],
  insufficient_provenance: ['S1.1', 'S12.1'],
  provenance_mismatch: ['S11.2'],
};

export function fixtureFromShadowRecord(
  record: ShadowRecord,
  context: FixtureSourceContext,
  id: string,
): CorpusCase {
  if (record.decision !== 'would_have_blocked') {
    throw new Error(`fixtureFromShadowRecord serializes blocks only (S18.1); got ${record.decision}`);
  }
  const code = record.code ?? 'unknown';
  const driftedParam =
    (record.detail?.['param'] as string | undefined) ?? (record.detail?.['field'] as string | undefined);

  const priorToolOutputs: PriorToolOutput[] = [];
  const knownStateTargets: Array<Record<string, unknown>> = [];
  const screenTargets: Array<{ id: string; label: string; kind: string; aliases?: string[] }> = [];

  for (const entry of context.entries) {
    const target = entry.target;
    const anonId = anonymizeText(target.id);
    const anonLabel = anonymizeText(target.label);
    const anonAliases = (target.aliases ?? []).map(anonymizeText);

    if (entry.source.kind === 'tool_output') {
      const structural: Record<string, unknown> =
        target.kind === 'channel'
          ? {
              type: 'channel',
              name: anonLabel.replace(/^#/, ''),
              channel_id: anonId,
              ...(anonAliases.length > 0 ? { aliases: anonAliases } : {}),
            }
          : {
              type: 'user',
              name: anonLabel,
              user_id: anonId,
              ...(anonAliases.length > 0 ? { aliases: anonAliases } : {}),
            };
      priorToolOutputs.push({
        referent_id: `r_${anonId}`,
        tool: entry.source.tool ?? 'read',
        ts: null,
        structural,
        free_text: null,
      });
    } else if (entry.source.kind === 'known_state') {
      knownStateTargets.push({
        id: anonId,
        label: anonLabel,
        kind: target.kind,
        ...(anonAliases.length > 0 ? { aliases: anonAliases } : {}),
      });
    } else if (entry.source.kind === 'screen') {
      screenTargets.push({
        id: anonId,
        label: anonLabel,
        kind: target.kind,
        ...(anonAliases.length > 0 ? { aliases: anonAliases } : {}),
      });
    }
  }

  const params: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(context.call.args)) {
    params[name] = anonymizeText(String(value));
  }

  const fixture: CorpusCase = {
    id,
    category: CODE_TO_CATEGORY[code] ?? code,
    tests: CODE_TO_TESTS[code] ?? [],
    rationale: `auto-serialized from shadow record seq=${record.seq} (S18.1): ${code} on ${record.tool}${
      driftedParam !== undefined ? `.${driftedParam}` : ''
    }`,
    transcript: { tokens: context.call.transcript.spans.map((span) => anonymizeText(span.text)) },
    prior_tool_outputs: priorToolOutputs,
    ...(knownStateTargets.length > 0 ? { known_state: { targets: knownStateTargets } } : {}),
    ...(screenTargets.length > 0 ? { x_screen_targets: screenTargets } : {}),
    proposed_call: { tool: record.tool, tier: context.contract.tier, params },
    expected: { verdict: 'BLOCK', code },
    x_generated: { from: 'shadow_record', seq: record.seq, at: record.at, utterance_id: record.utterance_id },
  };
  return fixture;
}
