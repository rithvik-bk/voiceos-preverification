/* ─────────────────────────────────── the provenance gate ──────────────────────────────────
 *
 * The walking-skeleton pipeline (KICKOFF Phase 2): finalized transcript → grounding store →
 * THIS GATE (min-rank lattice for routing params; content passes through consent-surfaced) →
 * verdict (pass / PreflightBlock with machine code) → provenance receipt (§17).
 *
 * The routing-param logic is the PORT of universal-voiceos-oauth's per-handler discipline
 * (tools-t2.ts resolveHandle/resolveTarget at 433-458: resolver miss → PreflightBlock with
 * candidates-as-data), generalized to run off a declarative ToolContract instead of being
 * hand-written inside each handler. The contract is the seed of §20's annotation format.
 *
 * Machine-code vocabulary is the v3 gate's, unchanged where the meaning is unchanged:
 * `target_not_found`, `ambiguous_target`, `missing_parameter`, `no_target`. TWO new codes:
 * `insufficient_provenance` — resolution succeeded but the grounding source's rank is below
 * the parameter class's minimum (§1's lattice made enforceable; v3 could not express this
 * because its directory was rank-3 by construction);
 * `provenance_mismatch` — the S11.2 injection firewall on the send path (Act 1). A Tier-3
 * destination / amount / permission slot resolved to a real referent, and that referent is a
 * perfectly valid rank-3 read-content referent (thread/reply may route to it) — but it was
 * NEVER licensed by a transcript span (literally spoken, resolved from a spoken descriptor via
 * the RRP of §10.3 — see licensing.ts — or card-tapped),
 * so it is structurally unroutable AS A NEW DESTINATION. The block names the found source and
 * the required one (found: tool_output/screen/…, required: transcript_span). There is no
 * classifier and nothing to fool: an address that only ever appeared inside read content has no
 * transcript span, so obeying it fails as a type error at the parameter level (S11.3).
 */

import { PreflightBlock, requiredText } from './block.ts';
import type { GroundingStore } from './grounding.ts';
import { licensingDescriptor } from './licensing.ts';
import { assertCoClausal, parseWordIndices, type RoutingSpanRef } from './misbinding.ts';
import { bestRank, minRankForRouting, textHash, type ParamClass, type Source } from './provenance.ts';
import { candidateSummary, resolveTarget, type Target } from './resolve.ts';
import { attributeToTranscript, transcriptSource, type FinalizedTranscript } from './transcript.ts';

/* ──────────────────────────────────── tool contracts ─────────────────────────────────────── */

/**
 * SPEC-v4 §11.2: a Tier-3 destination / amount / permission slot is not just "routing" — it
 * demands transcript-span licensing. Declaring the slot on a routing param turns on that rule.
 * A routing param with no `slot` (a thread/reply target) keeps the plain rank-3 rule, so a
 * read-content referent (rank 3) is a valid reply target — the split the task calls out.
 */
export type Tier3Slot = 'destination' | 'amount' | 'permission';

export interface ParamSpec {
  class: ParamClass;
  required?: boolean;
  /** routing only: marks a Tier-3 destination/amount/permission slot (S11.2 transcript-span rule). */
  slot?: Tier3Slot;
}

export interface ToolContract {
  tool: string;
  /** Tier per SPEC-v4 §5; the skeleton's only tool is Tier 3 (outbound send). */
  tier: 1 | 2 | 3;
  params: Record<string, ParamSpec>;
}

/**
 * The outbound send of the walking skeleton. `target` is a Tier-3 DESTINATION slot, so S11.2
 * applies: it must carry a transcript span. An address that only ever appeared inside read
 * content is structurally unroutable here (Act 1).
 */
export const SEND_MESSAGE: ToolContract = {
  tool: 'send_message',
  tier: 3,
  params: {
    target: { class: 'routing', required: true, slot: 'destination' },
    text: { class: 'content', required: true },
  },
};

/**
 * Thread reply — Tier-3, but its `target` is the message/thread being replied to, which is
 * exactly a read-content structural referent (rank 3). No `slot`, so the plain routing rule
 * governs: a rank-3 tool-output referent is a valid reply target even if it was never spoken.
 * This is the other half of S11.2: read-content referents STAY valid for thread/reply.
 */
