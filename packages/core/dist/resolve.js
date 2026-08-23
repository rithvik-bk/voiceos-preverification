/* ────────────────────────────── entity resolution, ported ─────────────────────────────────
 *
 * PORTED from universal-voiceos-oauth/integrations/slack/resolve.ts (the 3 µs resolver,
 * RECON inventory §1.2): normalizeLoose/normalizeTight, bounded editDistance, runLadder
 * (exact → normalized → substring), nearestTargets, dedupeTargets, resolveTarget, and the
 * ambiguity-as-data shapes (Resolution, ResolveOk/ResolveMiss, CandidateSummary). Function
 * shapes kept recognizable on purpose.
 *
 * What was simplified away (Slack surface → adapter concern, recorded in skeleton-notes.md):
 *  - the C…/U… raw-id regex passthrough → replaced by pool-membership id match (an id the
 *    grounding store has never seen does NOT pass through in the core; a platform adapter
 *    that can verify foreign ids may add that back on its side);
 *  - the async directory fetch/TTL/miss-retry (getDirectory) → the pool arrives from the
 *    grounding store; fetching is adapter work;
 *  - Slack mrkdwn decode, conversations.open (person → DM channel) → adapter work.
 *
 * The invariant that makes this a gate and not a wall (DESIGN-SPEC §2 of the source repo):
 * a tier with 2+ matches is an ambiguity, never a coin flip; a miss returns REAL candidates
 * as data, never a guess. Levenshtein orders suggestions only — it never auto-picks.
 */
const CANDIDATES_SHOWN = 5;
export function normalizeLoose(value) {
    return value.trim().toLowerCase().replace(/^[#@]/, '');
}
export function normalizeTight(value) {
    return normalizeLoose(value).replace(/[^a-z0-9]/g, '');
}
/** Levenshtein, bounded — used ONLY to order suggestions, never to auto-pick a target. */
export function editDistance(a, b) {
    if (a === b)
        return 0;
    if (a.length > 40 || b.length > 40)
        return Math.abs(a.length - b.length);
    let previous = Array.from({ length: b.length + 1 }, (_unused, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= b.length; j += 1) {
            const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
            const deletion = (previous[j] ?? 0) + 1;
            const insertion = (current[j - 1] ?? 0) + 1;
            current.push(Math.min(substitution, deletion, insertion));
        }
        previous = current;
    }
    return previous[b.length] ?? Math.max(a.length, b.length);
}
function namesOf(target) {
    return [target.label, ...(target.aliases ?? [])];
}
function dedupeTargets(targets) {
    const seen = new Set();
    const unique = [];
    for (const target of targets) {
        const key = `${target.kind}:${target.id}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        unique.push(target);
    }
    return unique;
}
function runLadder(spoken, pool) {
    const loose = normalizeLoose(spoken);
    const tightForm = normalizeTight(spoken);
    if (loose === '')
        return null;
    const tiers = [
        {
            tier: 'exact',
            matches: pool.filter((target) => namesOf(target).some((name) => normalizeLoose(name) === loose)),
        },
        {
            tier: 'normalized',
            matches: pool.filter((target) => namesOf(target).some((name) => normalizeTight(name) === tightForm)),
        },
        {
            tier: 'substring',
            matches: pool.filter((target) => namesOf(target).some((name) => normalizeTight(name).includes(tightForm))),
        },
    ];
    for (const entry of tiers) {
        const unique = dedupeTargets(entry.matches);
        if (unique.length > 0)
            return { tier: entry.tier, matches: unique };
    }
    return null;
}
/** Nearest real names by bounded Levenshtein — suggestions on a card, never acted on. */
function nearestTargets(spoken, pool) {
    const tightForm = normalizeTight(spoken);
    if (tightForm === '')
        return [];
    return dedupeTargets([...pool]
        .map((target) => ({
        target,
        distance: Math.min(...namesOf(target).map((name) => editDistance(normalizeTight(name), tightForm))),
    }))
        .filter((entry) => entry.distance <= Math.max(2, Math.round(tightForm.length / 3)))
        .sort((a, b) => a.distance - b.distance)
        .map((entry) => entry.target)).slice(0, CANDIDATES_SHOWN);
}
export function candidateSummary(target) {
    return { name: target.label, kind: target.kind, id: target.id };
}
/**
 * Spoken name → exactly one target out of a prebuilt pool, or a disambiguation list.
 * Tiered and strictly ordered (source repo DESIGN-SPEC §2 / RESOLVER-DESIGN §4):
 * known-id passthrough → exact → normalized → substring → nearest-names miss.
 * A tier with 2+ matches is an ambiguity, never a coin flip.
 */
export function resolveTarget(spoken, pool) {
    const raw = spoken.trim();
    if (raw === '')
        return { candidates: [], reason: 'not_found' };
    // Tier 0: an id the grounding store already holds passes through (label preserved).
    const known = pool.find((target) => target.id === raw);
    if (known !== undefined)
        return { match: known, candidates: [known], reason: 'match' };
    const hit = runLadder(raw, pool);
    if (hit !== null) {
        if (hit.matches.length === 1) {
            return { match: hit.matches[0], candidates: hit.matches, reason: 'match' };
        }
        return { candidates: hit.matches.slice(0, CANDIDATES_SHOWN), reason: 'ambiguous' };
    }
    return { candidates: nearestTargets(raw, pool), reason: 'not_found' };
}
//# sourceMappingURL=resolve.js.map