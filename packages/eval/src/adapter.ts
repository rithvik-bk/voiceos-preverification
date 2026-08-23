/* ───────────────────────────── corpus case → gate input adapter ─────────────────────────────
 *
 * Two jobs, kept separate on purpose:
 *   assessCase   — decide whether TODAY'S core can honestly evaluate the case; if not, name
 *                  every missing capability (no-silent-caps: a case is never quietly skipped
 *                  and never quietly bent into something the core happens to handle).
 *   buildGateInput — for runnable cases only: reconstruct the gate context exactly as the case
 *                  states it (transcript tokens → finalized utterance; prior tool outputs'
 *                  STRUCTURAL referents → grounded target pool at rank 3 per S11.1; known
 *                  state → rank 2; screen-scraped extension targets → rank 1) and pass the
 *                  proposed call's params VERBATIM — what the model emitted is what is gated;
 *                  the adapter never substitutes the descriptor for the emitted value.
 *
 * free_text is NEVER loaded into the pool (S11.1: free text inside a read payload is content,
 * not a referent). That is not an adapter convenience — it is the firewall's premise.
 */

import {
  GroundingStore,
  finalizeUtterance,
  type EntityKind,
  type Target,
  type ToolCall,
  type ToolContract,
  type ParamSpec,
} from '../../core/src/index.ts';

import { CAPS, CAP_NOTES, TOOL_CATALOG, type CapabilityId, type ParamMap } from './catalog.ts';
import type { CorpusCase, PriorToolOutput } from './schema.ts';

export interface MissingCapability {
  capability: CapabilityId;
  note: string;
}

export interface Assessment {
  runnable: boolean;
  missing: MissingCapability[];
  /** params excluded from the constructed contract — reported, never silent. */
  unmodeled: Array<{ param: string; note: string }>;
}

export interface GateInput {
  call: ToolCall;
  contract: ToolContract;
  store: GroundingStore;
}

/* ─────────────────────────────────────── assessment ─────────────────────────────────────── */

export function assessCase(corpusCase: CorpusCase): Assessment {
  const missing: MissingCapability[] = [];
  const unmodeled: Array<{ param: string; note: string }> = [];
  const add = (capability: CapabilityId, note: string): void => {
    if (!missing.some((m) => m.capability === capability && m.note === note)) {
      missing.push({ capability, note });
    }
  };

  if (corpusCase.expected.verdict === 'CARD') {
    add(
      CAPS.CARD_VERDICTS,
      `expected terminal response is a question ("${corpusCase.expected.card_question ?? ''}"); ${CAP_NOTES[CAPS.CARD_VERDICTS]}`,
    );
  }
  if (corpusCase.screen != null && (corpusCase.screen.observations?.length ?? 0) > 0) {
    add(CAPS.SCREEN, CAP_NOTES[CAPS.SCREEN]);
  }
  if ((corpusCase.transcript?.volatile_tokens?.length ?? 0) > 0) {
    add(CAPS.STREAMING, CAP_NOTES[CAPS.STREAMING]);
  }
  if ((corpusCase.card_taps?.length ?? 0) > 0) {
    add(CAPS.CARD_TAPS, CAP_NOTES[CAPS.CARD_TAPS]);
  }
  if (corpusCase.proposed_call.repair_stage === 'constrained_reemit_result') {
    add(CAPS.REPAIR, CAP_NOTES[CAPS.REPAIR]);
  }
  if ((corpusCase.x_preconditions?.length ?? 0) > 0) {
    add(CAPS.PRECONDITION, CAP_NOTES[CAPS.PRECONDITION]);
  }

  const toolParams = TOOL_CATALOG[corpusCase.proposed_call.tool];
  if (toolParams === undefined) {
    add(CAPS.UNCATALOGED, `tool "${corpusCase.proposed_call.tool}" is not in the eval catalog`);
  } else {
    for (const param of Object.keys(corpusCase.proposed_call.params)) {
      const mapping: ParamMap | undefined = toolParams[param];
      if (mapping === undefined) {
        add(CAPS.UNCATALOGED, `param "${corpusCase.proposed_call.tool}.${param}" is not in the eval catalog`);
      } else if (mapping.kind === 'missing') {
        add(mapping.capability, `${corpusCase.proposed_call.tool}.${param}: ${mapping.note}`);
      } else if (mapping.kind === 'unmodeled') {
        unmodeled.push({ param, note: mapping.note });
      }
    }
  }

  return { runnable: missing.length === 0, missing, unmodeled };
}

/* ─────────────────────────────────── context construction ─────────────────────────────────── */