export const THREAD_REPLY: ToolContract = {
  tool: 'thread_reply',
  tier: 3,
  params: {
    target: { class: 'routing', required: true },
    text: { class: 'content', required: true },
  },
};

/**
 * A refund: TWO Tier-3 routing params — a `recipient` (destination slot) AND an `amount` (amount
 * slot). This is the contract that exercises BOTH halves of Jonah's number class: `amount` must
 * be in the spoken number-set (number-twin, `amount_not_in_speech`), AND the two routing params
 * must trace to the SAME transcript clause (misbinding, `misbound_param`). A single-routing-param
 * tool (send_message) can never misbind; it takes two to cross a binding.
 */
export const REFUND: ToolContract = {
  tool: 'refund',
  tier: 3,
  params: {
    recipient: { class: 'routing', required: true, slot: 'destination' },
    amount: { class: 'routing', required: true, slot: 'amount' },
  },
};

/* ─────────────────────────────────────── the call ─────────────────────────────────────────── */

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  /**
   * The finalized utterance this call claims to act for. OPTIONAL: at zero-mod inside VoiceOS the
   * custom-MCP subprocess boundary carries only {name, arguments} (L21045) — transcript-blind. A
   * call with no transcript runs the ARGS-ONLY degraded path (see `preflight`): schema + ambiguity
   * against queryable state only. The injection firewall, number-twin, and misbinding checks all
   * require the transcript and are NOT run without it — the receipt's `mode` + `checksRun` say so.
   */
  transcript?: FinalizedTranscript;
}

/* ─────────────────────────────────────── receipts ─────────────────────────────────────────── */

export interface ParamReceipt {
  class: ParamClass;
  /** every source that vouches for this value, each with its rank (§17: param → source map). */
  sources: Source[];
  /** routing: the machine id the spoken value resolved to, and via which ladder tier. */
  resolved?: { id: string; label: string; via: 'id' | 'exact' | 'normalized' | 'substring' };
  /** content: never rank-gated; surfaced for consent in the composer instead (§2). */
  disposition: 'rank_gated' | 'consent_surfaced';
}

/**
 * Which checks actually ran (SOLUTION.md collapse-risk #1 — never claim the firewall ran without
 * the transcript). In `transcript_present` mode all are true; in `args_only` mode the three
 * transcript-dependent checks are false, and this object is the honest, machine-readable proof.
 */
export interface ChecksRun {
  /** required-field / malformed-call structural check (always). */
  schema: boolean;
  /** resolution + cardinality + min-rank against queryable state (always). */
  ambiguity: boolean;
  /** S11.2 destination-slot firewall: routing needs a transcript span (transcript only). */
  injectionFirewall: boolean;
  /** amount ∈ spoken number-set (transcript only). */
  numberTwin: boolean;
  /** routing params trace to one clause (transcript only). */
  misbinding: boolean;
}

export type GateMode = 'transcript_present' | 'args_only';

export interface Receipt {
  tool: string;
  utterance_id: string;
  /** which path ran — full grounding vs. args-only degraded (zero-mod). */
  mode: GateMode;
  /** the honest ledger of which checks this verdict is backed by. */
  checksRun: ChecksRun;
  params: Record<string, ParamReceipt>;
}

/* ───────────────────────────────────────── verdicts ───────────────────────────────────────── */

export type Verdict =
  | { verdict: 'pass'; receipt: Receipt }
  | { verdict: 'block'; code: string; detail: Record<string, unknown> };

/**
 * Run the gate; throws PreflightBlock on refusal, returns the receipt on pass.
 * Pure compute: no I/O, no clock, no network, no model.
 */
