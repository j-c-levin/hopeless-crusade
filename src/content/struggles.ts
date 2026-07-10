import type { Rng } from '../core/rng';
import type { Suit } from '../core/types';

export interface StruggleDef { id: string; domain: Suit; name: string; text: string }

// Spec §4.3 + §5 axes: twelve struggles, three per domain — a direct transcription of the table.
export const STRUGGLES: Record<string, StruggleDef> = {
  rationing: {
    id: 'rationing', domain: 'diamonds', name: 'Rationing',
    text: 'Hand size −1 this fight.',
  },
  tithe: {
    id: 'tithe', domain: 'diamonds', name: 'Tithe',
    text: 'Start of each round: discard the cheapest raw or take 1 damage.',
  },
  'empty-stores': {
    id: 'empty-stores', domain: 'diamonds', name: 'Empty Stores',
    text: 'Hail mary is disabled.',
  },
  fevered: {
    id: 'fevered', domain: 'hearts', name: 'Fevered',
    text: 'The first activation each round costs +1 any-colour fuel.',
  },
  contagion: {
    id: 'contagion', domain: 'hearts', name: 'Contagion',
    text: 'Combat starts with a random forged card in the deck plagued.',
  },
  quarantine: {
    id: 'quarantine', domain: 'hearts', name: 'Quarantine',
    text: 'A random element is locked each round.',
  },
  crossfire: {
    id: 'crossfire', domain: 'clubs', name: 'Crossfire',
    text: 'Killing an enemy deals 1 recoil to you.',
  },
  siege: {
    id: 'siege', domain: 'clubs', name: 'Siege',
    text: 'Enemies have +1 power.',
  },
  attrition: {
    id: 'attrition', domain: 'clubs', name: 'Attrition',
    text: 'End of each round: discard a random card from hand.',
  },
  'creeping-end': {
    id: 'creeping-end', domain: 'spades', name: 'Creeping End',
    text: 'Every 3rd round, doom a random hand card.',
  },
  'cold-grip': {
    id: 'cold-grip', domain: 'spades', name: 'Cold Grip',
    text: 'Block gained is halved (round down).',
  },
  toll: {
    id: 'toll', domain: 'spades', name: 'Toll',
    text: 'Every reshuffle exiles the top card of the new draw pile.',
  },
};

export function strugglesFor(domain: Suit): StruggleDef[] {
  return Object.values(STRUGGLES).filter((s) => s.domain === domain);
}

// Deals pick+1 options when the domain has that many (12 struggles = 3 per domain),
// capping at the domain's full set when pick+1 would exceed it.
export function dealStruggleChoices(
  rng: Rng, domain: Suit, pickCount: number,
): { options: StruggleDef[]; pick: number } {
  const all = strugglesFor(domain);
  const pick = Math.min(pickCount, all.length);
  const wantCount = Math.min(pickCount + 1, all.length);
  const options = rng.shuffle(all).slice(0, wantCount);
  return { options, pick };
}
