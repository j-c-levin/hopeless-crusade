import { elementDef } from '../content/elements';
import type { Atom } from '../content/elements';

function atomText(a: Atom): string {
  switch (a.op) {
    case 'damage': return `deal ${a.amount} damage`;
    case 'draw': return `draw ${a.amount}`;
    case 'block': return `gain ${a.amount} block`;
    case 'attach': return 'attach to the target enemy';
    case 'decombine': return 'decombine a forged card';
    case 'discard': return `discard ${a.amount}`;
    case 'charge': return 'gain a charge';
    case 'freeMerge': return 'grant a free merge this turn';
    default: return '';
  }
}

/**
 * Human-readable ability text for an element def, generated from its data (the
 * onActivate atoms plus passive fields) rather than hand-written per defId, so the
 * wording can never drift from the actual mechanics. Shared by the origin screen;
 * combat.ts could adopt this too (its own cardLabel/markBadges stay separate — this
 * only covers the "what does activating this do" text).
 */
export function describeDef(defId: string): string {
  const def = elementDef(defId);
  const parts: string[] = [`Activate: ${def.onActivate.map(atomText).join(', ')}.`];
  if (def.onDrawDamage) parts.push(`Deals ${def.onDrawDamage} whenever this card causes you to draw.`);
  if (def.onCombineDamage) parts.push(`Deals ${def.onCombineDamage} whenever you merge in combat.`);
  if (def.retaliate) parts.push(`While attached, retaliates for ${def.retaliate} when you take damage.`);
  if (def.defender) parts.push(`Can defend, with ${def.defender.health} health.`);
  if (def.followup) {
    if (def.followup.kind === 'activations') {
      parts.push(
        `Every ${def.followup.count} activations of this line in a round: ${def.followup.atoms.map(atomText).join(', ')}.`,
      );
    } else {
      parts.push(`Follow-up: triggers a ${def.followup.special} effect.`);
    }
  }
  return parts.join(' ');
}