export function preflight(call: ToolCall, contract: ToolContract, store: GroundingStore): Receipt {
  if (call.tool !== contract.tool) {
    throw new PreflightBlock('missing_parameter', { field: 'tool', expected: contract.tool, got: call.tool });
  }

  const transcript = call.transcript;
  const present = transcript !== undefined;
  const params: Record<string, ParamReceipt> = {};
  const routingSpanRefs: RoutingSpanRef[] = [];

  for (const [name, spec] of Object.entries(contract.params)) {
    const value =
      spec.required === true
        ? requiredText(call.args, name, 'missing_parameter')
        : typeof call.args[name] === 'string'
          ? (call.args[name] as string)
          : undefined;
    if (value === undefined) continue;

    if (spec.class !== 'routing') {
      params[name] = present ? passContentParam(value, transcript) : passContentParamArgsOnly(value);
      continue;
    }

    const receipt = present
      ? gateRoutingParam(name, spec, value, transcript, store, contract.tier)
      : gateRoutingParamArgsOnly(name, spec, value, store, contract.tier);
    params[name] = receipt;

    // Collect the licensing span for the misbinding pass (transcript-present only).
    if (present) {
      const span = receipt.sources.find((source) => source.kind === 'transcript_span');
      if (span?.span_id !== undefined) {
        routingSpanRefs.push({ param: name, wordIndices: parseWordIndices(span.span_id) });
      }
    }
  }

  // Misbinding (check #5): only meaningful with a transcript and ≥2 span-licensed routing params.
  if (present) assertCoClausal(transcript, routingSpanRefs);

  return {
    tool: call.tool,
    utterance_id: present ? transcript.utterance_id : '',
    mode: present ? 'transcript_present' : 'args_only',
    checksRun: {
      schema: true,
      ambiguity: true,
      injectionFirewall: present,
      numberTwin: present,
      misbinding: present,
    },
    params,
  };
}

/** Catch-wrapper form: PreflightBlock → a data verdict. Anything else is a real bug and rethrows. */
export function runGate(call: ToolCall, contract: ToolContract, store: GroundingStore): Verdict {
  try {
    return { verdict: 'pass', receipt: preflight(call, contract, store) };
  } catch (error) {
    if (error instanceof PreflightBlock) return { verdict: 'block', code: error.code, detail: error.detail };
    throw error;
  }
}

/* ─────────────────────────────────── per-class gating ─────────────────────────────────────── */

/**
 * Routing (§1, §2): the spoken value must resolve to exactly one grounded target, and the
 * source that grounded that target must satisfy the class's minimum rank. Misses carry the
 * REAL candidates as data (ported ambiguity-as-data shape) — never a guess.
 */
