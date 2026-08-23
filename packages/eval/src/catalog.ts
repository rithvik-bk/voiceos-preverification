/* ─────────────────────── capability catalog (the no-silent-caps registry) ───────────────────
 *
 * What today's @preflight/core can and cannot represent, named explicitly. A corpus case that
 * touches a capability the core does not implement is scored NOT-RUNNABLE-YET with the
 * capability named — it is NEVER adapted into a fake pass (running a PASS case the core cannot
 * evaluate) or a fake catch (a block fired by an adapter artifact rather than the spec'd rule).
 *
 * Core capabilities as of 2026-08-21 (read from packages/core src + tests, not assumed):
 *   - finalized single-version transcript (word spans, no streaming / stability horizon);
 *   - entity-target routing over a grounded pool (channel | group | person) with the min-rank
 *     lattice (§1) and S11.2 transcript-span licensing for Tier-3 destination slots (Act 1);
 *   - content params consent-surfaced, never provenance-blocked (§2);
 *   - verdicts: pass | block (machine codes). There is NO card surface of any kind, so every
 *     expected-CARD case is not runnable — a hard block would be scored a repair-path false
 *     block by the blind author (SCHEMA.md), and a pass would be a miss; neither is measurable
 *     until cards exist.
 */

export const CAPS = {
  CARD_VERDICTS: 'card-verdicts',
  SCREEN: 'screen-observations',
  STREAMING: 'streaming-stability-horizon',
  DERIVED_TIME: 'derived-time-verification',
  AMOUNT: 'amount-and-financial-slots',
  NON_ENTITY_REF: 'non-entity-referent-gating',
  PERMISSION_VOCAB: 'permission-slot-values',
  ARRAY_ROUTING: 'array-valued-routing-params',
  EMOJI: 'emoji-vocabulary',
  CARD_TAPS: 'card-tap-sources',
  REPAIR: 'repair-ladder',
  PRECONDITION: 'precondition-verification',
  UNCATALOGED: 'uncataloged-tool-or-param',
} as const;

export type CapabilityId = (typeof CAPS)[keyof typeof CAPS];

/** One line per capability: what is missing in core, with the spec section it belongs to. */
export const CAP_NOTES: Record<CapabilityId, string> = {
  [CAPS.CARD_VERDICTS]:
    'core emits pass|block only — no micro-card / disambiguation / pool-listing surface (S3.2, S4.1, S10.3e, S14.2-3, S15.2)',
  [CAPS.SCREEN]: 'no screen surface, ring buffer, or S12-S13 ranking/invalidation in core',
  [CAPS.STREAMING]: 'no volatile tokens / stability horizon; transcripts are finalized fixtures (S6.4)',
  [CAPS.DERIVED_TIME]: 'no closed-form time/quantity/ordinal recomputation (S3.1-S3.3)',
  [CAPS.AMOUNT]: 'no numeric amount grounding, unit/magnitude guarding, or account/routing slots (S15, S1.2 number-word normalization)',
  [CAPS.NON_ENTITY_REF]:
    'resolver covers channel|group|person only; message/email/event/file/scheduled referents are not gate-checkable (S10.3 RRP; the grounding store HAS a message registry but no tool contract consumes it)',
  [CAPS.PERMISSION_VOCAB]: 'role values (admin/member) are not entity referents; no permission vocabulary exists (S11.2 permission slots)',
  [CAPS.ARRAY_ROUTING]: 'gate params are single strings; list-valued recipient params are not representable',
  [CAPS.EMOJI]: 'no emoji vocabulary/validation (v3 had invalid_emoji; core does not)',
  [CAPS.CARD_TAPS]: 'card taps are named in a gate comment as a licensing source but no code path admits them (S11.2)',
  [CAPS.REPAIR]: 'no repair ladder: no recompute rung, no constrained re-emit, no micro-card (S4.1-S4.3)',
  [CAPS.PRECONDITION]: 'no connection-test / app-running precondition checks (replay R3/R4 class; §17-side verification)',
  [CAPS.UNCATALOGED]: 'tool or parameter not in the eval catalog — extend catalog.ts before scoring',
};

