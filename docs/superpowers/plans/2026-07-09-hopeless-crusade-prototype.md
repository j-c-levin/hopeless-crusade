# Hopeless Crusade Prototype — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable browser prototype of Hopeless Crusade — the solo reverse deck builder specified in `docs/superpowers/specs/2026-07-09-hopeless-crusade-design.md` — with a headless core engine, data-driven content, a simulation harness, and a DOM UI.

**Architecture:** `src/core/` is a pure, deterministic, headless engine (seeded RNG stored in state; state in → events out; no I/O, no DOM). `src/content/` holds every card definition, enemy table, struggle, relic, and tuning number as data. `src/sim/` runs bot-driven headless games for balancing. `src/ui/` is a dumb DOM renderer that dispatches engine commands. Core never imports ui.

**Tech Stack:** TypeScript (strict), Vite, Vitest (+ happy-dom for UI smoke tests), vite-node for the sim CLI. Zero runtime dependencies.

## Global Constraints

- The spec at `docs/superpowers/specs/2026-07-09-hopeless-crusade-design.md` is the authority for rules; read the referenced section before implementing a task.
- Node ≥ 20, npm. Dev dependencies only: `typescript`, `vite`, `vitest`, `vite-node`, `happy-dom`. No runtime dependencies.
- TypeScript `strict: true`. No `any` except in test scaffolding.
- No `Math.random`, `Date.now`, or `new Date()` anywhere under `src/` — all randomness flows through `Rng` (spec §9.2). (`Math.imul` inside the Rng implementation is fine.)
- `src/core/` and `src/content/` must never import from `src/ui/`.
- Every tuning number comes from `src/content/config.ts` (spec §10) — never inline a magic number that the spec lists as a tuning value.
- Colour→element mapping everywhere: red=fire, yellow=earth, blue=air, green=water (spec §2.2).
- Fuel matching is **strict colour** (spec §3.2); the config carries a `fuelMatching` switch (`'strict' | 'any' | 'bonus'`) but only `'strict'` needs to work in v1 — the switch exists so variants can be added without API change.
- Commit after every task (steps include the commands). Work happens on the current branch `worktree-design-spec`.

## File Structure

```
package.json / tsconfig.json / vite.config.ts / index.html
src/
  core/
    rng.ts         seeded PRNG (mulberry32): next/int/pick/shuffle
    types.ts       Card, Colour, Suit, marks, enemies, events, state shapes
    cards.ts       starting-deck factory, id generation, card helpers
    forge.ts       tier-2/tier-3 merge legality + forging + unmerge
    combat.ts      combat state, turn loop, commands, effect interpreter
    followups.ts   followup counters + bespoke followup resolution
    marks.ts       mark application, on-draw escalation, cleanse
    corruption.ts  corruption card triggers per suit/rank, pending choices
    map.ts         campaign map generation, movement, scouting
    rewards.ts     reward points, suit rewards, relic purchase
    forgewindow.ts between-fight forge window phase
    run.ts         run state machine (origin draft → … → victory/defeat), serialize
  content/
    config.ts      every tuning value from spec §10
    elements.ts    4 tier-2 elements × 3 variants + 10 tier-3 defs (spec §2.2–2.3)
    struggles.ts   struggle lists per domain (spec §4.3, §5 axes)
    relics.ts      elemental followup relics (spec §7)
  sim/
    bot.ts         greedy bot policy: RunState → RunCommand
    simulate.ts    N seeded headless runs → SimStats
    cli.ts         vite-node entry: npm run sim
  ui/
    store.ts       run + dispatch + re-render loop
    screens/       one render function per phase
    forecast.ts    "what can you still forge" + fuel-starvation warnings
    style.css
tests/             *.test.ts mirroring src paths
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/ui/main.ts`, `tests/smoke.test.ts`, `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` (vitest), `npm run dev` (vite), `npm run sim` (vite-node, wired in Task 18).

- [ ] **Step 1: Write the config files**

`package.json`:
```json
{
  "name": "hopeless-crusade",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "sim": "vite-node src/sim/cli.ts --"
  },
  "devDependencies": {
    "happy-dom": "^15.0.0",
    "typescript": "~5.6.0",
    "vite": "^5.4.0",
    "vite-node": "^2.1.0",
    "vitest": "^2.1.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/ui/**', 'happy-dom']],
  },
} as never);
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hopeless Crusade</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/ui/main.ts"></script>
  </body>
</html>
```

`src/ui/main.ts`:
```ts
const app = document.querySelector<HTMLDivElement>('#app')!;
app.textContent = 'Hopeless Crusade — nothing here yet.';
```

