# CLAUDE.md — Hopeless Crusade

A solo **reverse deck builder** browser game: the player starts with all 76 raw
Uno-style cards and refines them down into forged elemental cards while the
Four Horsemen corrupt the shrinking deck. TypeScript + Vite, **zero runtime
dependencies**, no framework, no game engine.

- **Live:** https://j-c-levin.github.io/hopeless-crusade/
- **Repo:** https://github.com/j-c-levin/hopeless-crusade

## Commands

| Command | What it does |
|---|---|
| `npm test` | Full vitest suite (124 tests; `tests/ui/**` runs in happy-dom, rest in node) |
| `npm run dev` | Vite dev server — game served at `/hopeless-crusade/` (base path) |
| `npm run build` | `tsc` typecheck + production build to `dist/` |
| `npm run sim -- 200 1` | Headless bot plays 200 seeded runs (args: runs, baseSeed) — the balance instrument |
| `npx tsc --noEmit` | Typecheck only (strict mode) |

## Non-negotiable architecture laws

Violating any of these is a bug, not a style choice:

1. **`src/core/` is a pure, deterministic, headless engine.** No DOM, no I/O,
   no `Math.random`, no `Date` — ALL randomness flows through the `Rng` class
   (`src/core/rng.ts`), whose numeric `state` lives in serializable game state.
   Same seed → byte-identical run.
2. **`src/core/` and `src/content/` never import from `src/ui/`.** One-way
   dependency: ui → core/content, never back. `src/sim/` also never imports ui.
3. **Every tuning number lives in `src/content/config.ts`** and every card
   ability in `src/content/elements.ts` (+ `struggles.ts`, `relics.ts`).
   Never inline a game number in engine code. Balance changes are data changes.
4. **Validate-before-mutate.** Every command handler throws
   `Error('illegal: ...')` BEFORE any state change. A rejected command must
   leave state untouched — this invariant is load-bearing and test-pinned.
5. **All game state is plain data** (`RunState`, `CombatState` — no class
   instances, no Maps/Sets). `serialize`/`deserialize` in `src/core/run.ts` is
   a JSON round-trip and must stay that way.
6. TypeScript `strict: true` + `noUncheckedIndexedAccess`. No `any` outside
   test scaffolding.

## File index — where to find things

### Engine (`src/core/`)
- `run.ts` — **the single entry point.** `newRun(seed)`, `runCommand(run, cmd)`,
  `serialize/deserialize`. Phase machine: originDraft → map → strugglePick? →
  combat → rewards → forgeWindow → (map | victory | defeat). Start here.
- `types.ts` — Card/Colour/Suit/Enemy/CombatState/marks types + colour↔element maps.
- `rng.ts` — seeded mulberry32 (`next/int/pick/shuffle`).
- `cards.ts` — 76-raw starting deck factory, id generation, card helpers.
- `forge.ts` — merge rules: tier-2 (single colour summing to exactly 7/8/9),
  tier-3 (`PAIR_DEF`: two tier-2s → wind/smoke/land/dust/magma/tree/volcano/lake/rain/steam),
  `unmerge` (burns one constituent).
- `combat.ts` — the largest file: turn loop, drawing (resumable when a
  corruption choice interrupts a batch — see `pendingDraws`), scrap actions
  (red=damage, yellow=block, blue=draw, green=merge-now), strict colour-fuel
  activation, effect-atom interpreter, hail mary, enemy strikes, war echoes.
- `followups.ts` — the ten tier-3 followups (storm/ash/eruption/duststorm/etc.)
  + relic activation hooks + `getDeflection`.
- `marks.ts` — famished/plagued/scarred/doomed semantics, draw escalation,
  plague contagion on merges.
- `corruption.ts` — the horsemen trigger tables (suit × rank), pending-choice
  machinery (`resolveChoice` resumes deferred draws).
- `map.ts` — lazily-dealt campaign map (52-card deck, never reshuffled),
  domain removal on boss kill, graceful bag-widening when pools run dry
  ("echoes of fallen domains" — nodes are never empty).
- `rewards.ts` — reward points + suit-choice command types.
- `forgewindow.ts` — the between-fights crafting window (dealt slots, rerolls).