function entityKindOf(value: unknown): EntityKind | undefined {
  if (value === 'channel') return 'channel';
  if (value === 'group') return 'group';
  if (value === 'person' || value === 'user' || value === 'contact' || value === 'payee') return 'person';
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** STRUCTURAL referents only (S11.1). free_text never touches the pool. */
function targetFromStructural(output: PriorToolOutput): Target | undefined {
  const s = output.structural;
  if (s == null) return undefined;
  const type = s['type'];
  const aliasesRaw = Array.isArray(s['aliases']) ? (s['aliases'] as unknown[]).filter((a) => typeof a === 'string') as string[] : [];

  if (type === 'user' || type === 'contact') {
    const name = asString(s['name']);
    const id = asString(s['user_id']) ?? asString(s['email']) ?? name;
    if (id === undefined || name === undefined) return undefined;
    const aliases = [...aliasesRaw];
    const email = asString(s['email']);
    if (email !== undefined) aliases.push(email);
    return { id, label: name, kind: 'person', ...(aliases.length > 0 ? { aliases } : {}) };
  }
  if (type === 'payee') {
    const name = asString(s['name']);
    const id = asString(s['payee_id']) ?? name;
    if (id === undefined || name === undefined) return undefined;
    return { id, label: name, kind: 'person', ...(aliasesRaw.length > 0 ? { aliases: aliasesRaw } : {}) };
  }
  if (type === 'channel') {
    const name = asString(s['name']);
    const id = asString(s['channel_id']) ?? name;
    if (id === undefined || name === undefined) return undefined;
    const label = name.startsWith('#') ? name : `#${name}`;
    return { id, label, kind: 'channel', aliases: [name, ...aliasesRaw] };
  }
  return undefined; // messages/emails/events/files are non-entity referents (capability-gated upstream)
}

export function buildGateInput(corpusCase: CorpusCase): GateInput {
  const store = new GroundingStore();

  for (const output of corpusCase.prior_tool_outputs ?? []) {
    const target = targetFromStructural(output);
    if (target !== undefined) {
      store.rememberTargets([target], { kind: 'tool_output', tool: output.tool });
    }
  }

  const knownState = corpusCase.known_state ?? {};
  const workspaceChannels = knownState['workspace_channels'];
  if (Array.isArray(workspaceChannels)) {
    for (const entry of workspaceChannels as Array<Record<string, unknown>>) {
      const name = asString(entry['name']);
      const id = asString(entry['channel_id']) ?? name;
      if (name === undefined || id === undefined) continue;
      store.rememberTargets(
        [{ id, label: name.startsWith('#') ? name : `#${name}`, kind: 'channel', aliases: [name] }],
        { kind: 'known_state', tool: 'known_state' },
      );
    }
  }
  const knownTargets = knownState['targets'];
  if (Array.isArray(knownTargets)) {
    for (const entry of knownTargets as Array<Record<string, unknown>>) {
      const kind = entityKindOf(entry['kind']);
      const id = asString(entry['id']);
      const label = asString(entry['label']);
      if (kind === undefined || id === undefined || label === undefined) continue;
      const aliases = Array.isArray(entry['aliases']) ? (entry['aliases'] as string[]) : undefined;
      store.rememberTargets([{ id, label, kind, ...(aliases ? { aliases } : {}) }], { kind: 'known_state', tool: 'known_state' });
    }
  }

  for (const entry of corpusCase.x_screen_targets ?? []) {
    const kind = entityKindOf(entry.kind);
    if (kind === undefined) continue;
    store.rememberTargets(
      [{ id: entry.id, label: entry.label, kind, ...(entry.aliases ? { aliases: entry.aliases } : {}) }],
      { kind: 'screen' },
    );
  }

  const tier = (corpusCase.proposed_call.tier ?? 3) as 1 | 2 | 3;
  const toolParams = TOOL_CATALOG[corpusCase.proposed_call.tool] ?? {};
  const params: Record<string, ParamSpec> = {};
  const args: Record<string, unknown> = {};

  for (const [param, rawValue] of Object.entries(corpusCase.proposed_call.params)) {
    const mapping = toolParams[param];
    if (mapping === undefined || mapping.kind === 'missing' || mapping.kind === 'unmodeled') continue;
    if (mapping.kind === 'entity') {
      // S11.2 destination-slot rule is a Tier-3 rule; Tier-1/2 params stay plain routing.
      params[param] = {
        class: 'routing',
        required: true,
        ...(tier === 3 && mapping.slot !== undefined ? { slot: mapping.slot } : {}),
      };
    } else {
      params[param] = { class: 'content', required: true };
    }
    args[param] = typeof rawValue === 'string' ? rawValue : String(rawValue);
  }

  const tokens = corpusCase.transcript?.tokens ?? [];
  const call: ToolCall = {
    tool: corpusCase.proposed_call.tool,
    args,
    transcript: finalizeUtterance('u1', tokens.join(' ')),
  };

  return { call, contract: { tool: corpusCase.proposed_call.tool, tier, params }, store };
}