`.gitignore`:
```
node_modules
dist
```

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('scaffold', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Install and run the test**

Run: `npm install && npm test`
Expected: 1 test file, 1 passed.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + typescript + vitest project"
```

---

### Task 2: Seeded RNG

**Files:**
- Create: `src/core/rng.ts`
- Test: `tests/core/rng.test.ts`

**Interfaces:**
- Produces: `class Rng { constructor(state: number); state: number; next(): number; int(maxExclusive: number): number; pick<T>(arr: readonly T[]): T; shuffle<T>(arr: readonly T[]): T[] }`. `state` is serializable; a re-constructed Rng with the same state continues the same sequence.

- [ ] **Step 1: Write the failing test**

`tests/core/rng.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('resumes from serialized state', () => {
    const a = new Rng(7);
    a.next();
    const b = new Rng(a.state);
    expect(b.next()).toBe(a.next());
  });

  it('int stays in range', () => {
    const r = new Rng(1);
    for (let i = 0; i < 200; i++) {
      const n = r.int(5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
    }
  });

  it('shuffle is a permutation and does not mutate input', () => {
    const r = new Rng(3);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/rng.test.ts`
Expected: FAIL — cannot find module `src/core/rng`.

- [ ] **Step 3: Implement**

`src/core/rng.ts`:
```ts
/** mulberry32 — small, fast, deterministic, serializable via `state`. */
export class Rng {
  constructor(public state: number) {}

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(arr: readonly T[]): T {
    const v = arr[this.int(arr.length)];
    if (v === undefined) throw new Error('pick from empty array');
    return v;
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/rng.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/rng.ts tests/core/rng.test.ts
git commit -m "feat: seeded mulberry32 rng"
```

---

### Task 3: Core types and the starting deck

**Files:**
- Create: `src/core/types.ts`, `src/core/cards.ts`
- Test: `tests/core/cards.test.ts`

**Interfaces:**
- Produces (in `types.ts` — later tasks import these exact names):

```ts
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
```

- Produces (in `cards.ts`):

```ts
export interface IdGen { n: number }               // serializable counter
export function nextId(gen: IdGen, prefix: string): string;  // e.g. 'c17'
export function makeStartingDeck(gen: IdGen): RawCard[];     // 76 raws
export function isRaw(c: Card): c is RawCard;
export function isForged(c: Card): c is ForgedCard;
export function isCorruption(c: Card): c is CorruptionCard;
export function findCard(cards: Card[], id: string): Card;   // throws if missing
export function removeCard(cards: Card[], id: string): Card; // splices + returns, throws if missing
```

- [ ] **Step 1: Write the failing test**

`tests/core/cards.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { makeStartingDeck, nextId, removeCard } from '../../src/core/cards';
import type { Colour } from '../../src/core/types';

describe('starting deck', () => {
  it('has 76 raws with standard Uno duplication', () => {
    const deck = makeStartingDeck({ n: 1 });
    expect(deck).toHaveLength(76);
    const colours: Colour[] = ['red', 'yellow', 'blue', 'green'];
    for (const colour of colours) {
      const ofColour = deck.filter((c) => c.colour === colour);
      expect(ofColour).toHaveLength(19); // one 0, two each of 1–9
      expect(ofColour.filter((c) => c.value === 0)).toHaveLength(1);
      for (let v = 1; v <= 9; v++) {
        expect(ofColour.filter((c) => c.value === v)).toHaveLength(2);
      }
    }
  });

  it('gives every card a unique id and empty marks', () => {
    const deck = makeStartingDeck({ n: 1 });
    expect(new Set(deck.map((c) => c.id)).size).toBe(76);
    expect(deck.every((c) => c.kind === 'raw' && Object.keys(c.marks).length === 0)).toBe(true);
  });

  it('removeCard splices and returns', () => {
    const deck = makeStartingDeck({ n: 1 });
    const target = deck[10]!;
    const got = removeCard(deck, target.id);
    expect(got.id).toBe(target.id);
    expect(deck).toHaveLength(75);
    expect(() => removeCard(deck, 'nope')).toThrow();
  });

  it('nextId increments the serializable counter', () => {
    const gen = { n: 5 };
    expect(nextId(gen, 'c')).toBe('c5');
    expect(nextId(gen, 'c')).toBe('c6');
    expect(gen.n).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/cards.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/core/types.ts`: exactly the block from **Interfaces** above (it is complete — copy it verbatim).

`src/core/cards.ts`:
```ts
import type { Card, Colour, CorruptionCard, ForgedCard, RawCard } from './types';

export interface IdGen { n: number }

export function nextId(gen: IdGen, prefix: string): string {
  return `${prefix}${gen.n++}`;
}

const COLOURS: Colour[] = ['red', 'yellow', 'blue', 'green'];

export function makeStartingDeck(gen: IdGen): RawCard[] {
  const deck: RawCard[] = [];
  for (const colour of COLOURS) {
    const values = [0, ...Array.from({ length: 9 }, (_, i) => i + 1).flatMap((v) => [v, v])];
    for (const value of values) {
      deck.push({ kind: 'raw', id: nextId(gen, 'c'), colour, value, marks: {} });
    }
  }
  return deck;
}

export const isRaw = (c: Card): c is RawCard => c.kind === 'raw';
export const isForged = (c: Card): c is ForgedCard => c.kind === 'forged';
export const isCorruption = (c: Card): c is CorruptionCard => c.kind === 'corruption';

export function findCard(cards: Card[], id: string): Card {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`card not found: ${id}`);
  return c;
}

export function removeCard(cards: Card[], id: string): Card {
  const i = cards.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(`card not found: ${id}`);
  return cards.splice(i, 1)[0]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/cards.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/cards.ts tests/core/cards.test.ts
git commit -m "feat: core card types and 76-raw starting deck"
```

---

### Task 4: Tier-2 forging rules

**Files:**
- Create: `src/core/forge.ts`
- Test: `tests/core/forge.test.ts`

Spec: §2.2 — merge any number of raws of a single colour summing to exactly 7, 8, or 9; the total selects the variant; defId is `<element>-<total>` (e.g. `fire-8`).

**Interfaces:**
- Consumes: `types.ts`, `cards.ts` (Task 3).
- Produces:

```ts
export function tier2Target(cards: Card[]): { colour: Colour; total: 7 | 8 | 9 } | null;
// null unless: ≥1 card, all raw, all one colour, sum ∈ {7,8,9}
export function forgeTier2(cards: RawCard[], id: string): ForgedCard;
// throws if tier2Target is null; defId = `${COLOUR_ELEMENT[colour]}-${total}`
```

- [ ] **Step 1: Write the failing test**

`tests/core/forge.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tier2Target, forgeTier2 } from '../../src/core/forge';
import type { RawCard } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});

describe('tier-2 forging', () => {
  it('accepts one-colour sums of 7, 8, 9', () => {
    expect(tier2Target([raw('a', 'red', 3), raw('b', 'red', 5)])).toEqual({ colour: 'red', total: 8 });
    expect(tier2Target([raw('a', 'blue', 7)])).toEqual({ colour: 'blue', total: 7 });
    expect(tier2Target([raw('a', 'green', 2), raw('b', 'green', 3), raw('c', 'green', 4)]))
      .toEqual({ colour: 'green', total: 9 });
  });

  it('rejects wrong sums, mixed colours, empty, non-raws', () => {
    expect(tier2Target([raw('a', 'red', 3), raw('b', 'red', 3)])).toBeNull();       // 6
    expect(tier2Target([raw('a', 'red', 5), raw('b', 'red', 5)])).toBeNull();       // 10
    expect(tier2Target([raw('a', 'red', 3), raw('b', 'blue', 5)])).toBeNull();      // mixed
    expect(tier2Target([])).toBeNull();
  });

  it('forges a tier-2 card with the right defId and constituents', () => {
    const parts = [raw('a', 'yellow', 4), raw('b', 'yellow', 5)];
    const card = forgeTier2(parts, 'f1');
    expect(card).toMatchObject({
      kind: 'forged', tier: 2, id: 'f1', defId: 'earth-9', colours: ['yellow'],
    });
    expect(card.constituents.map((c) => c.id)).toEqual(['a', 'b']);
    expect(() => forgeTier2([raw('x', 'red', 2)], 'f2')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/forge.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/core/forge.ts`:
```ts
import { COLOUR_ELEMENT } from './types';
import type { Card, Colour, ForgedCard, RawCard } from './types';

const TOTALS = [7, 8, 9] as const;

export function tier2Target(cards: Card[]): { colour: Colour; total: 7 | 8 | 9 } | null {
  if (cards.length === 0) return null;
  if (!cards.every((c): c is RawCard => c.kind === 'raw')) return null;
  const colour = cards[0]!.colour;
  if (!cards.every((c) => c.colour === colour)) return null;
  const total = cards.reduce((s, c) => s + c.value, 0);
  if (!TOTALS.includes(total as 7 | 8 | 9)) return null;
  return { colour, total: total as 7 | 8 | 9 };
}

export function forgeTier2(cards: RawCard[], id: string): ForgedCard {
  const target = tier2Target(cards);
  if (!target) throw new Error('illegal tier-2 merge');
  return {
    kind: 'forged', id, tier: 2,
    defId: `${COLOUR_ELEMENT[target.colour]}-${target.total}`,
    colours: [target.colour],
    constituents: cards,
    marks: {},
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/forge.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/forge.ts tests/core/forge.test.ts
git commit -m "feat: tier-2 forging (single colour, sum 7/8/9)"
```

---

### Task 5: Tier-3 forging and un-merging

**Files:**
- Modify: `src/core/forge.ts`
- Test: `tests/core/forge3.test.ts`

Spec: §2.3 (pair table), §2.4 (un-merge burns one constituent). The plague-contagion variant of merging is added in Task 11 — here, plain rules only.

**Interfaces:**
- Produces (appended to `forge.ts`):

```ts
export const PAIR_DEF: Record<string, string>;
// key = the two elements sorted alphabetically joined by '+', e.g. 'air+fire' → 'smoke'
export function tier3DefId(a: ForgedCard, b: ForgedCard): string | null;
// null unless both are tier 2
export function forgeTier3(a: ForgedCard, b: ForgedCard, id: string): ForgedCard;
// colours = union of both cards' colours (sorted, deduped); constituents = [a, b]
export function unmerge(card: ForgedCard, burnConstituentId: string):
  { returned: Card[]; burned: Card };
// returned = constituents minus the burned one; throws if id not a constituent
```

- [ ] **Step 1: Write the failing test**

`tests/core/forge3.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { forgeTier2, forgeTier3, tier3DefId, unmerge } from '../../src/core/forge';
import type { RawCard } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});
const t2 = (id: string, colour: RawCard['colour']) =>
  forgeTier2([raw(`${id}a`, colour, 3), raw(`${id}b`, colour, 5)], id);

describe('tier-3 forging', () => {
  it('maps every element pair to its variation', () => {
    expect(tier3DefId(t2('x', 'blue'), t2('y', 'blue'))).toBe('wind');     // air+air
    expect(tier3DefId(t2('x', 'blue'), t2('y', 'red'))).toBe('smoke');     // air+fire
    expect(tier3DefId(t2('x', 'yellow'), t2('y', 'yellow'))).toBe('land'); // earth+earth
    expect(tier3DefId(t2('x', 'blue'), t2('y', 'yellow'))).toBe('dust');   // air+earth
    expect(tier3DefId(t2('x', 'red'), t2('y', 'yellow'))).toBe('magma');   // earth+fire
    expect(tier3DefId(t2('x', 'green'), t2('y', 'yellow'))).toBe('tree');  // earth+water
    expect(tier3DefId(t2('x', 'red'), t2('y', 'red'))).toBe('volcano');    // fire+fire
    expect(tier3DefId(t2('x', 'green'), t2('y', 'green'))).toBe('lake');   // water+water
    expect(tier3DefId(t2('x', 'blue'), t2('y', 'green'))).toBe('rain');    // air+water
    expect(tier3DefId(t2('x', 'red'), t2('y', 'green'))).toBe('steam');    // fire+water
  });

  it('rejects tier-3 inputs', () => {
    const a = t2('x', 'red');
    const b = t2('y', 'red');
    const v = forgeTier3(a, b, 'v1');
    expect(tier3DefId(v, t2('z', 'red'))).toBeNull();
  });

  it('forges with union colours and both constituents', () => {
    const card = forgeTier3(t2('x', 'red'), t2('y', 'green'), 'v1');
    expect(card).toMatchObject({ tier: 3, defId: 'steam' });
    expect(card.colours).toEqual(['green', 'red']);
    expect(card.constituents).toHaveLength(2);
  });

  it('unmerge burns exactly one chosen constituent', () => {
    const a = t2('x', 'red');
    const b = t2('y', 'green');
    const v = forgeTier3(a, b, 'v1');
    const { returned, burned } = unmerge(v, 'x');
    expect(burned.id).toBe('x');
    expect(returned.map((c) => c.id)).toEqual(['y']);
    expect(() => unmerge(v, 'nope')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/forge3.test.ts` — Expected: FAIL (`tier3DefId` not exported).

- [ ] **Step 3: Implement (append to `src/core/forge.ts`)**

```ts
export const PAIR_DEF: Record<string, string> = {
  'air+air': 'wind',
  'air+fire': 'smoke',
  'earth+earth': 'land',
  'air+earth': 'dust',
  'earth+fire': 'magma',
  'earth+water': 'tree',
  'fire+fire': 'volcano',
  'water+water': 'lake',
  'air+water': 'rain',
  'fire+water': 'steam',
};

export function tier3DefId(a: ForgedCard, b: ForgedCard): string | null {
  if (a.tier !== 2 || b.tier !== 2) return null;
  const elems = [COLOUR_ELEMENT[a.colours[0]!], COLOUR_ELEMENT[b.colours[0]!]].sort();
  return PAIR_DEF[elems.join('+')] ?? null;
}

export function forgeTier3(a: ForgedCard, b: ForgedCard, id: string): ForgedCard {
  const defId = tier3DefId(a, b);
  if (!defId) throw new Error('illegal tier-3 merge');
  return {
    kind: 'forged', id, tier: 3, defId,
    colours: [...new Set([...a.colours, ...b.colours])].sort(),
    constituents: [a, b],
    marks: {},
  };
}

export function unmerge(
  card: ForgedCard,
  burnConstituentId: string,
): { returned: Card[]; burned: Card } {
  const i = card.constituents.findIndex((c) => c.id === burnConstituentId);
  if (i < 0) throw new Error(`not a constituent: ${burnConstituentId}`);
  const burned = card.constituents[i]!;
  const returned = card.constituents.filter((_, j) => j !== i);
  return { returned, burned };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/forge3.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/forge.ts tests/core/forge3.test.ts
git commit -m "feat: tier-3 variations and unmerge-with-burn"
```

---

### Task 6: Content — config, element definitions

**Files:**
- Create: `src/content/config.ts`, `src/content/elements.ts`
- Test: `tests/content/elements.test.ts`

Spec: §10 for every config number; §2.2–2.3 for abilities. The 7/8/9 variant axis is defined **here, concretely**: total 7 = base effect at fuel cost 1; total 8 = magnitude +1 at fuel cost 1; total 9 = magnitude +1 with an extra kicker at fuel cost 2. All numbers are data — tuning changes must only ever touch these two files.

**Interfaces:**
- Produces (`config.ts`):

```ts
export const CONFIG = {
  startingHp: 20,
  handSize: 5,
  forgeWindowSize: 7,
  mergeTotals: [7, 8, 9],
  tier2FuelCost: 1,          // default; per-variant override in elements.ts wins
  tier3FuelCost: 2,
  hailMaryBurn: 3,
  hailMaryDamage: 1,
  enemyPower: { tower: 2, stronghold: 4, fortress: 6 } as Record<string, number>,
  corruptionInjection: { tower: 1, stronghold: 2, fortress: 2, manifestation: 4 } as Record<string, number>,
  deathCounterThreshold: 6,
  manifestationClock: 10,
  startingCorruption: 1,
  rewardPoints: { tower: 1, stronghold: 2, fortress: 3, manifestation: 5 } as Record<string, number>,
  relicCost: 4,
  reducedStrugglesCost: 6,
  healAmount: 4,
  scoutBaseCost: 1,
  windowWidenAmount: 2,
  strugglesByRank: { tower: 0, stronghold: 1, fortress: 2, manifestation: 3 } as Record<string, number>,
  fuelMatching: 'strict' as 'strict' | 'any' | 'bonus',
  dustDeflectTable: [0, 2, 3, 5, 6],
  volcanoEruptThreshold: 2,
} as const;
```

- Produces (`elements.ts`):

```ts
export type Atom =
  | { op: 'damage'; amount: number }            // needs targetEnemyId
  | { op: 'draw'; amount: number }
  | { op: 'block'; amount: number }
  | { op: 'attach' }                            // attach this card to targetEnemyId
  | { op: 'decombine' }                         // needs decombineTargetId (+ burnId unless waived)
  | { op: 'discard'; amount: number }           // needs discardIds chosen by player
  | { op: 'charge' }                            // +1 charge counter on this card's defId
  | { op: 'freeMerge' };                        // grants one merge this turn without green

export interface ElementDef {
  id: string;                 // 'fire-7' … 'water-9', 'wind' … 'steam'
  name: string;
  tier: 2 | 3;
  fuelCost: number;
  onActivate: Atom[];
  onDrawDamage?: number;      // deal N per card drawn by THIS card's own effects
  onCombineDamage?: number;   // deal N (to any enemy) whenever the player merges in combat
  retaliate?: number;         // while attached: attacked → deal N to any enemy
  defender?: { health: number };
  followup?:
    | { kind: 'activations'; count: number; atoms: Atom[] }  // Nth activation of this defId in a round fires atoms
    | { kind: 'special'; special: 'storm' | 'ash' | 'landslide' | 'duststorm' | 'lava' | 'forest' | 'eruption' | 'ocean' | 'flood' | 'pressure' };
}

export const ELEMENTS: Record<string, ElementDef>;
export function elementDef(defId: string): ElementDef; // throws on unknown id
```

- [ ] **Step 1: Write the failing test**

`tests/content/elements.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ELEMENTS, elementDef } from '../../src/content/elements';
import { PAIR_DEF } from '../../src/core/forge';

describe('element content', () => {
  it('defines all 12 tier-2 variants', () => {
    for (const el of ['fire', 'earth', 'air', 'water']) {
      for (const total of [7, 8, 9]) {
        const def = elementDef(`${el}-${total}`);
        expect(def.tier).toBe(2);
        expect(def.fuelCost).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('defines all 10 tier-3 variations named by the pair table', () => {
    for (const defId of Object.values(PAIR_DEF)) {
      expect(elementDef(defId).tier).toBe(3);
    }
  });

  it('throws on unknown ids', () => {
    expect(() => elementDef('mud-7')).toThrow();
  });

  it('fire deals damage, air draws, earth attaches, water combines', () => {
    expect(elementDef('fire-7').onActivate).toContainEqual({ op: 'damage', amount: 2 });
    expect(elementDef('air-7').onActivate).toContainEqual({ op: 'draw', amount: 1 });
    expect(elementDef('earth-7').onActivate).toContainEqual({ op: 'attach' });
    expect(elementDef('water-7').onCombineDamage).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/content/elements.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/content/config.ts`: the exact `CONFIG` object from **Interfaces** above (it is complete).

`src/content/elements.ts` (complete definitions — the abilities transcribe spec §2.2/§2.3 with the variant axis defined above):
```ts
export const ELEMENTS: Record<string, ElementDef> = {
  // ---- tier 2: fire = damage
  'fire-7': { id: 'fire-7', name: 'Fire', tier: 2, fuelCost: 1, onActivate: [{ op: 'damage', amount: 2 }] },
  'fire-8': { id: 'fire-8', name: 'Fire', tier: 2, fuelCost: 1, onActivate: [{ op: 'damage', amount: 3 }] },
  'fire-9': { id: 'fire-9', name: 'Fire', tier: 2, fuelCost: 2, onActivate: [{ op: 'damage', amount: 3 }, { op: 'charge' }],
    followup: { kind: 'activations', count: 2, atoms: [{ op: 'damage', amount: 2 }] } },
  // ---- tier 2: earth = defence/attach/retaliation
  'earth-7': { id: 'earth-7', name: 'Earth', tier: 2, fuelCost: 1, onActivate: [{ op: 'attach' }], retaliate: 1 },
  'earth-8': { id: 'earth-8', name: 'Earth', tier: 2, fuelCost: 1, onActivate: [{ op: 'attach' }], retaliate: 2 },
  'earth-9': { id: 'earth-9', name: 'Earth', tier: 2, fuelCost: 2, onActivate: [{ op: 'attach' }, { op: 'block', amount: 2 }], retaliate: 2 },
  // ---- tier 2: air = drawing
  'air-7': { id: 'air-7', name: 'Air', tier: 2, fuelCost: 1, onActivate: [{ op: 'draw', amount: 1 }], onDrawDamage: 1 },
  'air-8': { id: 'air-8', name: 'Air', tier: 2, fuelCost: 1, onActivate: [{ op: 'draw', amount: 2 }], onDrawDamage: 1 },
  'air-9': { id: 'air-9', name: 'Air', tier: 2, fuelCost: 2, onActivate: [{ op: 'draw', amount: 2 }], onDrawDamage: 2 },
  // ---- tier 2: water = combining
  'water-7': { id: 'water-7', name: 'Water', tier: 2, fuelCost: 1, onActivate: [{ op: 'block', amount: 1 }], onCombineDamage: 1 },
  'water-8': { id: 'water-8', name: 'Water', tier: 2, fuelCost: 1, onActivate: [{ op: 'block', amount: 1 }], onCombineDamage: 2 },
  'water-9': { id: 'water-9', name: 'Water', tier: 2, fuelCost: 2, onActivate: [{ op: 'freeMerge' }], onCombineDamage: 2 },
  // ---- tier 3 (spec §2.3 table)
  wind:    { id: 'wind', name: 'Wind', tier: 3, fuelCost: 2, onActivate: [{ op: 'draw', amount: 2 }], onDrawDamage: 1,
             followup: { kind: 'special', special: 'storm' } },
  smoke:   { id: 'smoke', name: 'Smoke', tier: 3, fuelCost: 2,
             onActivate: [{ op: 'draw', amount: 1 }, { op: 'discard', amount: 1 }, { op: 'damage', amount: 1 }], onDrawDamage: 1,
             followup: { kind: 'special', special: 'ash' } },
  land:    { id: 'land', name: 'Land', tier: 3, fuelCost: 2, onActivate: [{ op: 'attach' }], retaliate: 2,
             followup: { kind: 'special', special: 'landslide' } },
  dust:    { id: 'dust', name: 'Dust', tier: 3, fuelCost: 2, onActivate: [{ op: 'charge' }],
             followup: { kind: 'special', special: 'duststorm' } },
  magma:   { id: 'magma', name: 'Magma', tier: 3, fuelCost: 2, onActivate: [{ op: 'attach' }],
             followup: { kind: 'special', special: 'lava' } },
  tree:    { id: 'tree', name: 'Tree', tier: 3, fuelCost: 2, onActivate: [{ op: 'attach' }], defender: { health: 2 },
             followup: { kind: 'special', special: 'forest' } },  // defender defs route 'attach' to the defenders zone (Task 9)
  volcano: { id: 'volcano', name: 'Volcano', tier: 3, fuelCost: 2, onActivate: [{ op: 'charge' }],
             followup: { kind: 'special', special: 'eruption' } },
  lake:    { id: 'lake', name: 'Lake', tier: 3, fuelCost: 2, onActivate: [{ op: 'decombine' }], onCombineDamage: 2,
             followup: { kind: 'special', special: 'ocean' } },
  rain:    { id: 'rain', name: 'Rain', tier: 3, fuelCost: 2,
             onActivate: [{ op: 'draw', amount: 1 }, { op: 'damage', amount: 1 }],
             followup: { kind: 'special', special: 'flood' } },
  steam:   { id: 'steam', name: 'Steam', tier: 3, fuelCost: 2,
             onActivate: [{ op: 'decombine' }, { op: 'damage', amount: 1 }], onCombineDamage: 1,
             followup: { kind: 'special', special: 'pressure' } },
};

export function elementDef(defId: string): ElementDef {
  const def = ELEMENTS[defId];
  if (!def) throw new Error(`unknown element def: ${defId}`);
  return def;
}
```
(Plus the `Atom` / `ElementDef` type declarations from **Interfaces**, placed above `ELEMENTS`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/content/elements.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/content/config.ts src/content/elements.ts tests/content/elements.test.ts
git commit -m "feat: tuning config and full element content (12 tier-2 variants, 10 tier-3)"
```

---

### Task 7: Combat skeleton — state, drawing, enemy turn, outcome

**Files:**
- Create: `src/core/combat.ts`
- Modify: `src/core/types.ts` (append combat types)
- Test: `tests/core/combat.test.ts`

Spec: §3.1 (turn structure), §3.3 (enemy stats). This task builds the frame; player commands arrive in Tasks 8–9, followups in 10, marks/corruption hooks in 11–12 (drawing a corruption card here just logs an event and discards it — Task 12 replaces that stub).

Design decisions locked here (v1 simplifications, each noted in code comments): retaliation auto-targets the attacking enemy; `onCombineDamage` and other untargeted damage auto-target the living enemy with the lowest hp; attached cards and defenders return to the discard pile at end of round (spec §3.2: no board persistence).

**Interfaces:**
- Appended to `types.ts`:

```ts
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
}
```

- Produced by `combat.ts`:

```ts
export function startCombat(opts: {
  deck: Card[];               // already includes injected corruption (run.ts's job)
  hp: number; handSize: number;
  enemies: EnemySpec[]; struggles: string[]; relics: string[];
  rng: Rng; idGen: IdGen;
}): CombatState;              // shuffles deck into drawPile, draws opening hand,
                              // sets clock/plagueAura if a manifestation of that suit is present
export function drawCards(cs: CombatState, rng: Rng, idGen: IdGen, n: number,
  events: GameEvent[], source?: ForgedCard): void;
  // reshuffles discard when empty; fires source.onDrawDamage per card drawn;
  // corruption cards: stub — event + discard (replaced in Task 12);
  // marked cards: stub — nothing (wired in Task 11)
export function lowestHpEnemy(cs: CombatState): Enemy | null;
export function dealToEnemy(cs: CombatState, enemyId: string, amount: number,
  events: GameEvent[], tag?: string): void;   // tag 'smoke' records smokeHits
export function endTurn(cs: CombatState, rng: Rng, idGen: IdGen,
  events: GameEvent[]): void;
  // retaliation → enemy attacks (defenders absorb first, then block, then hp)
  // → clear attachments/defenders to discard → reset per-round state
  // → advance clock → round++ → draw to handSize → outcome check
export function checkOutcome(cs: CombatState): void;
```

- [ ] **Step 1: Write the failing test**

`tests/core/combat.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat, endTurn, dealToEnemy, drawCards } from '../../src/core/combat';
import type { GameEvent } from '../../src/core/types';

const setup = (enemyHp = 5) =>
  startCombat({
    deck: makeStartingDeck({ n: 1 }),
    hp: 20, handSize: 5,
    enemies: [{ suit: 'clubs', rank: 'tower', hp: enemyHp }],
    struggles: [], relics: [],
    rng: new Rng(1), idGen: { n: 1000 },
  });

describe('combat skeleton', () => {
  it('deals an opening hand and sets enemy power from config', () => {
    const cs = setup();
    expect(cs.hand).toHaveLength(5);
    expect(cs.drawPile).toHaveLength(71);
    expect(cs.enemies[0]!.power).toBe(2); // tower
    expect(cs.outcome).toBe('ongoing');
  });

  it('enemies strike at end of turn; block absorbs first', () => {
    const cs = setup();
    const events: GameEvent[] = [];
    cs.block = 1;
    endTurn(cs, new Rng(2), { n: 2000 }, events);
    expect(cs.hp).toBe(19); // power 2 - block 1
    expect(cs.block).toBe(0); // reset for new round
    expect(cs.round).toBe(2);
    expect(cs.hand).toHaveLength(5); // drew back up
  });

  it('killing all enemies wins; hp 0 loses', () => {
    const cs = setup(3);
    const events: GameEvent[] = [];
    dealToEnemy(cs, cs.enemies[0]!.id, 3, events);
    expect(cs.outcome).toBe('won');

    const cs2 = setup();
    cs2.hp = 1;
    endTurn(cs2, new Rng(2), { n: 2000 }, events);
    expect(cs2.outcome).toBe('lost');
  });

  it('reshuffles discard into draw pile when empty', () => {
    const cs = setup();
    cs.discardPile = cs.drawPile.splice(0, 60);
    cs.drawPile = [];
    const events: GameEvent[] = [];
    drawCards(cs, new Rng(3), { n: 3000 }, 2, events);
    expect(cs.hand).toHaveLength(7);
    expect(cs.drawPile.length + cs.discardPile.length).toBe(58);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/combat.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Append the **Interfaces** block for `types.ts` verbatim, then `src/core/combat.ts`:

```ts
import { CONFIG } from '../content/config';
import { elementDef } from '../content/elements';
import { nextId, type IdGen } from './cards';
import type { Rng } from './rng';
import type {
  Card, CombatState, Enemy, EnemySpec, ForgedCard, GameEvent,
} from './types';

export function startCombat(opts: {
  deck: Card[]; hp: number; handSize: number;
  enemies: EnemySpec[]; struggles: string[]; relics: string[];
  rng: Rng; idGen: IdGen;
}): CombatState {
  const enemies: Enemy[] = opts.enemies.map((e) => ({
    id: nextId(opts.idGen, 'e'), suit: e.suit, rank: e.rank,
    hp: e.hp, maxHp: e.hp,
    power: e.rank === 'manifestation' ? manifestationPower(e.suit) : CONFIG.enemyPower[e.rank]!,
    attachments: [], echoed: false,
  }));
  const cs: CombatState = {
    outcome: 'ongoing', round: 1, hp: opts.hp, handSize: opts.handSize, block: 0,
    hand: [], drawPile: opts.rng.shuffle(opts.deck), discardPile: [],
    attachedCards: [], defenders: [], enemies,
    activatedThisRound: [], activationCounts: {}, charges: {},
    freeMerges: 0, freeDecombines: 0, scrapSealed: false, lockedElements: [],
    smokeHits: [], plagueAura: false, deathCounter: 0,
    struggles: opts.struggles, relics: opts.relics,
  };
  const manif = enemies.find((e) => e.rank === 'manifestation');
  if (manif?.suit === 'diamonds') cs.clock = CONFIG.manifestationClock;
  if (manif?.suit === 'hearts') cs.plagueAura = true;
  const events: GameEvent[] = [];
  drawCards(cs, opts.rng, opts.idGen, cs.handSize, events);
  return cs;
}

// Manifestation power is per-manifestation content (spec §3.3): flat 10 in v1.
function manifestationPower(_suit: string): number {
  return 10;
}

export function drawCards(
  cs: CombatState, rng: Rng, idGen: IdGen, n: number,
  events: GameEvent[], source?: ForgedCard,
): void {
  for (let i = 0; i < n; i++) {
    if (cs.drawPile.length === 0) {
      if (cs.discardPile.length === 0) return; // nothing left to draw — not a loss (hp is life)
      cs.drawPile = rng.shuffle(cs.discardPile);
      cs.discardPile = [];
      events.push({ type: 'reshuffle', text: 'The deck turns over.' });
    }
    const card = cs.drawPile.pop()!;
    if (card.kind === 'corruption') {
      // Task 12 replaces this stub with onCorruptionDrawn.
      events.push({ type: 'corruption-drawn', text: 'A corruption card surfaces.' });
      cs.discardPile.push(card);
    } else {
      cs.hand.push(card);
      // Task 11 wires mark escalation (plague/doom) here.
    }
    if (source?.kind === 'forged') {
      const dmg = elementDef(source.defId).onDrawDamage ?? 0;
      if (dmg > 0) {
        const target = lowestHpEnemy(cs);
        if (target) dealToEnemy(cs, target.id, dmg, events);
      }
    }
  }
}

export function lowestHpEnemy(cs: CombatState): Enemy | null {
  const alive = cs.enemies.filter((e) => e.hp > 0);
  if (alive.length === 0) return null;
  return alive.reduce((a, b) => (b.hp < a.hp ? b : a));
}

export function dealToEnemy(
  cs: CombatState, enemyId: string, amount: number, events: GameEvent[], tag?: string,
): void {
  const enemy = cs.enemies.find((e) => e.id === enemyId);
  if (!enemy || enemy.hp <= 0 || amount <= 0) return;
  enemy.hp -= amount;
  if (tag === 'smoke' && !cs.smokeHits.includes(enemy.id)) cs.smokeHits.push(enemy.id);
  events.push({ type: 'enemy-damaged', text: `${enemy.rank} takes ${amount}.`, data: { enemyId, amount } });
  if (enemy.hp <= 0) events.push({ type: 'enemy-down', text: `The ${enemy.rank} falls.`, data: { enemyId } });
  checkOutcome(cs);
}

export function endTurn(cs: CombatState, rng: Rng, idGen: IdGen, events: GameEvent[]): void {
  if (cs.outcome !== 'ongoing') return;
  // Task 10 adds end-of-round followups (eruption, deflection) via followups.ts here.
  for (const enemy of cs.enemies.filter((e) => e.hp > 0)) {
    // retaliation from attachments — auto-targets the attacker (v1 simplification)
    for (const att of enemy.attachments) {
      const ret = elementDef(att.defId).retaliate ?? 0;
      if (ret > 0) dealToEnemy(cs, enemy.id, ret, events);
    }
    if (enemy.hp <= 0) continue;
    let incoming = enemy.power;
    for (const d of cs.defenders) {
      if (incoming <= 0) break;
      const soak = Math.min(d.hp, incoming);
      d.hp -= soak; incoming -= soak;
    }
    cs.defenders = cs.defenders.filter((d) => d.hp > 0);
    const blocked = Math.min(cs.block, incoming);
    cs.block -= blocked; incoming -= blocked;
    if (incoming > 0) {
      cs.hp -= incoming;
      events.push({ type: 'player-damaged', text: `You take ${incoming}.`, data: { amount: incoming } });
    }
  }
  // board does not persist between rounds (spec §3.2)
  for (const enemy of cs.enemies) {
    for (const att of enemy.attachments) {
      const i = cs.attachedCards.findIndex((c) => c.id === att.cardId);
      if (i >= 0) cs.discardPile.push(cs.attachedCards.splice(i, 1)[0]!);
    }
    enemy.attachments = [];
  }
  for (const d of cs.defenders) {
    const i = cs.attachedCards.findIndex((c) => c.id === d.cardId);
    if (i >= 0) cs.discardPile.push(cs.attachedCards.splice(i, 1)[0]!);
  }
  cs.defenders = [];
  cs.block = 0;
  cs.activatedThisRound = []; cs.activationCounts = {}; cs.smokeHits = [];
  cs.freeMerges = 0; cs.freeDecombines = 0;
  cs.scrapSealed = false; cs.lockedElements = [];
  if (cs.clock !== undefined) {
    cs.clock -= 1;
    if (cs.clock <= 0) { cs.outcome = 'lost'; events.push({ type: 'clock-out', text: 'Time starves out.' }); return; }
  }
  cs.round += 1;
  checkOutcome(cs);
  if (cs.outcome !== 'ongoing') return;
  drawCards(cs, rng, idGen, Math.max(0, cs.handSize - cs.hand.length), events);
}

export function checkOutcome(cs: CombatState): void {
  if (cs.outcome !== 'ongoing') return;
  if (cs.hp <= 0) cs.outcome = 'lost';
  else if (cs.deathCounter >= CONFIG.deathCounterThreshold) cs.outcome = 'lost';
  else if (cs.enemies.every((e) => e.hp <= 0)) cs.outcome = 'won';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/combat.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/combat.ts tests/core/combat.test.ts
git commit -m "feat: combat skeleton — drawing, enemy strikes, outcome"
```

---

### Task 8: Scrap actions, hail mary, in-combat merging

**Files:**
- Modify: `src/core/combat.ts`
- Test: `tests/core/scrap.test.ts`

Spec: §3.1 — red scrap = 1 damage, yellow = block 1, blue = draw 1, green = one merge right now; hail mary = burn 3 raws → 1 damage. Merging in combat fires every `onCombineDamage` source currently in hand or attached (spec §2.2 water), auto-targeted at the lowest-hp enemy.

**Interfaces:**
- Produces (appended to `combat.ts`):

```ts
export type CombatCommand =
  | { type: 'scrap'; cardId: string; targetEnemyId?: string; mergeCardIds?: string[] }
  | { type: 'activate'; cardId: string; fuelIds: string[]; targetEnemyId?: string;
      decombineTargetId?: string; burnConstituentId?: string; discardIds?: string[] }  // Task 9
  | { type: 'decombine'; cardId: string; burnConstituentId?: string }                  // Task 10 (freeDecombines)
  | { type: 'hailMary'; cardIds: string[]; targetEnemyId: string }
  | { type: 'resolveChoice'; optionId: string }                                        // Task 12
  | { type: 'endTurn' };

export function combatCommand(cs: CombatState, rng: Rng, idGen: IdGen,
  cmd: CombatCommand): GameEvent[];   // throws Error('illegal: <reason>') on invalid input
export function performMerge(cs: CombatState, idGen: IdGen, cardIds: string[],
  events: GameEvent[]): ForgedCard;   // tier-2 from raws in hand, or tier-3 from two tier-2s in hand
```

- [ ] **Step 1: Write the failing test**

`tests/core/scrap.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat, combatCommand } from '../../src/core/combat';
import type { CombatState, RawCard } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});
const setup = (): CombatState => {
  const cs = startCombat({
    deck: makeStartingDeck({ n: 1 }), hp: 20, handSize: 5,
    enemies: [{ suit: 'clubs', rank: 'stronghold', hp: 8 }],
    struggles: [], relics: [], rng: new Rng(1), idGen: { n: 1000 },
  });
  cs.hand = []; // tests place hands explicitly
  return cs;
};

describe('scrap and hail mary', () => {
  it('red scraps for 1 damage, yellow for block, blue draws', () => {
    const cs = setup();
    cs.hand = [raw('r', 'red', 4), raw('y', 'yellow', 2), raw('b', 'blue', 1)];
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'scrap', cardId: 'r', targetEnemyId: cs.enemies[0]!.id });
    expect(cs.enemies[0]!.hp).toBe(7);
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'scrap', cardId: 'y' });
    expect(cs.block).toBe(1);
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'scrap', cardId: 'b' });
    expect(cs.hand).toHaveLength(1); // b left, one drawn
    expect(cs.discardPile.map((c) => c.id)).toEqual(expect.arrayContaining(['r', 'y', 'b']));
  });

  it('green scraps into a merge; the forged card lands in hand', () => {
    const cs = setup();
    cs.hand = [raw('g', 'green', 1), raw('a', 'red', 3), raw('b', 'red', 5)];
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'scrap', cardId: 'g', mergeCardIds: ['a', 'b'] });
    const forged = cs.hand.find((c) => c.kind === 'forged');
    expect(forged).toMatchObject({ defId: 'fire-8' });
    expect(cs.hand).toHaveLength(1);
  });

  it('scrapping is illegal when sealed, on forged cards, or with wrong merges', () => {
    const cs = setup();
    cs.hand = [raw('r', 'red', 4), raw('a', 'red', 2), raw('b', 'blue', 5)];
    cs.scrapSealed = true;
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'scrap', cardId: 'r', targetEnemyId: cs.enemies[0]!.id })).toThrow(/sealed/);
    cs.scrapSealed = false;
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'scrap', cardId: 'nope' })).toThrow();
  });

  it('hail mary burns three raws for 1 damage — permanently', () => {
    const cs = setup();
    cs.hand = [raw('a', 'red', 1), raw('b', 'blue', 1), raw('c', 'green', 1)];
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'hailMary', cardIds: ['a', 'b', 'c'], targetEnemyId: cs.enemies[0]!.id });
    expect(cs.enemies[0]!.hp).toBe(7);
    expect(cs.hand).toHaveLength(0);
    expect(cs.discardPile.find((c) => ['a', 'b', 'c'].includes(c.id))).toBeUndefined(); // burned, not discarded
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/scrap.test.ts` — Expected: FAIL (`combatCommand` not exported).

- [ ] **Step 3: Implement (append to `src/core/combat.ts`)**

```ts
import { forgeTier2, forgeTier3, tier2Target, tier3DefId } from './forge';
import { findCard, removeCard } from './cards';

export function combatCommand(
  cs: CombatState, rng: Rng, idGen: IdGen, cmd: CombatCommand,
): GameEvent[] {
  const events: GameEvent[] = [];
  if (cs.outcome !== 'ongoing') throw new Error('illegal: combat over');
  if (cs.pendingChoice && cmd.type !== 'resolveChoice') throw new Error('illegal: choice pending');
  switch (cmd.type) {
    case 'scrap': doScrap(cs, rng, idGen, cmd, events); break;
    case 'hailMary': doHailMary(cs, cmd, events); break;
    case 'endTurn': endTurn(cs, rng, idGen, events); break;
    case 'activate': doActivate(cs, rng, idGen, cmd, events); break;       // Task 9
    case 'decombine': doFreeDecombine(cs, cmd, events); break;             // Task 10
    case 'resolveChoice': throw new Error('illegal: no choice pending');   // Task 12 replaces
  }
  return events;
}

function doScrap(
  cs: CombatState, rng: Rng, idGen: IdGen,
  cmd: Extract<CombatCommand, { type: 'scrap' }>, events: GameEvent[],
): void {
  if (cs.scrapSealed) throw new Error('illegal: scrapping is sealed');
  const card = findCard(cs.hand, cmd.cardId);
  if (card.kind !== 'raw') throw new Error('illegal: only raws scrap');
  // Task 11 adds: scarred raws cannot scrap; famished raws cost 1 extra raw.
  removeCard(cs.hand, card.id);
  cs.discardPile.push(card);
  events.push({ type: 'scrap', text: `Scrapped a ${card.colour} ${card.value}.`, data: { cardId: card.id } });
  switch (card.colour) {
    case 'red': {
      if (!cmd.targetEnemyId) throw new Error('illegal: red scrap needs a target');
      dealToEnemy(cs, cmd.targetEnemyId, 1, events);
      break;
    }
    case 'yellow': cs.block += 1; break;
    case 'blue': drawCards(cs, rng, idGen, 1, events); break;
    case 'green': {
      if (!cmd.mergeCardIds?.length) throw new Error('illegal: green scrap needs mergeCardIds');
      performMerge(cs, idGen, cmd.mergeCardIds, events);
      break;
    }
  }
}

export function performMerge(
  cs: CombatState, idGen: IdGen, cardIds: string[], events: GameEvent[],
): ForgedCard {
  const cards = cardIds.map((id) => findCard(cs.hand, id));
  let forged: ForgedCard;
  if (tier2Target(cards)) {
    forged = forgeTier2(cards as RawCardArray, nextId(idGen, 'f'));
  } else if (cards.length === 2 && cards.every((c) => c.kind === 'forged')
      && tier3DefId(cards[0] as ForgedCard, cards[1] as ForgedCard)) {
    forged = forgeTier3(cards[0] as ForgedCard, cards[1] as ForgedCard, nextId(idGen, 'f'));
  } else {
    throw new Error('illegal: not a valid merge');
  }
  for (const id of cardIds) removeCard(cs.hand, id);
  cs.hand.push(forged);
  // Task 11 adds plague contagion + plagueAura here.
  events.push({ type: 'merge', text: `Forged ${forged.defId}.`, data: { defId: forged.defId } });
  fireCombineDamage(cs, events);
  return forged;
}
type RawCardArray = Parameters<typeof forgeTier2>[0];

function fireCombineDamage(cs: CombatState, events: GameEvent[]): void {
  const sources = [...cs.hand, ...cs.attachedCards].filter((c) => c.kind === 'forged');
  for (const s of sources) {
    const dmg = elementDef((s as ForgedCard).defId).onCombineDamage ?? 0;
    if (dmg > 0) {
      const target = lowestHpEnemy(cs);
      if (target) dealToEnemy(cs, target.id, dmg, events);
    }
  }
}

function doHailMary(
  cs: CombatState, cmd: Extract<CombatCommand, { type: 'hailMary' }>, events: GameEvent[],
): void {
  if (cmd.cardIds.length !== CONFIG.hailMaryBurn) throw new Error('illegal: hail mary burns exactly 3');
  const cards = cmd.cardIds.map((id) => findCard(cs.hand, id));
  if (!cards.every((c) => c.kind === 'raw')) throw new Error('illegal: hail mary burns raws');
  for (const id of cmd.cardIds) removeCard(cs.hand, id); // burned: gone from the run
  events.push({ type: 'burn', text: 'Three raws burn for one desperate strike.' });
  dealToEnemy(cs, cmd.targetEnemyId, CONFIG.hailMaryDamage, events);
}

// placeholders overwritten by Tasks 9–10 (declared so the switch compiles):
function doActivate(_cs: CombatState, _rng: Rng, _idGen: IdGen,
  _cmd: Extract<CombatCommand, { type: 'activate' }>, _events: GameEvent[]): void {
  throw new Error('illegal: not implemented until Task 9');
}
function doFreeDecombine(_cs: CombatState,
  _cmd: Extract<CombatCommand, { type: 'decombine' }>, _events: GameEvent[]): void {
  throw new Error('illegal: not implemented until Task 10');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/core/scrap.test.ts` — Expected: PASS (4 tests). Also `npm test` — all previous suites still pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/combat.ts tests/core/scrap.test.ts
git commit -m "feat: scrap actions, hail mary, in-combat merging"
```

---

### Task 9: Activation — strict colour fuel and the effect interpreter

**Files:**
- Modify: `src/core/combat.ts` (replace the `doActivate` stub)
- Test: `tests/core/activate.test.ts`

Spec: §3.1–3.2. Validation order: card is forged + in hand → not already activated this round → no element of the card is locked → fuel legal (every fuel card is a raw in hand whose colour is one of the card's colours; count equals the def's `fuelCost`; Task 11 adds the famished surcharge). Payment discards the fuel. Then each atom runs; then `activationCounts[defId]`++ and Task 10's followup hook fires (stubbed here as a no-op call).

**Interfaces:**
- Consumes: `elementDef` (Task 6), `unmerge` (Task 5).
- Produces: working `{ type: 'activate', ... }` command. Atom semantics: `damage`→`targetEnemyId` required; `draw`→`drawCards` with the card as `source` (so its `onDrawDamage` fires); `block`; `attach`→card moves from hand to `attachedCards`, entry added to the target enemy's `attachments`, defender defs (`tree`) instead join `defenders`; `decombine`→`decombineTargetId` is a forged card in hand, `burnConstituentId` chooses the burn, returned cards join hand; `discard`→`discardIds` (player-chosen) move hand→discard; `charge`→`charges[defId]`++; `freeMerge`→`freeMerges`++ (spent by a green-less `performMerge` via a scrap-free merge — expose by allowing `{ type: 'scrap', cardId: '', mergeCardIds }` **only** when `freeMerges > 0`, decrementing it; guard: empty cardId means "use a free merge").

- [ ] **Step 1: Write the failing test**

`tests/core/activate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat, combatCommand } from '../../src/core/combat';
import { forgeTier2 } from '../../src/core/forge';
import type { CombatState, RawCard } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});
const fire8 = (id: string) => forgeTier2([raw(`${id}a`, 'red', 3), raw(`${id}b`, 'red', 5)], id);
const setup = (): CombatState => {
  const cs = startCombat({
    deck: makeStartingDeck({ n: 1 }), hp: 20, handSize: 5,
    enemies: [{ suit: 'clubs', rank: 'stronghold', hp: 10 }],
    struggles: [], relics: [], rng: new Rng(1), idGen: { n: 1000 },
  });
  cs.hand = [];
  return cs;
};

describe('activation', () => {
  it('pays strict-colour fuel and runs the damage atom', () => {
    const cs = setup();
    cs.hand = [fire8('f'), raw('r1', 'red', 2)];
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f', fuelIds: ['r1'], targetEnemyId: cs.enemies[0]!.id });
    expect(cs.enemies[0]!.hp).toBe(7); // fire-8 deals 3
    expect(cs.hand.map((c) => c.id)).toEqual(['f']); // fuel discarded, card stays
    expect(cs.activatedThisRound).toContain('f');
  });

  it('rejects wrong-colour fuel, wrong fuel count, double activation', () => {
    const cs = setup();
    cs.hand = [fire8('f'), raw('b1', 'blue', 2), raw('r1', 'red', 2), raw('r2', 'red', 3)];
    const t = cs.enemies[0]!.id;
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f', fuelIds: ['b1'], targetEnemyId: t })).toThrow(/fuel/);
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f', fuelIds: ['r1', 'r2'], targetEnemyId: t })).toThrow(/fuel/);
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f', fuelIds: ['r1'], targetEnemyId: t });
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f', fuelIds: ['r2'], targetEnemyId: t })).toThrow(/already/);
  });

  it('air draws with onDrawDamage; earth attaches; locked elements refuse', () => {
    const cs = setup();
    const air7 = forgeTier2([raw('xa', 'blue', 3), raw('xb', 'blue', 4)], 'air');
    const earth7 = forgeTier2([raw('ya', 'yellow', 3), raw('yb', 'yellow', 4)], 'earth');
    cs.hand = [air7, earth7, raw('b1', 'blue', 1), raw('y1', 'yellow', 1)];
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'activate', cardId: 'air', fuelIds: ['b1'] });
    expect(cs.enemies[0]!.hp).toBe(9); // drew 1 → onDrawDamage 1
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'earth', fuelIds: ['y1'], targetEnemyId: cs.enemies[0]!.id });
    expect(cs.enemies[0]!.attachments).toHaveLength(1);
    expect(cs.hand.find((c) => c.id === 'earth')).toBeUndefined(); // moved to attached zone
    cs.lockedElements = ['air'];
    cs.activatedThisRound = [];
    cs.hand.push(raw('b2', 'blue', 1));
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'air', fuelIds: ['b2'] })).toThrow(/locked/);
  });

  it('water-9 freeMerge grants a green-less merge', () => {
    const cs = setup();
    const water9 = forgeTier2([raw('wa', 'green', 4), raw('wb', 'green', 5)], 'w9');
    cs.hand = [water9, raw('g1', 'green', 1), raw('g2', 'green', 1),
      raw('r1', 'red', 3), raw('r2', 'red', 5)];
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'activate', cardId: 'w9', fuelIds: ['g1', 'g2'] });
    expect(cs.freeMerges).toBe(1);
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'scrap', cardId: '', mergeCardIds: ['r1', 'r2'] });
    expect(cs.hand.some((c) => c.kind === 'forged' && c.defId === 'fire-8')).toBe(true);
    expect(cs.freeMerges).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/activate.test.ts` — Expected: FAIL (`not implemented until Task 9`).

- [ ] **Step 3: Implement — replace `doActivate` and extend `doScrap`'s entry check**

In `doScrap`, before `findCard`, add the free-merge path:
```ts
  if (cmd.cardId === '') {
    if (cs.freeMerges <= 0) throw new Error('illegal: no free merge available');
    if (!cmd.mergeCardIds?.length) throw new Error('illegal: free merge needs mergeCardIds');
    cs.freeMerges -= 1;
    performMerge(cs, idGen, cmd.mergeCardIds, events);
    return;
  }
```

Replace `doActivate`:
```ts
import { COLOUR_ELEMENT } from './types';
import { unmerge } from './forge';

function doActivate(
  cs: CombatState, rng: Rng, idGen: IdGen,
  cmd: Extract<CombatCommand, { type: 'activate' }>, events: GameEvent[],
): void {
  const card = findCard(cs.hand, cmd.cardId);
  if (card.kind !== 'forged') throw new Error('illegal: only forged cards activate');
  if (cs.activatedThisRound.includes(card.id)) throw new Error('illegal: already activated this round');
  const def = elementDef(card.defId);
  const elements = card.colours.map((c) => COLOUR_ELEMENT[c]);
  if (elements.some((e) => cs.lockedElements.includes(e))) throw new Error('illegal: element locked');
  // fuel — strict colour matching (spec §3.2); Task 11 adds famished surcharge
  const cost = def.fuelCost;
  const fuel = cmd.fuelIds.map((id) => findCard(cs.hand, id));
  if (fuel.length !== cost) throw new Error(`illegal: fuel count ${fuel.length} ≠ ${cost}`);
  if (!fuel.every((f) => f.kind === 'raw' && card.colours.includes(f.colour)))
    throw new Error('illegal: fuel must be raws matching the card colours');
  for (const f of fuel) { removeCard(cs.hand, f.id); cs.discardPile.push(f); }
  events.push({ type: 'activate', text: `${def.name} awakens.`, data: { defId: def.id } });
  runAtoms(cs, rng, idGen, card, def.onActivate, cmd, events);
  cs.activatedThisRound.push(card.id);
  cs.activationCounts[card.defId] = (cs.activationCounts[card.defId] ?? 0) + 1;
  // Task 10 wires followups.onActivated(cs, rng, idGen, card, events) here.
}

function runAtoms(
  cs: CombatState, rng: Rng, idGen: IdGen, card: ForgedCard,
  atoms: import('../content/elements').Atom[],
  cmd: Extract<CombatCommand, { type: 'activate' }>, events: GameEvent[],
): void {
  const def = elementDef(card.defId);
  for (const atom of atoms) {
    switch (atom.op) {
      case 'damage': {
        if (!cmd.targetEnemyId) throw new Error('illegal: damage needs a target');
        dealToEnemy(cs, cmd.targetEnemyId, atom.amount, events, card.defId === 'smoke' ? 'smoke' : undefined);
        break;
      }
      case 'draw': drawCards(cs, rng, idGen, atom.amount, events, card); break;
      case 'block': cs.block += atom.amount; break;
      case 'attach': {
        removeCard(cs.hand, card.id);
        cs.attachedCards.push(card);
        if (def.defender) {
          cs.defenders.push({ cardId: card.id, defId: card.defId, hp: def.defender.health });
        } else {
          if (!cmd.targetEnemyId) throw new Error('illegal: attach needs a target');
          const enemy = cs.enemies.find((e) => e.id === cmd.targetEnemyId && e.hp > 0);
          if (!enemy) throw new Error('illegal: no such enemy');
          enemy.attachments.push({ cardId: card.id, defId: card.defId });
        }
        break;
      }
      case 'decombine': {
        if (!cmd.decombineTargetId) throw new Error('illegal: decombine needs a target card');
        const target = findCard(cs.hand, cmd.decombineTargetId);
        if (target.kind !== 'forged') throw new Error('illegal: decombine targets forged cards');
        if (!cmd.burnConstituentId) throw new Error('illegal: decombine needs burnConstituentId');
        const { returned } = unmerge(target, cmd.burnConstituentId);
        removeCard(cs.hand, target.id);
        cs.hand.push(...returned);
        events.push({ type: 'decombine', text: `${target.defId} comes apart.`, data: { cardId: target.id } });
        break;
      }
      case 'discard': {
        const ids = cmd.discardIds ?? [];
        if (ids.length !== atom.amount) throw new Error('illegal: discard needs discardIds');
        for (const id of ids) { cs.discardPile.push(removeCard(cs.hand, id)); }
        break;
      }
      case 'charge': cs.charges[card.defId] = (cs.charges[card.defId] ?? 0) + 1; break;
      case 'freeMerge': cs.freeMerges += 1; break;
    }
  }
}
```
Note: `tree` already carries `{ op: 'attach' }` in its `onActivate` (Task 6); defender defs route to the `defenders` zone in the attach case above rather than to an enemy.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test` — Expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/combat.ts src/content/elements.ts tests/core/activate.test.ts
git commit -m "feat: activation with strict colour fuel and effect interpreter"
```

---

### Task 10: Followups

**Files:**
- Create: `src/core/followups.ts`
- Modify: `src/core/combat.ts` (call the two hooks; implement `doFreeDecombine`)
- Test: `tests/core/followups.test.ts`

Spec: §2.3 table. Two hook points: **after each activation** (`onActivated`) and **at end of round before enemies strike** (`onEndOfRound` + `getDeflection`).

Followup semantics locked here (all counts/thresholds via the defs and `CONFIG`):
- **storm** — 2nd `wind` activation this round: draw 2 more (as wind, so `onDrawDamage` applies).
- **ash** — 2nd+ `smoke` activation this round: deal 1 to every enemy in `smokeHits`.
- **landslide** — while 2+ `land` cards are attached (across enemies): deflect 1 per attached card (via `getDeflection`).
- **duststorm** — deflect `CONFIG.dustDeflectTable[min(charges.dust, 4)]` each round while charges persist.
- **lava** — when an enemy has 2+ attachments and one is `magma`: at end of round deal 1 per attachment to that enemy.
- **forest** — 3+ `tree` defenders alive at end of round: gain block equal to tree count before enemies strike.
- **eruption** — at end of round, if `charges.volcano ≥ CONFIG.volcanoEruptThreshold`: X = charges; deal 3 + X split one-point-at-a-time across up to X living enemies (lowest hp first); reset charges to 0.
- **ocean** — 2nd `lake` activation this round: `freeDecombines += 1`.
- **flood** (the Rain redesign, spec §2.3 flag): 3rd activation of any **water- or air-coloured** card in a round: draw 2 and deal 2 (rain must be in hand; auto-target).
- **pressure** — 2nd+ `steam` activation this round: `freeDecombines += 1` each.
- `{ kind: 'activations' }` generic (fire-9): on the Nth activation of that defId this round, run its atoms with auto-targeting (damage → lowest-hp enemy).

**Interfaces:**
```ts
export function onActivated(cs: CombatState, rng: Rng, idGen: IdGen,
  card: ForgedCard, events: GameEvent[]): void;
export function onEndOfRound(cs: CombatState, rng: Rng, idGen: IdGen,
  events: GameEvent[]): void;
export function getDeflection(cs: CombatState): number; // landslide + duststorm, applied before block
```
`combat.ts` changes: `doActivate` calls `onActivated` at its marked hook; `endTurn` calls `onEndOfRound` first, computes `const deflect = getDeflection(cs)` and applies it to each enemy's incoming damage before defenders/block; `doFreeDecombine` consumes `freeDecombines` and performs the same unmerge logic as the decombine atom.

- [ ] **Step 1: Write the failing test**

`tests/core/followups.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat, combatCommand, endTurn } from '../../src/core/combat';
import { forgeTier2, forgeTier3 } from '../../src/core/forge';
import type { CombatState, RawCard, GameEvent } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});
const t2 = (id: string, colour: RawCard['colour']) =>
  forgeTier2([raw(`${id}a`, colour, 3), raw(`${id}b`, colour, 5)], id);
const setup = (hp = 20): CombatState => {
  const cs = startCombat({
    deck: makeStartingDeck({ n: 1 }), hp, handSize: 5,
    enemies: [{ suit: 'clubs', rank: 'stronghold', hp: 20 }],
    struggles: [], relics: [], rng: new Rng(1), idGen: { n: 1000 },
  });
  cs.hand = [];
  return cs;
};

describe('followups', () => {
  it('volcano erupts at end of round with 2+ charges', () => {
    const cs = setup();
    const volcano = forgeTier3(t2('v1', 'red'), t2('v2', 'red'), 'vol');
    cs.hand = [volcano, raw('r1', 'red', 1), raw('r2', 'red', 1)];
    cs.charges['volcano'] = 2; // pretend two prior activations
    const events: GameEvent[] = [];
    endTurn(cs, new Rng(2), { n: 2000 }, events);
    expect(cs.enemies[0]!.hp).toBe(15); // 3 + 2 = 5 into the only enemy
    expect(cs.charges['volcano'] ?? 0).toBe(0);
  });

  it('duststorm deflects per the table', () => {
    const cs = setup();
    cs.charges['dust'] = 2; // table [0,2,3,...] → deflect 3
    const events: GameEvent[] = [];
    endTurn(cs, new Rng(2), { n: 2000 }, events);
    expect(cs.hp).toBe(20 - Math.max(0, 4 - 3)); // stronghold power 4 − deflect 3
  });

  it('ocean grants a free decombine on the 2nd lake activation', () => {
    const cs = setup();
    const lakeA = forgeTier3(t2('l1', 'green'), t2('l2', 'green'), 'lakeA');
    const lakeB = forgeTier3(t2('l3', 'green'), t2('l4', 'green'), 'lakeB');
    const fire = t2('ff', 'red');
    cs.hand = [lakeA, lakeB, fire,
      raw('g1', 'green', 1), raw('g2', 'green', 1), raw('g3', 'green', 1), raw('g4', 'green', 1)];
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'lakeA', fuelIds: ['g1', 'g2'],
        decombineTargetId: 'ff', burnConstituentId: 'ffa' });
    expect(cs.freeDecombines).toBe(0);
    const lakeC = forgeTier3(t2('l5', 'green'), t2('l6', 'green'), 'lakeC');
    cs.hand.push(lakeC, raw('g5', 'green', 1), raw('g6', 'green', 1));
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'lakeB', fuelIds: ['g5', 'g6'],
        decombineTargetId: 'lakeC', burnConstituentId: 'l5' });
    expect(cs.freeDecombines).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/followups.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`src/core/followups.ts`:
```ts
import { CONFIG } from '../content/config';
import { elementDef } from '../content/elements';
import { dealToEnemy, drawCards, lowestHpEnemy } from './combat';
import type { IdGen } from './cards';
import type { Rng } from './rng';
import type { CombatState, ForgedCard, GameEvent } from './types';

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
        else if (atom.op === 'block') cs.block += atom.amount;
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
    const d = elementDef(defId);
    if (d.id.startsWith('water') || d.id.startsWith('air')
      || ['wind', 'rain', 'lake', 'steam', 'smoke', 'dust'].includes(d.id)) wet += n;
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
  if (attached.filter((a) => a.defId === 'land').length >= 2) d += attached.length;
  return d;
}

export function onEndOfRound(cs: CombatState, rng: Rng, idGen: IdGen, events: GameEvent[]): void {
  // eruption
  const vol = cs.charges['volcano'] ?? 0;
  if (vol >= CONFIG.volcanoEruptThreshold) {
    let dmg = 3 + vol;
    events.push({ type: 'followup', text: 'The volcano erupts!', data: { defId: 'volcano' } });
    const targets = () => cs.enemies.filter((e) => e.hp > 0).slice(0, vol);
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
  if (trees >= 3) cs.block += trees;
}
```

`combat.ts` wiring (three edits):
1. In `doActivate`, at the Task-10 hook comment: `onActivated(cs, rng, idGen, card, events);` (import from `./followups` — import the module lazily via `import { onActivated, onEndOfRound, getDeflection } from './followups';` at top; circularity is fine because followups only calls exported functions at runtime).
2. In `endTurn`, first line after the outcome guard: `onEndOfRound(cs, rng, idGen, events);` then compute `let deflect = getDeflection(cs);` and, inside the per-enemy loop, reduce `incoming` by `deflect` (consume it: `const used = Math.min(deflect, incoming); deflect -= used; incoming -= used;`) before defenders.
3. Replace `doFreeDecombine`:
```ts
function doFreeDecombine(
  cs: CombatState, cmd: Extract<CombatCommand, { type: 'decombine' }>, events: GameEvent[],
): void {
  if (cs.freeDecombines <= 0) throw new Error('illegal: no free decombine');
  const target = findCard(cs.hand, cmd.cardId);
  if (target.kind !== 'forged') throw new Error('illegal: decombine targets forged cards');
  if (!cmd.burnConstituentId) throw new Error('illegal: decombine needs burnConstituentId');
  const { returned } = unmerge(target, cmd.burnConstituentId);
  removeCard(cs.hand, target.id);
  cs.hand.push(...returned);
  cs.freeDecombines -= 1;
  events.push({ type: 'decombine', text: `${target.defId} comes apart.`, data: { cardId: target.id } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test` — Expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/followups.ts src/core/combat.ts tests/core/followups.test.ts
git commit -m "feat: followup engine — storm, ash, eruption, duststorm, ocean, flood, pressure, lava, forest, landslide"
```

---

### Task 11: Marks

**Files:**
- Create: `src/core/marks.ts`
- Modify: `src/core/combat.ts` (wire draw escalation, scrap/fuel checks, scar adjust, plague contagion in `performMerge`)
- Test: `tests/core/marks.test.ts`

Spec: §2.5 and the mark definitions in §5. Semantics: `marks` is a count per `MarkType`. **Plagued**: +1 when drawn; at 3 the card decombines in place (no burn), constituents each gain `plagued: 1`; a merge containing any plagued constituent (or under `plagueAura`) produces a plagued result. **Doomed**: +1 when drawn; at 3 the card is destroyed (exiled — an event fires, the card simply isn't returned). **Famished**: activation/scrap costs 1 extra raw of any colour (the `extraFuelIds` are just appended to `fuelIds`; validation allows `cost + famished` cards with the surplus being any-colour raws). **Scarred**: numeric atom amounts −1 (min 0); a scarred raw cannot scrap but remains fuel/merge material.

**Interfaces:**
```ts
export function addMark(card: Card, mark: MarkType, events: GameEvent[]): void;
export function cleanse(card: Card, mark: MarkType, events: GameEvent[]): void;
export function escalateOnDraw(cs: CombatState, card: Card, events: GameEvent[]):
  'kept' | 'decombined' | 'destroyed';
  // applies plague/doom draw escalation; on decombine, pushes constituents into hand instead
export function famishedSurcharge(card: Card): number;         // 0 or 1
export function isScrapBlocked(card: Card): boolean;           // scarred raw
export function scarAdjust(card: Card, amount: number): number; // amount − 1 (min 0) if scarred
export function plagueTouch(result: ForgedCard, constituents: Card[], aura: boolean): void;
```
`combat.ts` wiring: `drawCards` calls `escalateOnDraw` for cards with `plagued`/`doomed` marks; `doScrap` rejects `isScrapBlocked` and requires `1 + famishedSurcharge(card)` scraps... (famished raw: the command gains optional `extraFuelIds?: string[]` — one any-colour raw discarded alongside); `doActivate` fuel count becomes `def.fuelCost + famishedSurcharge(card)` where the surplus fuel may be any colour; every numeric atom amount passes through `scarAdjust(card, n)`; `performMerge` calls `plagueTouch(forged, cards, cs.plagueAura)`.

- [ ] **Step 1: Write the failing test**

`tests/core/marks.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { addMark, escalateOnDraw, scarAdjust, plagueTouch, isScrapBlocked } from '../../src/core/marks';
import { forgeTier2 } from '../../src/core/forge';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat } from '../../src/core/combat';
import type { GameEvent, RawCard } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});
const setup = () => startCombat({
  deck: makeStartingDeck({ n: 1 }), hp: 20, handSize: 5,
  enemies: [{ suit: 'hearts', rank: 'tower', hp: 5 }],
  struggles: [], relics: [], rng: new Rng(1), idGen: { n: 1000 },
});

describe('marks', () => {
  it('plague at 3 decombines in place, constituents plagued', () => {
    const cs = setup();
    const card = forgeTier2([raw('a', 'red', 3), raw('b', 'red', 5)], 'f');
    card.marks.plagued = 2;
    const events: GameEvent[] = [];
    const fate = escalateOnDraw(cs, card, events);
    expect(fate).toBe('decombined');
    const back = cs.hand.filter((c) => ['a', 'b'].includes(c.id));
    expect(back).toHaveLength(2);
    expect(back.every((c) => c.marks.plagued === 1)).toBe(true);
  });

  it('doom at 3 destroys', () => {
    const cs = setup();
    const card = raw('x', 'blue', 4);
    card.marks.doomed = 2;
    const events: GameEvent[] = [];
    expect(escalateOnDraw(cs, card, events)).toBe('destroyed');
    expect(cs.hand.find((c) => c.id === 'x')).toBeUndefined();
  });

  it('scar reduces numbers and blocks raw scrapping', () => {
    const card = raw('x', 'red', 4);
    expect(scarAdjust(card, 3)).toBe(3);
    addMark(card, 'scarred', []);
    expect(scarAdjust(card, 3)).toBe(2);
    expect(scarAdjust(card, 0)).toBe(0);
    expect(isScrapBlocked(card)).toBe(true);
  });

  it('plague contagion spreads through merges and aura', () => {
    const clean = forgeTier2([raw('a', 'red', 3), raw('b', 'red', 5)], 'f1');
    plagueTouch(clean, clean.constituents, false);
    expect(clean.marks.plagued).toBeUndefined();
    const sick = raw('c', 'red', 3);
    sick.marks.plagued = 1;
    const infected = forgeTier2([sick, raw('d', 'red', 5)], 'f2');
    plagueTouch(infected, infected.constituents, false);
    expect(infected.marks.plagued).toBe(1);
    const aura = forgeTier2([raw('e', 'red', 3), raw('g', 'red', 5)], 'f3');
    plagueTouch(aura, aura.constituents, true);
    expect(aura.marks.plagued).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/marks.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/core/marks.ts`:
```ts
import type { Card, CombatState, ForgedCard, GameEvent, MarkType } from './types';

export function addMark(card: Card, mark: MarkType, events: GameEvent[]): void {
  card.marks[mark] = (card.marks[mark] ?? 0) + 1;
  events.push({ type: 'mark', text: `A card is marked: ${mark}.`, data: { cardId: card.id, mark } });
}

export function cleanse(card: Card, mark: MarkType, events: GameEvent[]): void {
  delete card.marks[mark];
  events.push({ type: 'cleanse', text: `A ${mark} mark is cleansed.`, data: { cardId: card.id, mark } });
}

export function escalateOnDraw(
  cs: CombatState, card: Card, events: GameEvent[],
): 'kept' | 'decombined' | 'destroyed' {
  if (card.marks.doomed !== undefined) {
    card.marks.doomed += 1;
    events.push({ type: 'mark', text: 'The doom deepens.', data: { cardId: card.id, mark: 'doomed' } });
    if (card.marks.doomed >= 3) {
      events.push({ type: 'destroyed', text: 'A card crumbles to nothing.', data: { cardId: card.id } });
      return 'destroyed'; // caller does not add it to hand; it is gone
    }
  }
  if (card.marks.plagued !== undefined) {
    card.marks.plagued += 1;
    events.push({ type: 'mark', text: 'The plague spreads.', data: { cardId: card.id, mark: 'plagued' } });
    if (card.marks.plagued >= 3 && card.kind === 'forged') {
      for (const c of card.constituents) {
        c.marks.plagued = (c.marks.plagued ?? 0) + 1;
        cs.hand.push(c);
      }
      events.push({ type: 'decombine', text: 'A forging rots apart.', data: { cardId: card.id } });
      return 'decombined';
    }
  }
  cs.hand.push(card);
  return 'kept';
}

export const famishedSurcharge = (card: Card): number => (card.marks.famished ? 1 : 0);
export const isScrapBlocked = (card: Card): boolean =>
  card.kind === 'raw' && card.marks.scarred !== undefined;
export const scarAdjust = (card: Card, amount: number): number =>
  card.marks.scarred !== undefined ? Math.max(0, amount - 1) : amount;

export function plagueTouch(result: ForgedCard, constituents: Card[], aura: boolean): void {
  if (aura || constituents.some((c) => c.marks.plagued !== undefined)) {
    result.marks.plagued = 1;
  }
}
```

`combat.ts` wiring (exact edits):
- In `drawCards`, replace `cs.hand.push(card);` (the non-corruption branch) with:
  `if (card.marks.plagued !== undefined || card.marks.doomed !== undefined) { escalateOnDraw(cs, card, events); } else { cs.hand.push(card); }`
- In `doScrap`: after the raw check add `if (isScrapBlocked(card)) throw new Error('illegal: scarred raws cannot scrap');` and, when `card.marks.famished`, require `cmd` to include `extraFuelIds` (add `extraFuelIds?: string[]` to the scrap and activate command variants) holding exactly one raw in hand — discard it too.
- In `doActivate`: `const cost = def.fuelCost + famishedSurcharge(card);` with validation: at least `def.fuelCost` of the fuel must be colour-matched raws, the surplus may be any raw.
- In `runAtoms`: `damage`/`block`/`draw` amounts become `scarAdjust(card, atom.amount)`.
- In `performMerge`: after `cs.hand.push(forged);` add `plagueTouch(forged, cards, cs.plagueAura);`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test` — Expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/marks.ts src/core/combat.ts tests/core/marks.test.ts
git commit -m "feat: marks — famished, plagued, scarred, doomed with contagion and escalation"
```

---

### Task 12: Corruption cards and horsemen triggers

**Files:**
- Create: `src/core/corruption.ts`
- Modify: `src/core/combat.ts` (replace the corruption-draw stub; implement `resolveChoice`)
- Test: `tests/core/corruption.test.ts`

Spec: §5 tables, transcribed in full. Where a trigger says "a card", the target is a random non-corruption card in hand (rng). Where a trigger offers "pay or suffer", a `PendingChoice` is set with ids `pay` / `refuse`; **pay** auto-discards the lowest-value raw(s) in hand (deterministic; documented v1 simplification — the player chooses whether, not which). If the pay side is impossible (not enough raws), the penalty applies immediately with no choice. After every trigger the corruption card goes to the discard pile (it stays in the deck between fights; removing it costs ♠ rewards).

**Trigger table implemented (suit × rank):**
- ♦ tower: choice — pay 1 raw / discard a random non-corruption card. ♦ stronghold: choice — pay 1 raw / `scrapSealed = true` this round. ♦ fortress: choice — pay 2 raws / famish a random hand card. ♦ manifestation: choice — famish a random hand card / `clock -= 1`.
- ♥ tower: decombine a random forged card in hand (constituents plagued, no burn). ♥ stronghold: plague a random hand card. ♥ fortress: lock a random element this round + plague a random hand card. ♥ manifestation extra: plague a random forged card anywhere (hand, draw, discard).
- ♣ tower: scar a random hand card. ♣ stronghold: scar a random hand card + recoil — player takes 1 whenever they deal enemy damage this round (`cs`: add `recoil: boolean`, reset at end of round; `dealToEnemy` applies it). ♣ fortress: discard every scarred card in hand. ♣ manifestation extra: take 2 + scar a random hand card. War echo (respawn) lives in `endTurn`: a war-manifestation fight revives each first-death enemy at `ceil(maxHp/2)` with `echoed = true`.
- ♠ tower: doom a random hand card. ♠ stronghold: doom a random hand card + exile the top card of the draw pile (event says only "something is lost"). ♠ fortress: choice — exile a random forged card / take 4 and doom two random hand cards. ♠ manifestation extra: `deathCounter += 1` (loss at threshold via `checkOutcome`).

**Interfaces:**
```ts
export function makeCorruptionCard(idGen: IdGen, suit: Suit, rank: RankClass): CorruptionCard;
export function onCorruptionDrawn(cs: CombatState, rng: Rng, idGen: IdGen,
  card: CorruptionCard, events: GameEvent[]): void;
export function resolveChoice(cs: CombatState, rng: Rng, idGen: IdGen,
  optionId: string, events: GameEvent[]): void;  // throws if none pending / unknown option
```
`combat.ts`: the corruption stub in `drawCards` becomes `onCorruptionDrawn(cs, rng, idGen, card, events); cs.discardPile.push(card);` — and the manifestation-present extras trigger inside `onCorruptionDrawn` (it inspects `cs.enemies`). `resolveChoice` command wires to the new function. `PendingChoice.id` encodes the pending penalty (e.g. `'diamonds-tower'`) plus any rolled target id in `data` — store the full pending closure as `cs.pendingChoice` + a private `pendingPenalty` field: add `pendingPenalty?: { kind: string; targetCardId?: string }` to `CombatState`.

- [ ] **Step 1: Write the failing test**

`tests/core/corruption.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat, combatCommand, drawCards } from '../../src/core/combat';
import { makeCorruptionCard } from '../../src/core/corruption';
import type { CombatState, GameEvent } from '../../src/core/types';

const setup = (suit: 'diamonds' | 'hearts' | 'clubs' | 'spades', rank: 'tower' | 'stronghold' = 'tower'): CombatState =>
  startCombat({
    deck: makeStartingDeck({ n: 1 }), hp: 20, handSize: 5,
    enemies: [{ suit, rank, hp: 8 }],
    struggles: [], relics: [], rng: new Rng(1), idGen: { n: 1000 },
  });

const drawCorruption = (cs: CombatState, suit: 'diamonds' | 'hearts' | 'clubs' | 'spades',
  rank: 'tower' | 'stronghold' | 'fortress' | 'manifestation') => {
  const events: GameEvent[] = [];
  cs.drawPile.push(makeCorruptionCard({ n: 9000 }, suit, rank));
  drawCards(cs, new Rng(5), { n: 9100 }, 1, events);
  return events;
};

describe('corruption triggers', () => {
  it('famine tower sets a pay-or-discard choice; paying discards the cheapest raw', () => {
    const cs = setup('diamonds');
    const handBefore = cs.hand.length;
    drawCorruption(cs, 'diamonds', 'tower');
    expect(cs.pendingChoice).toBeDefined();
    combatCommand(cs, new Rng(6), { n: 9200 }, { type: 'resolveChoice', optionId: 'pay' });
    expect(cs.pendingChoice).toBeUndefined();
    expect(cs.hand.length).toBe(handBefore - 1); // one raw paid away
  });

  it('disease stronghold plagues a hand card', () => {
    const cs = setup('hearts');
    drawCorruption(cs, 'hearts', 'stronghold');
    expect(cs.hand.some((c) => c.marks.plagued === 1)).toBe(true);
  });

  it('death stronghold dooms a hand card and exiles blind from the draw pile', () => {
    const cs = setup('spades');
    const drawBefore = cs.drawPile.length + 1; // +1 for the corruption card we add
    drawCorruption(cs, 'spades', 'stronghold');
    expect(cs.hand.some((c) => c.marks.doomed === 1)).toBe(true);
    expect(cs.drawPile.length).toBe(drawBefore - 2); // corruption drawn + one exiled
  });

  it('the corruption card lands in the discard pile, not the hand', () => {
    const cs = setup('clubs');
    drawCorruption(cs, 'clubs', 'tower');
    expect(cs.hand.every((c) => c.kind !== 'corruption')).toBe(true);
    expect(cs.discardPile.some((c) => c.kind === 'corruption')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/corruption.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`src/core/corruption.ts` — implement the full trigger table above. Shape:
```ts
import { CONFIG } from '../content/config';
import { nextId, type IdGen } from './cards';
import { addMark } from './marks';
import type { Rng } from './rng';
import type { CombatState, CorruptionCard, GameEvent, RankClass, Suit, Card } from './types';

export function makeCorruptionCard(idGen: IdGen, suit: Suit, rank: RankClass): CorruptionCard {
  return { kind: 'corruption', id: nextId(idGen, 'x'), suit, rank, marks: {} };
}

const randomHandCard = (cs: CombatState, rng: Rng): Card | null => {
  const pool = cs.hand.filter((c) => c.kind !== 'corruption');
  return pool.length ? pool[rng.int(pool.length)]! : null;
};
const cheapestRaws = (cs: CombatState, n: number): Card[] => {
  const raws = cs.hand.filter((c) => c.kind === 'raw')
    .sort((a, b) => (a as { value: number }).value - (b as { value: number }).value);
  return raws.slice(0, n);
};

export function onCorruptionDrawn(
  cs: CombatState, rng: Rng, idGen: IdGen, card: CorruptionCard, events: GameEvent[],
): void {
  events.push({ type: 'corruption', text: `${card.suit} corruption surfaces (${card.rank}).`,
    data: { suit: card.suit, rank: card.rank } });
  switch (`${card.suit}-${card.rank}`) {
    case 'diamonds-tower':
      offerPay(cs, 1, 'diamonds-tower', 'Pay 1 raw, or discard a card.', events); break;
    case 'diamonds-stronghold':
      offerPay(cs, 1, 'diamonds-stronghold', 'Pay 1 raw, or scrapping seals this round.', events); break;
    case 'diamonds-fortress':
      offerPay(cs, 2, 'diamonds-fortress', 'Pay 2 raws, or a card is famished.', events); break;
    case 'diamonds-manifestation':
      offerChoice(cs, 'diamonds-manifestation', 'Famish a card, or lose a round from the clock.',
        [{ id: 'mark', label: 'Famish a card' }, { id: 'clock', label: 'Lose a round' }], events); break;
    // hearts / clubs / spades cases per the trigger table — implement every row.
    // (Each is 2–5 lines using addMark / removeCard / rng, in the same style.)
    default: applyDirect(cs, rng, idGen, card, events);
  }
}
```
…with `offerPay`/`offerChoice` setting `cs.pendingChoice` + `cs.pendingPenalty` (skipping straight to the penalty when payment is impossible), `applyDirect` handling the no-choice suits (hearts, clubs, spades rows as listed in the table), and:
```ts
export function resolveChoice(
  cs: CombatState, rng: Rng, idGen: IdGen, optionId: string, events: GameEvent[],
): void {
  if (!cs.pendingChoice || !cs.pendingPenalty) throw new Error('illegal: no choice pending');
  const kind = cs.pendingPenalty.kind;
  cs.pendingChoice = undefined;
  const penalty = cs.pendingPenalty;
  cs.pendingPenalty = undefined;
  if (optionId === 'pay') { for (const c of cheapestRaws(cs, payCost(kind))) removeFromHandToDiscard(cs, c); return; }
  applyPenalty(cs, rng, idGen, kind, penalty, events);
}
```
Implement every branch — the table above is the complete requirement; nothing is optional. Add `recoil: boolean` (init `false`, reset in `endTurn`) to `CombatState` and apply it in `dealToEnemy` (`if (cs.recoil) { cs.hp -= 1; checkOutcome(cs); }`). Add the war-echo revive to `endTurn` (before attacks): if a `clubs` manifestation is alive, every enemy with `hp <= 0 && !echoed` revives at `Math.ceil(maxHp / 2)` with `echoed = true`. Replace the `drawCards` corruption stub with the real call. Wire `case 'resolveChoice'` in `combatCommand` to `resolveChoice(cs, rng, idGen, cmd.optionId, events)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test` — Expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/corruption.ts src/core/combat.ts src/core/types.ts tests/core/corruption.test.ts
git commit -m "feat: corruption cards with full horsemen trigger tables"
```

---

### Task 13: Campaign map

**Files:**
- Create: `src/core/map.ts`
- Test: `tests/core/map.test.ts`

Spec: §6. The map deck is 52 playing cards, dealt once, never reshuffled. Difficulty pools per suit: easy = 2–5 (hp 2–5), medium = 6–10, hard = J/Q/K (hp 11/12/13), boss = ace. Levels are generated **lazily** (level N is dealt when reached, from the suits still standing). Every level uses this column template, with all-to-all edges between adjacent columns (v1 simplification of the splits/rejoins):

```
[1× easy] [2× easy-med] [2× med] [2× med-hard] [1× hard] [1× boss]
```
"Hyphen" columns draw from a bag mixing 3 cards of each adjacent pool. Nodes in `med-hard` and `hard` columns hold **two** enemy cards; others hold one; the boss node holds the level domain's ace. Nodes start unrevealed (rank class visible, exact card hidden) — scouting reveals them.

**Interfaces:**
```ts
export interface PlayingCard { suit: Suit; rank: number }  // 2–10, 11=J, 12=Q, 13=K, 14=A
export interface MapNode {
  id: string; column: number; zone: string;
  cards: PlayingCard[]; revealed: boolean;
}
export interface LevelMap { domain: Suit; nodes: MapNode[]; columns: number }
export interface CampaignMap {
  domainOrder: Suit[];           // dealt at run start; 'spades' always last
  level: number;                 // 0-based
  current: LevelMap;
  position: number | null;       // current column; null = before first column
  chosenNode?: string;
  defeated: Suit[];
  dealt: PlayingCard[];          // cards consumed so far (never reshuffled)
}
export function newCampaign(rng: Rng): CampaignMap;           // deals domain order + level 0
export function generateLevel(map: CampaignMap, rng: Rng): LevelMap;
export function nodesInColumn(level: LevelMap, column: number): MapNode[];
export function enemySpecsFor(node: MapNode): EnemySpec[];    // rank→RankClass, rank→hp (A → manifestation, hp 14)
export function advance(map: CampaignMap, nodeId: string): MapNode;  // move to a node in the next column
export function onLevelCleared(map: CampaignMap, rng: Rng): 'nextLevel' | 'victory';
  // records domain defeat, removes suit, deals next level or ends the run
export function scoutCost(map: CampaignMap, node: MapNode): number;  // CONFIG.scoutBaseCost + steps ahead − 1
```

- [ ] **Step 1: Write the failing test**

`tests/core/map.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { newCampaign, nodesInColumn, enemySpecsFor, advance, onLevelCleared } from '../../src/core/map';

describe('campaign map', () => {
  it('deals a domain order ending in spades', () => {
    const map = newCampaign(new Rng(1));
    expect(map.domainOrder).toHaveLength(4);
    expect(map.domainOrder[3]).toBe('spades');
    expect(new Set(map.domainOrder).size).toBe(4);
  });

  it('level template: 1/2/2/2/1/1 nodes, boss is the domain ace', () => {
    const map = newCampaign(new Rng(2));
    const counts = [0, 1, 2, 3, 4, 5].map((c) => nodesInColumn(map.current, c).length);
    expect(counts).toEqual([1, 2, 2, 2, 1, 1]);
    const boss = nodesInColumn(map.current, 5)[0]!;
    expect(boss.cards).toEqual([{ suit: map.current.domain, rank: 14 }]);
    expect(enemySpecsFor(boss)).toEqual([{ suit: map.current.domain, rank: 'manifestation', hp: 14 }]);
  });

  it('med-hard and hard columns hold two enemy cards', () => {
    const map = newCampaign(new Rng(3));
    for (const node of nodesInColumn(map.current, 3)) expect(node.cards).toHaveLength(2);
    expect(nodesInColumn(map.current, 4)[0]!.cards).toHaveLength(2);
  });

  it('clearing a level removes the domain; four cleared levels win', () => {
    const map = newCampaign(new Rng(4));
    const first = map.current.domain;
    expect(onLevelCleared(map, new Rng(5))).toBe('nextLevel');
    expect(map.defeated).toEqual([first]);
    expect(map.current.domain).toBe(map.domainOrder[1]);
    onLevelCleared(map, new Rng(5));
    onLevelCleared(map, new Rng(5));
    expect(onLevelCleared(map, new Rng(5))).toBe('victory');
  });

  it('advance only moves to the next column', () => {
    const map = newCampaign(new Rng(6));
    const start = nodesInColumn(map.current, 0)[0]!;
    advance(map, start.id);
    expect(map.position).toBe(0);
    const far = nodesInColumn(map.current, 3)[0]!;
    expect(() => advance(map, far.id)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/core/map.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `src/core/map.ts`**

Key logic (complete the file around this):
```ts
const TEMPLATE = [
  { zone: 'easy', nodes: 1, cardsPerNode: 1 },
  { zone: 'easy-med', nodes: 2, cardsPerNode: 1 },
  { zone: 'med', nodes: 2, cardsPerNode: 1 },
  { zone: 'med-hard', nodes: 2, cardsPerNode: 2 },
  { zone: 'hard', nodes: 1, cardsPerNode: 2 },
  { zone: 'boss', nodes: 1, cardsPerNode: 0 }, // boss holds the ace, added explicitly
] as const;

const POOL_RANKS: Record<string, number[]> = {
  easy: [2, 3, 4, 5], med: [6, 7, 8, 9, 10], hard: [11, 12, 13],
};

function zoneBag(map: CampaignMap, domainSuits: Suit[], zone: string, rng: Rng): PlayingCard[] {
  const pools = zone.includes('-') ? zone.split('-') : [zone];
  const bag: PlayingCard[] = [];
  for (const pool of pools) {
    const poolName = pool === 'easy' || pool === 'med' || pool === 'hard' ? pool : pool;
    for (const suit of domainSuits) {
      for (const rank of POOL_RANKS[poolName]!) {
        const card = { suit, rank };
        if (!map.dealt.some((d) => d.suit === suit && d.rank === rank)) bag.push(card);
      }
    }
  }
  return rng.shuffle(bag);
}
```
`generateLevel` walks the template, deals `nodes × cardsPerNode` from each zone's bag (pushing every dealt card onto `map.dealt`), builds `MapNode`s with ids `L{level}C{column}N{i}`, and appends the boss node holding `{ suit: domain, rank: 14 }`. `domainSuits` for a level = all suits not yet defeated (so early levels mix domains, the last is pure spades). `enemySpecsFor` maps rank→class (`2–5` tower, `6–10` stronghold, `11–13` fortress, `14` manifestation) and hp = rank (A = 14). `newCampaign` shuffles `['diamonds','hearts','clubs']`, appends `'spades'`, generates level 0. `onLevelCleared` pushes the domain to `defeated`, increments `level`, returns `'victory'` when `level === 4`, otherwise regenerates `current` and resets `position` to `null`. `advance` validates `node.column === (map.position ?? -1) + 1`, sets `position`/`chosenNode`, marks the node revealed. `scoutCost(map, node)` = `CONFIG.scoutBaseCost + Math.max(0, node.column - ((map.position ?? -1) + 1))`.

- [ ] **Step 4: Run test to verify it passes** — `npm test` all green.

- [ ] **Step 5: Commit**

```bash
git add src/core/map.ts tests/core/map.test.ts
git commit -m "feat: lazily-dealt campaign map with domain removal and scouting"
```

---

### Task 14: Struggles

**Files:**
- Create: `src/content/struggles.ts`
- Modify: `src/core/combat.ts` (apply struggle hooks)
- Test: `tests/core/struggles.test.ts`

Spec: §4.3 + §5 axes. Twelve struggles, three per domain — these exact definitions:

| id | domain | effect |
|---|---|---|
| `rationing` | diamonds | hand size −1 this fight |
| `tithe` | diamonds | start of each round: discard the cheapest raw or take 1 damage |
| `empty-stores` | diamonds | hail mary is disabled |
| `fevered` | hearts | the first activation each round costs +1 any-colour fuel |
| `contagion` | hearts | combat starts with a random forged card in the deck plagued |
| `quarantine` | hearts | a random element is locked each round |
| `crossfire` | clubs | killing an enemy deals 1 recoil to you |
| `siege` | clubs | enemies have +1 power |
| `attrition` | clubs | end of each round: discard a random card from hand |
| `creeping-end` | spades | every 3rd round, doom a random hand card |
| `cold-grip` | spades | block gained is halved (round down) |
| `toll` | spades | every reshuffle exiles the top card of the new draw pile |

**Interfaces:**
```ts
export interface StruggleDef { id: string; domain: Suit; name: string; text: string }
export const STRUGGLES: Record<string, StruggleDef>;
export function strugglesFor(domain: Suit): StruggleDef[];
export function dealStruggleChoices(rng: Rng, domain: Suit, pickCount: number):
  { options: StruggleDef[]; pick: number };  // deal pick+1 options when possible
```
`combat.ts` hooks: `startCombat` applies `rationing` (handSize−1) and `contagion`; `endTurn` start applies `tithe`/`quarantine`/`creeping-end`, end applies `attrition`; `doHailMary` checks `empty-stores`; `doActivate` checks `fevered`; `dealToEnemy` checks `crossfire` on kill; enemy power +1 under `siege` (in `startCombat`); block gains route through a `gainBlock(cs, n)` helper that halves under `cold-grip`; `drawCards` reshuffle applies `toll`.

- [ ] **Step 1: Write the failing test** — `tests/core/struggles.test.ts` covering: `rationing` reduces opening hand to 4; `siege` gives a tower power 3; `empty-stores` makes hail mary throw; `cold-grip` makes a yellow scrap give 0 block (`Math.floor(1/2)`); `dealStruggleChoices(new Rng(1), 'spades', 2)` returns 3 options with `pick: 2`. (Same test style as previous tasks — construct with `startCombat({ ..., struggles: ['rationing'] })` etc.)

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement** — content file is a direct transcription of the table; combat hooks are one-to-three lines each at the named sites, each guarded by `cs.struggles.includes('<id>')`.

- [ ] **Step 4: Run `npm test` — all green.**

- [ ] **Step 5: Commit**

```bash
git add src/content/struggles.ts src/core/combat.ts tests/core/struggles.test.ts
git commit -m "feat: twelve domain struggles applied through combat hooks"
```

---

### Task 15: Rewards and relics

**Files:**
- Create: `src/core/rewards.ts`, `src/content/relics.ts`
- Modify: `src/core/combat.ts` (relic hooks), `src/core/followups.ts` (relic activation hooks)
- Test: `tests/core/rewards.test.ts`

Spec: §7. Reward points per defeated enemy from `CONFIG.rewardPoints`. Suit rewards, one **choice** granted per defeated enemy card by suit: ♥ heal `CONFIG.healAmount`; ♠ burn any card in the deck **or** cleanse one mark anywhere; ♦ scout / window reroll token / window widen token / tutor (place a chosen card on top of the deck for the next fight); ♣ hand size +1 next fight.

Eight relics (`src/content/relics.ts`), exact definitions:

| id | element | effect |
|---|---|---|
| `kindling` | fire | 2nd fire-line activation in a round: deal 2 to a random enemy |
| `emberheart` | fire | first fire-line activation each fight costs 1 less fuel |
| `tailwind` | air | 2nd air-line activation in a round: draw 1 |
| `kestrel` | air | draw 1 extra card on round 1 of every fight |
| `bulwark` | earth | 2nd earth-line activation in a round: gain block 2 |
| `roots` | earth | retaliation deals +1 |
| `springwell` | water | first merge each fight: heal 1 |
| `tidal-charm` | water | first decombine each fight burns nothing |

("fire-line" = any card whose colours include red, etc.)

**Interfaces:**
```ts
// rewards.ts
export interface PendingRewards {
  points: number;
  suitChoices: Suit[];        // one entry per defeated enemy
}
export function computeRewards(defeated: EnemySpec[]): PendingRewards;
export type RewardCommand =
  | { type: 'heal' } | { type: 'burnCard'; cardId: string } | { type: 'cleanse'; cardId: string; mark: MarkType }
  | { type: 'scoutToken' } | { type: 'rerollToken' } | { type: 'widenToken' } | { type: 'tutor'; cardId: string }
  | { type: 'handSize' } | { type: 'skip' };
// applied by run.ts (Task 17) against RunState; validation: command must match the suit being spent
export function relicDef(id: string): RelicDef;   // relics.ts, throws on unknown
```
Relic hooks: `followups.onActivated` handles `kindling`/`tailwind`/`bulwark` (check `cs.relics`); `startCombat` handles `kestrel`; `doActivate` handles `emberheart` (a `cs.emberheartUsed` flag); `performMerge` handles `springwell` (heal 1, once per fight — `cs.springwellUsed`); decombine paths handle `tidal-charm` (skip the burn once — `cs.tidalCharmUsed`). Add the three `xxxUsed: boolean` flags to `CombatState`.

- [ ] **Step 1: Write the failing test** — cover: `computeRewards` for a tower+fortress gives `points: 4` and `suitChoices` of both suits; `kindling` fires on the 2nd fire activation (reuse the Task 9 test setup with `relics: ['kindling']`); `kestrel` deals a 6-card opening hand.

- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement.** — [ ] **Step 4: `npm test` green.**

- [ ] **Step 5: Commit**

```bash
git add src/core/rewards.ts src/content/relics.ts src/core/combat.ts src/core/followups.ts tests/core/rewards.test.ts
git commit -m "feat: reward computation and eight elemental relics"
```

---

### Task 16: Forge window

**Files:**
- Create: `src/core/forgewindow.ts`
- Test: `tests/core/forgewindow.test.ts`

Spec: §4.2. Deal `CONFIG.forgeWindowSize` (+ widen tokens × `CONFIG.windowWidenAmount`) cards **randomly from the run deck's raws and corruption cards** (forged cards never occupy window slots but are all available for tier-3 merges). Corruption cards squat: they fill slots and can't be used. Merging within the window follows the same forge rules; merges are free and unlimited; a reroll token redeals the unused window cards. Closing the window shuffles the unused cards conceptually back (they never actually left the deck list — the window holds references).

**Interfaces:**
```ts
export interface ForgeWindow { slotIds: string[]; rerollsLeft: number }
export function openWindow(deck: Card[], rng: Rng, size: number, rerolls: number): ForgeWindow;
export function windowMerge(deck: Card[], win: ForgeWindow, idGen: IdGen, cardIds: string[],
  events: GameEvent[]): ForgedCard;
  // raws must be window slots; forged participants come from the deck at large;
  // constituents leave the deck, the forged card joins it; plagueTouch applies (no aura)
export function windowReroll(deck: Card[], win: ForgeWindow, rng: Rng): void;
export function windowUnmerge(deck: Card[], idGen: IdGen, cardId: string,
  burnConstituentId: string, events: GameEvent[]): void; // free-form unmerge between fights (burns one, spec §2.4)
```

- [ ] **Step 1: Write the failing test** — cover: window size respects config+widen; corruption cards can appear in slots but `windowMerge` rejects them; a tier-2 merge consumes window raws from the deck and adds the forged card; tier-3 merge works with two forged cards not in the window; reroll redeals only unspent slots and decrements `rerollsLeft`.

- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement** (~60 lines; reuse `tier2Target`/`forgeTier2`/`forgeTier3`/`plagueTouch`). — [ ] **Step 4: `npm test` green.**

- [ ] **Step 5: Commit**

```bash
git add src/core/forgewindow.ts tests/core/forgewindow.test.ts
git commit -m "feat: between-fight forge window with rerolls and corruption squatting"
```

---

### Task 17: The run state machine

**Files:**
- Create: `src/core/run.ts`
- Test: `tests/core/run.test.ts`

Spec: §1.3, §4.1, and the phase flow. This is the single entry point the UI and sim consume.

**Interfaces:**
```ts
export type Phase = 'originDraft' | 'map' | 'strugglePick' | 'combat'
  | 'rewards' | 'forgeWindow' | 'victory' | 'defeat';

export interface RunState {
  phase: Phase;
  seed: number; rngState: number; idGen: IdGen;
  hp: number; deck: Card[];                     // every player card (raw/forged/corruption)
  relics: string[]; rewardPoints: number;
  scoutTokens: number; rerollTokens: number; widenTokens: number;
  nextHandBonus: number;                        // clubs reward, consumed by next fight
  map: CampaignMap;
  originOptions?: string[];                     // three tier-2 defIds
  struggleOptions?: { options: StruggleDef[]; pick: number; chosen: string[] };
  combat?: CombatState;
  pendingRewards?: PendingRewards;
  window?: ForgeWindow;
  log: GameEvent[];
}

export type RunCommand =
  | { type: 'chooseOrigin'; defId: string }
  | { type: 'moveTo'; nodeId: string }
  | { type: 'scout'; nodeId: string }
  | { type: 'toggleStruggle'; id: string } | { type: 'confirmStruggles' }
  | { type: 'combat'; cmd: CombatCommand }
  | { type: 'reward'; suitIndex: number; cmd: RewardCommand }
  | { type: 'buyRelic'; id: string } | { type: 'buyReducedStruggles' }
  | { type: 'windowMerge'; cardIds: string[] } | { type: 'windowUnmerge'; cardId: string; burnConstituentId: string }
  | { type: 'windowReroll' } | { type: 'closeWindow' };

export function newRun(seed: number): RunState;
export function runCommand(run: RunState, cmd: RunCommand): GameEvent[];
export function serialize(run: RunState): string;      // JSON.stringify of the whole state
export function deserialize(json: string): RunState;
```

Phase transitions (each implemented in `runCommand`):
1. `newRun`: build deck (76 raws), deal 3 distinct random tier-2 defIds as `originOptions`, phase `originDraft`. Rng lives in `rngState` — every function reconstructs `new Rng(run.rngState)` and writes back `run.rngState = rng.state` before returning.
2. `chooseOrigin`: forge the chosen def from random raws of its colour summing to its variant total (search: shuffle that colour's raws, greedily pick values that can reach the total; the search always succeeds on a fresh deck); add one corruption card `makeCorruptionCard(idGen, map.domainOrder[0], 'tower')` (spec §4.1); phase → `map`.
3. `moveTo`: `advance`; count struggles = max over node cards of `CONFIG.strugglesByRank[rankClass]` (minus a bought reduction, floor 0); if 0 → start combat directly, else phase → `strugglePick` with `dealStruggleChoices`.
4. `confirmStruggles` → start combat: **inject** corruption — for each enemy card, add `CONFIG.corruptionInjection[rankClass]` corruption cards of that suit/rank to `run.deck` permanently (spec §3.4); `startCombat` with `handSize: CONFIG.handSize + nextHandBonus` (then reset the bonus), deck = `run.deck` copy-by-reference list.
5. Combat commands proxy to `combatCommand`; when `combat.outcome` flips: `lost` → phase `defeat`; `won` → write back `hp`, reconcile the deck (burned/exiled cards are already gone from the card lists — the deck is rebuilt as `[...drawPile, ...discardPile, ...hand, ...attachedCards]`), compute `pendingRewards`, phase → `rewards`.
6. Reward commands spend `suitChoices` entries one at a time (`skip` allowed); relic/struggle purchases spend `rewardPoints`; a final implicit transition when all suit choices are spent → open window, phase `forgeWindow`.
7. `closeWindow`: if the cleared node was the boss column → `onLevelCleared` (→ `victory` or next level); phase → `map`.

- [ ] **Step 1: Write the failing test** — an integration test playing a scripted mini-run with seed 1: `newRun` → assert 3 origin options → `chooseOrigin` → assert deck has 1 forged + 1 corruption + fewer raws → `moveTo` the easy node → (tower: no struggles) assert phase `combat` and the deck gained 1 corruption card → cheat (`run.combat!.enemies[0]!.hp = 1`) → red-scrap it dead (place a red raw in hand directly) → assert phase `rewards` and `rewardPoints ≥ 1` → spend/skip choices → assert phase `forgeWindow` with 7 slots → `closeWindow` → phase `map`. Plus: `deserialize(serialize(run))` deep-equals and continues (one more command works).

- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement (~200 lines, mostly the transition table above).** — [ ] **Step 4: `npm test` green.**

- [ ] **Step 5: Commit**

```bash
git add src/core/run.ts tests/core/run.test.ts
git commit -m "feat: run state machine — origin draft to victory/defeat, serializable"
```

---

### Task 18: Bot and simulation harness

**Files:**
- Create: `src/sim/bot.ts`, `src/sim/simulate.ts`, `src/sim/cli.ts`
- Test: `tests/sim/simulate.test.ts`

**Interfaces:**
```ts
// bot.ts
export function botCommand(run: RunState): RunCommand;  // total: always returns a legal command
// simulate.ts
export interface SimStats {
  runs: number; wins: number; winRate: number;
  avgLevelReached: number; avgFinalDeckSize: number; avgRoundsPerFight: number;
  stalls: number;   // runs aborted at the command cap
}
export function simulateOne(seed: number, maxCommands?: number):
  { outcome: 'victory' | 'defeat' | 'stall'; levelReached: number; deckSize: number };
export function simulate(runs: number, baseSeed: number): SimStats;
```

Bot policy (greedy, deterministic given state; all "random" choices use the run's rng via commands, not `Math.random`):
- originDraft: pick `originOptions[0]`.
- map: `moveTo` the first node of the next column.
- strugglePick: toggle the first `pick` options, confirm.
- combat, in order: resolve pending choice with `pay` when offered else first option → activate every affordable forged card in hand (targets: lowest-hp enemy; decombine targets: never — skip cards whose atoms need decombine/discard unless satisfiable trivially: pick the first legal target/burn) → green-scrap a legal tier-2 merge if one exists in hand → red-scrap at lowest-hp enemy → yellow-scrap if any enemy alive → blue-scrap one card → endTurn.
- rewards: heal when `hp < 12`, else first legal command per suit (♠ burns a corruption card if any, else skip); buy a relic matching the origin element when affordable.
- forgeWindow: perform every legal tier-2 merge (prefer the colour with most copies among forged cards), then tier-3 merges, then close.
- `maxCommands` default 2000; exceeding → `'stall'` (a bot bug, counted, never an infinite loop).

`cli.ts` (run via `npm run sim -- 200 42`):
```ts
import { simulate } from './simulate';
const [runs = '100', seed = '1'] = process.argv.slice(2);
const stats = simulate(Number(runs), Number(seed));
console.log(JSON.stringify(stats, null, 2));
```

- [ ] **Step 1: Write the failing test** — `simulateOne(1)` returns an outcome without throwing and `levelReached ≥ 0`; `simulate(5, 1)` aggregates 5 runs deterministically (`simulate(5, 1)` twice gives identical stats); `stalls` is reported.

- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement.** — [ ] **Step 4: `npm test` green, then run `npm run sim -- 50 7` and paste the stats into the commit message body — this is the game's first balance snapshot.**

- [ ] **Step 5: Commit**

```bash
git add src/sim tests/sim
git commit -m "feat: greedy bot and headless simulation harness"
```

---

### Task 19: UI shell and combat screen

**Files:**
- Create: `src/ui/store.ts`, `src/ui/render.ts`, `src/ui/screens/combat.ts`, `src/ui/style.css`
- Modify: `src/ui/main.ts`, `index.html` (link the stylesheet)
- Test: `tests/ui/combat.test.ts` (happy-dom)

Architecture: `store.ts` holds `{ run: RunState }`, exposes `dispatch(cmd: RunCommand)` which calls `runCommand`, catches `Error('illegal: …')` into a status line, and re-renders the whole app (`render(app, store)` — full re-render on every action; no virtual DOM, no state in the DOM). `render.ts` switches on `run.phase` and delegates to a screen module; every screen is `(run: RunState, dispatch) => HTMLElement`.

Combat screen contents (functional, grim-dark styling comes in Task 21):
- Enemy row: one panel per enemy — rank name, suit glyph, `hp/maxHp`, power, attachment count; click sets the current target (stored in a module-level `let targetId` reset on render if dead).
- Hand row: one card per element — raws show colour+value with a **Scrap** button (target-dependent); forged cards show name/defId, tier, marks, fuel cost, an **Activate** button that opens a fuel-picker (checkboxes over the raws in hand; confirm dispatches with chosen `fuelIds`), plus decombine/discard pickers when the def needs them.
- Status bar: hp, block, round, draw/discard counts, deck-corruption count, clock/death counter when present, struggles in effect.
- Choice modal when `combat.pendingChoice` is set — its buttons dispatch `resolveChoice`.
- **End turn** button; event log (last 20 `run.log` entries) down the side.

- [ ] **Step 1: Write the failing test** — happy-dom smoke test: build a `newRun(1)`, force it into combat (drive commands like the Task 17 test), `render` into a detached element, assert: enemy panel exists, hand has cards, clicking End Turn advances `combat.round`.

- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement.** — [ ] **Step 4: `npm test` green; then `npm run dev` and play one fight by hand — every command reachable by mouse.**

- [ ] **Step 5: Commit**

```bash
git add src/ui index.html tests/ui
git commit -m "feat: DOM shell and playable combat screen"
```

---

### Task 20: Remaining screens — origin, map, struggles, rewards, forge window, endings

**Files:**
- Create: `src/ui/screens/origin.ts`, `src/ui/screens/map.ts`, `src/ui/screens/struggles.ts`, `src/ui/screens/rewards.ts`, `src/ui/screens/window.ts`, `src/ui/screens/ending.ts`
- Modify: `src/ui/render.ts`
- Test: `tests/ui/screens.test.ts`

Screen contents:
- **origin**: three big cards (element name, variant total, ability text from `elementDef`), click = `chooseOrigin`.
- **map**: columns left→right; nodes as boxes showing zone + (revealed ? exact cards : rank-class silhouettes); current position highlighted; next-column nodes clickable (`moveTo`); scout buttons priced via `scoutCost` when `scoutTokens > 0`; defeated domains listed as struck-through horsemen; level indicator "Level N — Domain of X".
- **struggles**: dealt options as toggle cards with full text; confirm enabled at exactly `pick` chosen.
- **rewards**: points balance; one row per unspent suit choice with its option buttons (burn/cleanse open a card-picker over the deck list); relic shop (owned greyed); Continue → dispatches remaining `skip`s.
- **window**: slots as cards (corruption slots visibly rotten and inert); multi-select raws → Merge button (enabled when `tier2Target` passes); forged-card tray below for tier-3 merges and unmerge (with burn-picker); reroll button when tokens remain; Close.
- **ending**: victory or defeat splash with run stats (level reached, deck size, cards burned — count from `run.log`); New Run button (`newRun` with a new seed = old seed + 1).

- [ ] **Step 1: Write the failing test** — smoke: `newRun(1)` renders the origin screen with 3 options; after `chooseOrigin` the map screen shows 6 columns; ending screen renders for a `defeat` phase state.

- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement.** — [ ] **Step 4: `npm test` green; `npm run dev` and play a full level by hand.**

- [ ] **Step 5: Commit**

```bash
git add src/ui tests/ui
git commit -m "feat: all run screens — a full crusade is playable in the browser"
```

---

### Task 21: The forecast panel, fuel warnings, and styling

**Files:**
- Create: `src/ui/forecast.ts`
- Modify: `src/ui/screens/window.ts`, `src/ui/screens/combat.ts`, `src/ui/style.css`
- Test: `tests/ui/forecast.test.ts`

Spec: §9.4 — visible narrowing is the emotional core.

**Interfaces:**
```ts
export interface Forecast {
  tier2: { defId: string; reachable: boolean }[];   // all 12 variants
  tier3: { defId: string; reachable: boolean }[];   // all 10
  fuel: { colour: Colour; raws: number; forgedNeedingIt: number }[];
  warnings: string[];  // e.g. "Merging these would leave 0 red raws for 2 fire cards."
}
export function forecast(deck: Card[], proposedMergeIds?: string[]): Forecast;
```
Reachability: for each colour, can any subset of that colour's raw values sum to 7/8/9? (Subset-sum over values 0–9 with ≤19 items — a simple bitset DP over sums 0..9 suffices: `reachable[s]` for s ≤ 9.) Tier-3 reachable if both required tier-2 elements are either already forged or reachable (counting double requirements: `wind` needs two airs). `proposedMergeIds` recomputes as-if those cards were consumed, producing the warnings diff. Render the panel in the forge window (always) and combat (collapsed, expandable).

Styling pass (`style.css`): dark parchment-and-ash palette, colour-coded card borders (red/yellow/blue/green), mark stickers as small glyph badges (♦ withered, ♥ pustule, ♣ crack, ♠ skull), enemy panels as looming slabs, the four horsemen's domains tinting the combat backdrop. Keep it all CSS — no images.

- [ ] **Step 1: Write the failing test** — `forecast` on a fresh 76-raw deck marks all tier-2 and tier-3 reachable; after removing every red card, `fire-*` and `volcano` unreachable, `smoke`/`magma`/`steam` unreachable, `wind` still reachable; a `proposedMergeIds` that consumes the last two red 9s yields a warning mentioning "red".

- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement.** — [ ] **Step 4: `npm test` green; visual check in `npm run dev`.**

- [ ] **Step 5: Commit**

```bash
git add src/ui tests/ui
git commit -m "feat: forge forecast panel, fuel starvation warnings, grim styling"
```

---

## Final verification (after Task 21)

- [ ] `npm test` — every suite green.
- [ ] `npm run sim -- 200 1` — completes without stalls > 5%; record the win rate in the commit/PR notes (target band is 5–20% for a *skilled* player, so the greedy bot landing anywhere under ~20% is acceptable at this stage; 0% wins across 200 runs means tuning is needed before the prototype is honest).
- [ ] `npm run dev` — play one full crusade by hand, however it ends.
- [ ] Grep guards: `grep -rn "Math.random\|Date.now\|new Date(" src/` → no hits; `grep -rn "from '../ui\|from './ui" src/core src/content src/sim` → no hits.