/* ───────────────────────────── per-tool parameter catalog ─────────────────────────────────
 * How each corpus tool's parameters map onto core's contract vocabulary.
 *   entity    → routing param resolvable in the channel|group|person pool (slot marks the
 *               S11.2 Tier-3 destination rule; applied only when the case's tier is 3);
 *   content   → content param (consent-surfaced);
 *   unmodeled → excluded from the constructed contract but REPORTED per case (never silent) —
 *               used only where the param cannot change the verdict class being measured;
 *   missing   → capability gap: the case is NOT-RUNNABLE-YET.
 */

export type ParamMap =
  | { kind: 'entity'; slot?: 'destination' | 'amount' | 'permission' }
  | { kind: 'content' }
  | { kind: 'unmodeled'; note: string }
  | { kind: 'missing'; capability: CapabilityId; note: string };

const entityDest: ParamMap = { kind: 'entity', slot: 'destination' };
const entity: ParamMap = { kind: 'entity' };
const content: ParamMap = { kind: 'content' };
const missing = (capability: CapabilityId, note: string): ParamMap => ({ kind: 'missing', capability, note });

export const TOOL_CATALOG: Record<string, Record<string, ParamMap>> = {
  send_message: {
    target: entityDest,
    recipient: entityDest,
    channel: entityDest,
    text: content,
    thread_ts: missing(CAPS.NON_ENTITY_REF, 'thread/message referent'),
    notify_users: missing(CAPS.ARRAY_ROUTING, 'list of extra recipients'),
  },
  thread_reply: { target: entity, text: content },
  forward_message: {
    recipient: entityDest,
    message_id: missing(CAPS.NON_ENTITY_REF, 'message referent'),
  },
  send_payment: {
    payee: entityDest,
    amount_usd: missing(CAPS.AMOUNT, 'payment amount'),
    payee_account: missing(CAPS.AMOUNT, 'bank account destination'),
    routing: missing(CAPS.AMOUNT, 'bank routing number'),
  },
  schedule_reminder: {
    delay_s: missing(CAPS.DERIVED_TIME, 'delay derivation + unit ambiguity'),
    text: content,
  },
  update_event: {
    event_id: missing(CAPS.NON_ENTITY_REF, 'calendar event referent'),
    start: missing(CAPS.DERIVED_TIME, 'derived start time'),
  },
  calendar_create_event: {
    title: content,
    start: missing(CAPS.DERIVED_TIME, 'event start time'),
    end: missing(CAPS.DERIVED_TIME, 'event end time (the R1 drifted param)'),
  },
  schedule_message: {
    channel: entityDest,
    post_at: missing(CAPS.DERIVED_TIME, 'scheduled post time'),
    text: content,
  },
  delete_message: { message_id: missing(CAPS.NON_ENTITY_REF, 'message referent (+ ordinal RRP)') },
  delete_scheduled_message: {
    scheduled_id: missing(CAPS.NON_ENTITY_REF, 'scheduled-message referent (+ S10.2 TTL re-verify)'),
  },
  forward_email: {
    to: entityDest,
    email_id: missing(CAPS.NON_ENTITY_REF, 'email referent'),
  },
  reply_email: {
    in_reply_to: missing(CAPS.NON_ENTITY_REF, 'email referent (valid rank-3 reply target)'),
    body: content,
  },
  invite_to_event: {
    invitee_email: entityDest,
    event_id: missing(CAPS.NON_ENTITY_REF, 'calendar event referent'),
  },
  set_channel_role: {
    channel: entity,
    user: entityDest,
    role: missing(CAPS.PERMISSION_VOCAB, 'role value is not an entity referent'),
  },
  share_file: {
    recipient: entityDest,
    file_id: missing(CAPS.NON_ENTITY_REF, 'file referent'),
  },
  add_reaction: {
    message_id: missing(CAPS.NON_ENTITY_REF, 'message referent'),
    emoji: missing(CAPS.EMOJI, 'emoji vocabulary'),
  },
  pin_message: { message_id: missing(CAPS.NON_ENTITY_REF, 'message referent') },
  pay_invoice: {
    invoice_id: missing(CAPS.NON_ENTITY_REF, 'invoice referent'),
    amount_usd: missing(CAPS.AMOUNT, 'payment amount'),
  },
  read_channel_history: {
    channel: entity, // Tier-1 read: no destination slot; S11.2 is a Tier-3 rule
    limit: { kind: 'unmodeled', note: 'read page size; cannot change the verdict class under test (S5.1: Tier-1 has no gate surface at all)' },
  },
};