function gateRoutingParam(
  name: string,
  spec: ParamSpec,
  spoken: string,
  transcript: FinalizedTranscript,
  store: GroundingStore,
  tier: 1 | 2 | 3,
): ParamReceipt {
  // Amount slots do not resolve against the target pool — they resolve against the spoken
  // number-set (number-twin, check #3). Handled entirely by transcript attribution.
  if (spec.slot === 'amount') return gateAmountParam(name, spoken, transcript);

  const pool = store.pool();
  const resolution = resolveTarget(spoken, pool);

  if (resolution.reason === 'ambiguous') {
    throw new PreflightBlock('ambiguous_target', {
      param: name,
      query: spoken,
      candidates: resolution.candidates.map(candidateSummary),
    });
  }
  if (resolution.reason === 'not_found' || resolution.match === undefined) {
    throw new PreflightBlock('target_not_found', {
      param: name,
      query: spoken,
      candidates: resolution.candidates.map(candidateSummary),
    });
  }

  const target: Target = resolution.match;
  const groundingSource = store.sourceOf(target);
  if (groundingSource === undefined) {
    // Resolution can only match pool members, so this is structural paranoia, not a live path.
    throw new PreflightBlock('target_not_found', { param: name, query: spoken, candidates: [] });
  }

  const sources: Source[] = [groundingSource];
  // S11.2 licensing, arm (a): the emitted value was literally spoken.
  const spokenSpans = attributeToTranscript(transcript, spoken);
  if (spokenSpans !== null) {
    sources.unshift(transcriptSource(spokenSpans, spoken));
  } else {
    // S11.2 licensing, arm (b) / S10.3 RRP: the model emitted the RESOLVED id (or another
    // non-literal form). The transcript span that licenses the slot is the SPOKEN DESCRIPTOR
    // that resolves, uniquely, to this same target. Read-content-only referents have no such
    // spoken descriptor, so the injection block is untouched (see licensing.ts).
    const license = licensingDescriptor(transcript, pool, target);
    if (license !== null) sources.unshift(transcriptSource(license.spans, license.descriptor));
  }

  // Tier-aware lattice floor (§1 × §5): Tier-3/Tier-2 routing demands rank ≥ 3; a Tier-1 read is
  // fail-open on rank (resolution to a real target is its safety, S5.1/S19.2). This floor is
  // SEPARATE from — and never weakens — the Tier-3 destination/amount/permission firewall below.
  const required = minRankForRouting(tier);
  if (groundingSource.rank < required) {
    throw new PreflightBlock('insufficient_provenance', {
      param: name,
      query: spoken,
      resolved: target.label,
      source_kind: groundingSource.kind,
      rank: groundingSource.rank,
      required_rank: required,
    });
  }

  // S11.2 — the injection firewall (Act 1). A Tier-3 destination/amount/permission slot must be
  // licensed by a transcript span: the value was spoken (attributed above), resolved from a
  // spoken deictic via the RRP, or card-tapped. A value whose only provenance is a read-content
  // referent (rank-3 tool_output — fine for a thread/reply target) has NO transcript span and is
  // structurally unroutable AS A NEW DESTINATION, regardless of what the model emitted. This is
  // a type check, not a classifier (S11.3): there is nothing to fool.
  if (spec.slot !== undefined) {
    const hasTranscriptSpan = sources.some((source) => source.kind === 'transcript_span');
    // A card tap (rank 4, kind not modeled in the skeleton) would also license the slot.
    if (!hasTranscriptSpan) {
      throw new PreflightBlock('provenance_mismatch', {
        param: name,
        slot: spec.slot,
        query: spoken,
        resolved: target.label,
        // The offending source the receipt names: where the value actually came from…
        found: groundingSource.kind,
        found_rank: groundingSource.rank,
        // …versus what a Tier-3 destination requires.
        required: 'transcript_span',
        required_rank: 4,
      });
    }
  }

  const via = resolutionVia(spoken, target);
  return {
    class: 'routing',
    disposition: 'rank_gated',
    sources,
    resolved: { id: target.id, label: target.label, via },
  };
}

