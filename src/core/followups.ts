import { CONFIG } from '../content/config';
import { ELEMENTS, elementDef } from '../content/elements';
import { dealToEnemy, drawCards, gainBlock, lowestHpEnemy } from './combat';
import { PAIR_DEF } from './forge';
import type { IdGen } from './cards';
import type { Rng } from './rng';
import type { CombatState, ForgedCard, GameEvent } from './types';

// Water- or air-coloured defIds, derived from content: tier-2 water/air variants
// plus every tier-3 pairing that includes water or air (per PAIR_DEF).
const WET_DEFS: ReadonlySet<string> = new Set([
  ...Object.keys(ELEMENTS).filter((id) => id.startsWith('water-') || id.startsWith('air-')),
  ...Object.entries(PAIR_DEF)
    .filter(([pair]) => pair.includes('water') || pair.includes('air'))
    .map(([, defId]) => defId),
]);

export function onActivated(
  cs: CombatState, rng: Rng, idGen: IdGen, card: ForgedCard, events: GameEvent[],
): void {
  const def = elementDef(card.defId);
  const count = cs.activationCounts[card.defId] ?? 0;
  const f = def.followup;
  if (!f) { maybeFlood(cs, rng, idGen, events); return; }
  if (f.kind === 'activations') {
    if (count === f.count) {
      for (const atom of f.atoms) {
        if (atom.op === 'damage') {
          const t = lowestHpEnemy(cs);
          if (t) dealToEnemy(cs, t.id, atom.amount, events);
        } else if (atom.op === 'draw') drawCards(cs, rng, idGen, atom.amount, events, card);
        else if (atom.op === 'block') gainBlock(cs, atom.amount);
      }
      events.push({ type: 'followup', text: `${def.name} follows up.`, data: { defId: def.id } });
    }
  } else {
    switch (f.special) {
      case 'storm':
        if (count === 2) drawCards(cs, rng, idGen, 2, events, card);
        break;
      case 'ash':
        if (count >= 2) for (const id of cs.smokeHits) dealToEnemy(cs, id, 1, events);
        break;
      case 'ocean':
        if (count === 2) cs.freeDecombines += 1;
        break;
      case 'pressure':
        if (count >= 2) cs.freeDecombines += 1;
        break;
      default: break; // end-of-round specials handled below
    }
  }
  maybeFlood(cs, rng, idGen, events);
}

// flood: 3rd water/air-coloured activation in a round, if a rain is in hand
function maybeFlood(cs: CombatState, rng: Rng, idGen: IdGen, events: GameEvent[]): void {
  const rain = cs.hand.find((c) => c.kind === 'forged' && c.defId === 'rain') as ForgedCard | undefined;
  if (!rain) return;
  let wet = 0;
  for (const [defId, n] of Object.entries(cs.activationCounts)) {
    if (WET_DEFS.has(defId)) wet += n;
  }
  if (wet === 3) {
    events.push({ type: 'followup', text: 'The flood breaks.', data: { defId: 'rain' } });
    drawCards(cs, rng, idGen, 2, events, rain);
    const t = lowestHpEnemy(cs);
    if (t) dealToEnemy(cs, t.id, 2, events);
  }
}

export function getDeflection(cs: CombatState): number {
  let d = 0;
  const dust = Math.min(cs.charges['dust'] ?? 0, CONFIG.dustDeflectTable.length - 1);
  d += CONFIG.dustDeflectTable[dust]!;
  const attached = cs.enemies.flatMap((e) => e.attachments);
  // spec: 1 per attached card (any element), gated on 2+ land
  if (attached.filter((a) => a.defId === 'land').length >= 2) d += attached.length;
  return d;
}

export function onEndOfRound(cs: CombatState, rng: Rng, idGen: IdGen, events: GameEvent[]): void {
  // eruption
  const vol = cs.charges['volcano'] ?? 0;
  if (vol >= CONFIG.volcanoEruptThreshold) {
    let dmg = 3 + vol;
    events.push({ type: 'followup', text: 'The volcano erupts!', data: { defId: 'volcano' } });
    const targets = () => cs.enemies.filter((e) => e.hp > 0)
      .sort((a, b) => a.hp - b.hp).slice(0, vol);
    while (dmg > 0 && targets().length > 0) {
      const t = targets().reduce((a, b) => (b.hp < a.hp ? b : a));
      dealToEnemy(cs, t.id, 1, events);
      dmg -= 1;
    }
    cs.charges['volcano'] = 0;
  }
  // lava
  for (const enemy of cs.enemies.filter((e) => e.hp > 0)) {
    if (enemy.attachments.length >= 2 && enemy.attachments.some((a) => a.defId === 'magma')) {
      dealToEnemy(cs, enemy.id, enemy.attachments.length, events);
    }
  }
  // forest
  const trees = cs.defenders.filter((d) => d.defId === 'tree').length;
  if (trees >= 3) gainBlock(cs, trees);
}
