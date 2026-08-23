/* ─────────────────────────────────── THE AMOUNT CATCH ───────────────────────────────────
 *
 * Jonah's exact case, on the REAL @preflight/core gate. You say "$54.79"; the model re-types the
 * refund and emits "$54.99". Preflight compares the amount to the spoken number-set and holds —
 * because 54.99 was never in what you said. No AI, no network, deterministic.
 *
 * Every verdict below is produced by `runGate` from packages/core — nothing hand-faked. The same
 * behavior is pinned by core/test/misbinding.test.ts ("number-twin: an amount that was never
 * spoken → amount_not_in_speech (HOLD)"). Run it yourself:  node amount-catch.mjs
 *
 * DETERMINISM: no Date.now, no Math.random. Same code → identical output every run.
 */

import { runGate, finalizeUtterance, GroundingStore, REFUND } from '../core/src/index.ts';

/* The session's known customers, grounded the way a real session grounds them: by a read
 * (a customer-list lookup). "Dan" is a real, licensed recipient. */
function refundStore() {
  const store = new GroundingStore();
  store.rememberTargets(
    [
      { id: 'U0DAN', label: 'Dan', kind: 'person', aliases: ['dan'] },
      { id: 'U0SARAH', label: 'Sarah', kind: 'person', aliases: ['sarah'] },
    ],
    { kind: 'tool_output', tool: 'list_customers' },
  );
  return store;
}

function refund(utterance, recipient, amount) {
  return { tool: 'refund', args: { recipient, amount }, transcript: finalizeUtterance('u1', utterance) };
}

/* ANSI (skip with NO_COLOR) */
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const BOLD = '1', DIM = '2', GRN = '32', RED = '31', YEL = '33', CYN = '36';
const line = (ch) => ch.repeat(88);
const out = [];
const p = (s = '') => out.push(s);

function scene(title, utterance, recipient, amount, repair) {
  const verdict = runGate(refund(utterance, recipient, amount), REFUND, refundStore());
  p(c(CYN, line('━')));
  p(c(BOLD, `  ${title}`));
  p('');
  p(`  you said:         ${c(GRN, `"${utterance}"`)}`);
  p(`  model proposed:   ${c(amount === '$54.79' || amount === '$30' ? GRN : RED, `refund(recipient="${recipient}", amount="${amount}")`)}`);
  p('');
  if (verdict.verdict === 'pass') {
    p(`  PREFLIGHT:        ${c(GRN, '✔ PASS — fires instantly (both values trace to your speech)')}`);
    for (const [name, r] of Object.entries(verdict.receipt.params)) {
      const src = r.class === 'routing'
        ? `licensed by a ${(r.sources[0]?.kind ?? 'transcript_span')}${r.resolved ? ` → ${r.resolved.label}` : ''}`
        : `content — ${r.disposition}`;
      p(c(DIM, `      ${r.class === 'routing' ? '✔' : '·'} ${name.padEnd(10)} (${r.class})  ◄ ${src}`));
    }
  } else {
    p(`  PREFLIGHT:        ${c(YEL, `⏸ HOLD — [${verdict.code}]`)}`);
    p(c(DIM, `      the amount "${amount}" is not in the spoken number-set — you never said it.`));
    p(c(DIM, `      (hard inequality: ${amount.replace('$', '')} ∉ the numbers in your transcript — no tolerance to slip under.)`));
    p('');
    p(`  spoken repair:    ${c(YEL, `“${repair}”`)}  ${c(DIM, '(the app phrases this; the gate supplies the discrepancy)')}`);
  }
  p('');
}

p('');
p(c(BOLD, '  PREFLIGHT — the amount catch   (real @preflight/core gate, deterministic, no AI)'));
p('');

/* 1 — the clean case: the spoken amount fires with zero friction (proof it is not a nag). */
scene(
  '1.  You say $54.79, the model gets it right',
  'refund Dan $54.79',
  'Dan',
  '$54.79',
);

/* 2 — Jonah's case: the model re-typed 79 → 99. Held. */
scene(
  "2.  You say $54.79, the model re-types $54.99  (Jonah's case)",
  'refund Dan $54.79',
  'Dan',
  '$54.99',
  'You said fifty-four seventy-nine — I have fifty-four ninety-nine. Which amount should I refund?',
);

p(c(CYN, line('━')));
p(c(BOLD, '  WHY THIS IS NOT "AN AI CHECKING AN AI"'));
p(c(DIM, '  The check is: parse the numbers out of your transcript → {54.79}; is the action\'s 54.99 in'));
p(c(DIM, '  that set? No → hold. A number-parse and a set-membership test. A person can run it by hand;'));
p(c(DIM, '  same input → same output, forever. No model, no probability, nothing to hallucinate.'));
p('');
p(c(DIM, '  Pinned by:  packages/core/test/misbinding.test.ts   ·   Run:  node --test ../core/test/misbinding.test.ts'));
p('');

console.log(out.join('\n'));
