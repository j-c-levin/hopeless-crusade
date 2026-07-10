export type Colour = 'red' | 'yellow' | 'blue' | 'green';
export type Element = 'fire' | 'earth' | 'air' | 'water';
export type Suit = 'diamonds' | 'hearts' | 'clubs' | 'spades';
export type RankClass = 'tower' | 'stronghold' | 'fortress' | 'manifestation';
export type MarkType = 'famished' | 'plagued' | 'scarred' | 'doomed';
export type MarkRecord = Partial<Record<MarkType, number>>;

export interface RawCard {
  kind: 'raw'; id: string; colour: Colour; value: number; marks: MarkRecord;
}
export interface ForgedCard {
  kind: 'forged'; id: string; tier: 2 | 3; defId: string;
  colours: Colour[]; constituents: Card[]; marks: MarkRecord;
}
export interface CorruptionCard {
  kind: 'corruption'; id: string; suit: Suit; rank: RankClass; marks: MarkRecord;
}
export type Card = RawCard | ForgedCard | CorruptionCard;

export interface GameEvent { type: string; text: string; data?: Record<string, unknown> }

export const COLOUR_ELEMENT: Record<Colour, Element> = {
  red: 'fire', yellow: 'earth', blue: 'air', green: 'water',
};
export const ELEMENT_COLOUR: Record<Element, Colour> = {
  fire: 'red', earth: 'yellow', air: 'blue', water: 'green',
};

export interface Enemy {
  id: string; suit: Suit; rank: RankClass;
  hp: number; maxHp: number; power: number;
  attachments: { cardId: string; defId: string }[];
  echoed: boolean;                      // war-manifestation respawn used
}
export interface EnemySpec { suit: Suit; rank: RankClass; hp: number }
export interface PendingChoice {
  id: string; prompt: string; options: { id: string; label: string }[];
}
export interface CombatState {
  outcome: 'ongoing' | 'won' | 'lost';
  round: number; hp: number; handSize: number; block: number;
  hand: Card[]; drawPile: Card[]; discardPile: Card[];
  attachedCards: Card[]; defenders: { cardId: string; defId: string; hp: number }[];
  enemies: Enemy[];
  activatedThisRound: string[];               // card ids
  activationCounts: Record<string, number>;   // defId -> activations this round
  charges: Record<string, number>;            // defId -> persistent charges
  freeMerges: number; freeDecombines: number;
  scrapSealed: boolean; lockedElements: Element[];
  smokeHits: string[];                        // enemy ids hit by smoke this round
  plagueAura: boolean;                        // disease manifestation
  clock?: number;                             // famine manifestation countdown
  deathCounter: number;
  struggles: string[]; relics: string[];
  pendingChoice?: PendingChoice;
  pendingPenalty?: { kind: string; targetCardId?: string };
  // Draws deferred because a corruption card drawn mid-batch set a pendingChoice: the
  // remaining count of a drawCards() call that stopped early, resumed by resolveChoice
  // once the choice is answered. pendingDrawDefId carries the original draw's source
  // defId through the pause (for onDrawDamage cards like air-7..9/wind/rain).
  pendingDraws: number;
  pendingDrawDefId?: string;
  recoil: boolean;                            // war-stronghold: player takes 1 whenever dealing enemy damage this round
  // relics: once-per-fight flags (not reset per round)
  emberheartUsed: boolean; springwellUsed: boolean; tidalCharmUsed: boolean;
  // per-round element activation counter (defId -> colours -> element), reset each round in endTurn;
  // drives the "Nth element-line activation this round" relics (kindling/tailwind/bulwark) — kept as
  // its own counter rather than derived from activationCounts (keyed by defId) + colour lookups.
  elementActivations: Record<Element, number>;
}