/** Recompute the ladder tier for the receipt (cheap, avoids widening the ported Resolution shape). */
function resolutionVia(spoken: string, target: Target): 'id' | 'exact' | 'normalized' | 'substring' {
  const raw = spoken.trim();
  if (raw === target.id) return 'id';
  const names = [target.label, ...(target.aliases ?? [])];
  const loose = raw.toLowerCase().replace(/^[#@]/, '');
  if (names.some((n) => n.toLowerCase().replace(/^[#@]/, '') === loose)) return 'exact';
  const tightForm = loose.replace(/[^a-z0-9]/g, '');
  if (names.some((n) => n.toLowerCase().replace(/^[#@]/, '').replace(/[^a-z0-9]/g, '') === tightForm)) {
    return 'normalized';
  }
  return 'substring';
}

/**
 * Amount slot (check #3, number-twin / magnitude). An amount is licensed ONLY by speech: it must
 * appear in the transcript's spoken number-set. `attributeToTranscript` normalizes to letters+
 * digits, so "$54.79" matches the spoken "54 79"/"54.79" span and "$30" matches "30". A filled
 * amount not in the spoken set (54.99 ∉ {54.79}) is a hard inequality — no tolerance to slip
 * under — and blocks with `amount_not_in_speech` (HOLD; money ⇒ smart card). Because the only
 * licensing source is a transcript span (rank 4), an amount can NEVER be laundered from screen or
 * model output — the number firewall is the same type check as the destination firewall.
 */
function gateAmountParam(name: string, value: string, transcript: FinalizedTranscript): ParamReceipt {
  const spans = attributeToTranscript(transcript, value);
  if (spans === null) {
    throw new PreflightBlock('amount_not_in_speech', {
      param: name,
      slot: 'amount',
      value,
      // The receipt names the honest source of a rejected amount: it was never in the speech.
      found: 'model_composed',
      found_rank: 0,
      required: 'transcript_span',
      required_rank: 4,
    });
  }
  return { class: 'routing', disposition: 'rank_gated', sources: [transcriptSource(spans, value)] };
}

/**
 * ARGS-ONLY degraded routing (SOLUTION.md collapse-risk #1 / §HOW IT SLOTS IN). Zero-mod inside
 * VoiceOS the subprocess sees only {name, arguments} — no transcript. So we run what args alone
 * can prove: resolution + cardinality (ambiguity) + min-rank against queryable state. We CANNOT
 * run the transcript-span firewall, the number-twin, or misbinding — and we do NOT pretend to.
 * An amount here is unverifiable against speech, so it passes schema-only, sourced honestly as
 * model_composed (rank 0). The receipt's `mode: 'args_only'` + `checksRun` make this explicit.
 */
function gateRoutingParamArgsOnly(
  name: string,
  spec: ParamSpec,
  spoken: string,
  store: GroundingStore,
  tier: 1 | 2 | 3,
): ParamReceipt {
  if (spec.slot === 'amount') {
    // No transcript ⇒ no spoken number-set to check against. Args-only cannot ground an amount.
    return { class: 'routing', disposition: 'rank_gated', sources: [{ kind: 'model_composed', rank: 0, text_hash: textHash(spoken) }] };
  }

  const pool = store.pool();
  const resolution = resolveTarget(spoken, pool);
  if (resolution.reason === 'ambiguous') {
    throw new PreflightBlock('ambiguous_target', {
      param: name,
      query: spoken,
      candidates: resolution.candidates.map(candidateSummary),
    });
  }
  if (resolution.reason === 'not_found' || resolution.match === undefined) {
    throw new PreflightBlock('target_not_found', {
      param: name,
      query: spoken,
      candidates: resolution.candidates.map(candidateSummary),
    });
  }

  const target: Target = resolution.match;
  const groundingSource = store.sourceOf(target);
  if (groundingSource === undefined) {
    throw new PreflightBlock('target_not_found', { param: name, query: spoken, candidates: [] });
  }

  const required = minRankForRouting(tier);
  if (groundingSource.rank < required) {
    throw new PreflightBlock('insufficient_provenance', {
      param: name,
      query: spoken,
      resolved: target.label,
      source_kind: groundingSource.kind,
      rank: groundingSource.rank,
      required_rank: required,
    });
  }

  // NOTE: the S11.2 destination-slot firewall is DELIBERATELY not run here — it needs the
  // transcript. Args-only mode never claims to catch injection (SOLUTION.md collapse-risk #1).
  return {
    class: 'routing',
    disposition: 'rank_gated',
    sources: [groundingSource],
    resolved: { id: target.id, label: target.label, via: resolutionVia(spoken, target) },
  };
}

/** Content in args-only mode: no transcript to attribute against, so honestly model_composed. */
function passContentParamArgsOnly(value: string): ParamReceipt {
  return {
    class: 'content',
    disposition: 'consent_surfaced',
    sources: [{ kind: 'model_composed', rank: 0, text_hash: textHash(value) }],
  };
}

/**
 * Content (§2): the model's legitimate job. Never rank-gated, never blocked on provenance —
 * surfaced for consent instead. The receipt still names its source honestly: transcript spans
 * when the user said the words, `model_composed` (rank 0) when the model wrote them. Rank 0
 * is what makes §2's promotion ban structural: a model_composed value can never satisfy a
 * routing slot's min-rank, so content can never be laundered into a destination.
 */
function passContentParam(value: string, transcript: FinalizedTranscript): ParamReceipt {
  const spans = attributeToTranscript(transcript, value);
  const sources: Source[] =
    spans !== null
      ? [transcriptSource(spans, value)]
      : [{ kind: 'model_composed', rank: 0, text_hash: textHash(value) }];
  // bestRank kept visible here for the future taint path (§2); content is not judged by it.
  void bestRank(sources);
  return { class: 'content', disposition: 'consent_surfaced', sources };
}