### Content / tuning (`src/content/`)
- `config.ts` — EVERY tuning number (hp, hand size, fuel costs, enemy power,
  corruption injection, reward points, thresholds…).
- `elements.ts` — all 22 card defs (12 tier-2 variants, 10 tier-3) as data
  (`Atom` effect lists + followup descriptors).
- `struggles.ts` — 12 pre-fight handicaps, 3 per horseman domain.
- `relics.ts` — 8 purchasable elemental passives.

### Simulation (`src/sim/`)
- `bot.ts` — deterministic greedy policy (pure function of state, no rng).
- `simulate.ts` — `simulateOne(seed)` / `simulate(runs, baseSeed)` → SimStats;
  never crashes (illegal-command fallbacks + 2000-command stall cap).
- `cli.ts` — `npm run sim` entry.

### UI (`src/ui/`)
- `store.ts` — dispatch wrapper: catches `illegal:` errors into a status line,
  full re-render per action, no state in the DOM.
- `render.ts` — phase → screen router.
- `screens/` — one module per phase: `origin`, `map`, `struggles`, `combat`
  (the big one), `rewards`, `window` (forge), `ending`.
- `forecast.ts` — "what can you still forge" reachability (subset-sum DP,
  incl. a 2-bucket disjoint DP for same-element pairs) + fuel-starvation
  warnings. This panel is the game's emotional core per the spec.
- `describe.ts` — ability text derived from element defs (never hand-written).
- `style.css` — grim parchment-and-ash theme, domain tints, mark glyphs.

### Docs
- `docs/superpowers/specs/2026-07-09-hopeless-crusade-design.md` — **the
  design spec.** The authority on rules and intent, including post-implementation
  design rulings (win/loss precedence, landslide, map echoes) at the bottom.
- `docs/superpowers/plans/2026-07-09-hopeless-crusade-prototype.md` — the
  21-task implementation plan the codebase was built from (useful for the
  reasoning behind structures, but the CODE + SPEC are the truth if they differ).

### Tests (`tests/`)
Mirror `src/` paths. TDD is the house style: failing test first, then
implementation. `tests/ui/**` run in happy-dom (configured in `vite.config.ts`).

## Deployment

GitHub Pages via `.github/workflows/deploy.yml`: every push to `main` runs
`npm ci` → `npm test` → `npm run build` → deploys `dist/`. The Vite
`base: '/hopeless-crusade/'` in `vite.config.ts` matches the repo name — if
the repo is ever renamed, update the base or the site breaks. Pages is set to
"GitHub Actions" build type.

## Known state & next steps (as of 2026-07-10)

- **Balance is untuned.** The greedy sim bot wins 0/200 runs and dies on
  level 1 (partly a weak bot — it fuel-starves itself and skips
  decombine/discard cards). The design target is a 5–20% win rate for a
  skilled player. Tune via `config.ts`/`elements.ts` and measure with
  `npm run sim` — never by feel alone.
- Known deferred minor items (all reviewed, none blocking): no `engines` field
  in package.json; the 'activations'-kind followup silently ignores atom ops
  other than damage/draw/block; stale tutored-card ids are silently skipped if
  the card was burned/merged before the next fight; a rare engine stalemate
  exists (all-forged fuel-starved hand + full deflection) which the sim
  reports as a stall; UI pickers rely on engine rejection rather than
  disabling buttons; there is no UI affordance for scrapping a famished raw
  (needs an extra fuel card — engine supports it via `extraFuelIds`).
- Uno action/wild cards are deliberately out of v1 (reserved as future
  "primal" cards — see spec §1.3).

## Conventions for future work

- Read the spec section before changing a mechanic; if code and spec disagree,
  say so rather than silently picking one.
- New mechanics: content-first (add data to `src/content/`), interpret in the
  engine, keep the UI dumb.
- Keep commits small and imperative ("feat: …", "fix: …"); the suite must be
  green and `tsc --noEmit` clean before every commit.
- When touching combat/corruption seams, remember the two invariants people
  trip on: (a) only ONE pending choice may exist — drawing defers via
  `pendingDraws` rather than overwriting; (b) attached/defender cards live in
  `attachedCards` and return to the deck on victory via run.ts's
  reconciliation — don't invent new card zones without updating it.
