# Hopeless Crusade — Design Spec

*Working title. A solo reverse deck builder about refining a world of raw elements into a weapon while the Four Horsemen corrupt it, played as a doomed-but-winnable crusade.*

Date: 2026-07-09
Status: Approved by designer (all sections), pending final spec review.

---

## 1. Vision

### 1.1 The soul of the game

The **hopeless crusade** is the non-negotiable core: a doomed war against the Four
Horsemen — dread, corruption, impossible odds, lose-lose bargains. The elemental
combining engine exists in service of that fantasy. When mechanics and tone
conflict, tone wins.

### 1.2 Victory model

**Rare but real.** Most crusades end in the dirt, but a skilled player with a
good run genuinely kills Death. Balance target: roughly 5–20% win rate for an
experienced player. Hope must be engineered in — the player should always be
able to see, in hindsight, the run where they would have made it. Despair comes
from the price, not from a rigged game.

### 1.3 The structural spine: reverse deck building

The player starts with the **entire raw deck** (all 76 Uno number cards: four
colours × values 0–9, with the standard duplication). Nothing is ever added to
the deck except corruption. The game's only deck verbs are:

- **merge** — combine cards into more powerful forged cards
- **burn** — permanently remove a card from the run
- **cleanse** — remove a corruption mark from a card
- **scrap** — spend a raw card in combat for a weak basic effect
- **fuel** — spend raw cards in combat to activate forged cards

Deck building inverts: the player is a **sculptor, not a collector**. Progression
is self-limitation — every merge converts flexibility into power irreversibly,
and the dread is watching your own option space narrow with every choice.

Uno action/wild cards are excluded from v1 and reserved as a future expansion
slot (candidate: rare "primal" cards).

### 1.4 Player life

**Separate HP pool** (initial value ~20; tuning parameter). Deck attrition and
survival are independent resources, which lets different horsemen threaten
different things: Famine and Disease attack the deck and its economy, War and
Death attack both flesh and existence.

---

## 2. Cards and forging

### 2.1 Tier 1 — raws

A raw card is a colour (red/fire, yellow/earth, blue/air, green/water) and a
number (0–9). Raws have **no combat text**. Numbers are crafting economics, not
combat stats: 9s are near-ready forge cores, 1s and 2s are born fuel, mid
numbers need partners.

### 2.2 Tier 2 — forged elements

Merge any number of raws of a **single colour** summing to **exactly 7, 8, or
9** → one forged element of that colour. The total selects one of three
variants ("paths") of that element. Element identities:

| Colour | Element | Verb |
|---|---|---|
| Blue | Air | card drawing |
| Yellow | Earth | defence / attach / retaliation |
| Red | Fire | direct damage |
| Green | Water | triggers on combining |

Baseline tier-2 abilities (from physical playtests; all numbers are tuning
parameters):

- **Air** — deal 1 damage for each card you draw; activate: draw 1 card.
- **Earth** — if attached to an enemy that attacks, deal 1 damage to any enemy;
  activate: attach to an enemy.
- **Fire** — activate: 2 damage to an enemy.
- **Water** — when you combine any cards, deal 1 damage.

The 7/8/9 variant axis (exact design per element to be settled during content
authoring, e.g. cheaper-fuel vs stronger-effect vs followup-oriented) is a
first-class content dimension, stored as data.

### 2.3 Tier 3 — variations

Merge **two tier-2 elements** → one of the ten pair variations, determined by
the colour pair. Each has an activate ability plus a **followup** trigger:

| Pair | Card | Ability sketch (from playtests) |
|---|---|---|
| Air+Air | Wind | damage per card drawn; draw 2. Followup 2× (Storm): draw 2 more |
| Air+Fire | Smoke | draw 1, discard 1, deal 1. Followup 2+ (Ash): 1 damage to each enemy hit by smoke this round |
| Earth+Earth | Land | attached retaliation 2. Followup 2× (Landslide): deflect 1 per attached card |
| Earth+Air | Dust | build the dust storm. Followup X (Dust Storm): deflect 0/2/3/5/6 by size |
| Fire+Earth | Magma | attach to enemy. Followup 2+ attachments (Lava): 1 damage per attachment |
| Water+Earth | Tree | becomes defender with 2 health. Followup 3+ (Forest): temporary X-strength shield |
| Fire+Fire | Volcano | prepare. Followup X (Eruption): 3 + X damage split between X enemies |
| Water+Water | Lake | combine-trigger 2; de-combine a card. Followup 2× (Ocean): de-combine another |
| Air+Water | Rain | draw 1, deal 1. Followup 3× (Flood): draw 2, deal 2 — *flagged in playtests as needing redesign* |
| Water+Fire | Steam | combine-trigger 1; decombine + deal 1. Followup 2+ (Pressure): decombine up to X |

Known balance flags from physical playtests: Volcano overpowered; Rain
incoherent; card-draw archetypes underpowered. These are tuning work for the
simulation phase, not design blockers.

### 2.4 Un-merging

A forged card may be decombined, but each un-merge **permanently burns one
constituent card**, chosen by the player. (Disease triggers that force
decombination waive the burn but Plague-mark all constituents — see §5.)

Water-line decombine effects (Lake, Steam) interact with the fuel economy as
**fuel recovery**: breaking your own forgings back into spendable raws is a
deliberate strategic identity.

### 2.5 Marks

Marks are permanent stickers on cards (the legacy-game idea, digital). They
persist until cleansed. Cleansing is deliberately scarce: ♠ rewards (§7) and
specific elements grown into the purifier role (Tree and Lake are the natural
fit, giving the water line a defensive identity). Mark definitions per horseman
in §5.

---

## 3. Combat

### 3.1 Turn structure

1. Draw to hand size (base 5).
2. Player acts in any order, limited only by hand and fuel (no action count):
   - **Scrap** any raw for its colour-true basic effect:
     - Red: deal 1 damage
     - Yellow: block 1
     - Blue: draw 1 card
     - Green: **perform one merge right now** (the only way to forge mid-combat)
   - **Activate** a forged card by paying its fuel cost with **colour-matched
     raws** discarded from hand (strict matching — see §3.2). Each card
     activates at most once per round (globalised from the steam playtest rule).
   - **Followups** trigger free when their conditions are met.
   - Hail mary (floor beneath rock bottom): burn any three raws to deal 1 damage.
3. Every surviving enemy strikes per its power.
4. Discards reshuffle into the deck when the draw pile empties (standard cycle).

### 3.2 Fuel: strict colour matching

A forged card's activation cost is paid only in raws of its colour (tier-3
dual-colour cards accept either of their two constituent colours; exact
per-card costs are content data). This is the brutal option, chosen
deliberately: merging away all your reds means your fire engine literally
cannot fire. Mitigations are **tools, not rule softening**:

- scrap effects work regardless of what you've forged,
- water-line decombining recovers fuel,
- the hail mary always exists,
- the UI forecasts fuel starvation before it happens (§9.4).

Attached cards and defenders do **not** persist between rounds by default
(playtest learning: board states should be rebuilt from draws each round;
persistent-board is an explicit per-card exception if ever wanted).

### 3.3 Enemies

Enemies come from the map deck (standard 52-card deck; jokers are excluded
from v1 — the original joker-boss role is superseded by aces-as-manifestations).
For an enemy card: number = health (J/Q/K = 11/12/13, Ace = manifestation),
rank class sets power and corruption injection:

| Rank | Name | Power | Corruption cards injected pre-fight |
|---|---|---|---|
| 2–5 | Tower | 2 | 1 |
| 6–10 | Stronghold | 4 | 2 |
| J/Q/K | Fortress | 6 | 2 |
| Ace | Manifestation | per-manifestation | 4 |

Suit = horseman domain, which sets the corruption-trigger behaviour (§5).
Encounters may contain multiple enemy cards (mixed towers/strongholds per the
map's zone budgets).

The player starts the run with **one corruption card** already in the deck
(keyed to the first domain — §4.1).

### 3.4 The corruption ratchet

Corruption cards shuffled into a deck that only shrinks means corruption
**density rises automatically over the run**: one plague card in 70 is a
whisper; by endgame it is a third of every hand. The world thins and the rot
concentrates. This is the game's central difficulty curve and requires no
hand-tuning — entropy produces it.

---

## 4. The constraint fabric

The player never gets open access to the raw pool. Every layer of the run
deals a situation; skill is improvising inside it (TFT/roguelike pressure —
constraints are found, not chosen on a whim).

### 4.1 The origin draft

A crusade opens by dealing **three random pre-forged tier-2 elements; keep
one**. The engine's seed is a constrained pick, not a plan. The player is also
dealt their first corruption card, keyed to the first domain they will face.
The kept origin card's constituents are removed from the starting deck (the
forge made it from somewhere): randomly dealt raws of its colour summing to
its variant total.

### 4.2 The forge window (centrepiece)

Between fights, the forge deals a **window of 7 random raws drawn from the
deck**. All merging and burning happens within that window; existing forged
cards may participate (they are few and known — scarcity is in raw material).
Unused window cards shuffle back. Corruption cards can be dealt into the
window, squatting uselessly in slots. Rerolling or widening the window is
purchasable with ♦ rewards (§7).

Structural consequence (intended): a window of 7 over 76 raws covers ~9% of
options — early forging is opportunistic scavenging. Over a deck refined to
~30, the same window covers nearly a quarter — flexibility grows across the
run while corruption density rises in the same shrinking deck. The two curves
cross; both the loosening constraints and the mounting dread fall out of deck
shrinkage.

### 4.3 Struggle picks

Harder fights require choosing **X struggles** from a dealt set of that
domain's cruelties (X scales with rank; exact struggle lists are content data
authored per domain from the §5 axes). Constraints picked from a menu the
player didn't write. Boss fights should be terrifying.

### 4.4 In combat

The draw is the constraint: green-scrap merges only operate on the current
hand.

---

## 5. The Four Horsemen

Each horseman attacks a **different resource**, has a signature **mark**, and
**corruption triggers** that fire when its corruption cards are drawn from the
player's deck mid-combat, escalating with the rank of the enemy that injected
them.

### 5.1 Famine ♦ — attacks fuel

- **Mark — Famished:** pay 1 extra raw (any colour) every time this card
  activates; on a raw card, scrapping it costs 1 extra raw.
- Tower: pay 1 raw or discard a card.
- Stronghold: pay 1 raw or scrapping is sealed this round.
- Fortress: pay 2 raws or a card in hand is marked Famished.
- **Manifestation:** the fight has a 10-round clock; each corruption draw —
  mark a card Famished *or* lose a round.

### 5.2 Disease ♥ — attacks forgings

- **Mark — Plagued:** when drawn, gains another Plague mark; at three, the card
  decombines (no burn cost) and every constituent is Plagued; anything they
  later merge with is Plagued too.
- Tower: decombine one of the player's forged cards; constituents are Plagued.
- Stronghold: mark a card in hand.
- Fortress: one element (player's choice) is locked this round, and a card is
  marked.
- **Manifestation:** aura — anything merged during this fight is born Plagued;
  each corruption draw spreads a mark to a random forged card.

### 5.3 War ♣ — attacks flesh and arsenal together

- **Mark — Scarred:** the card's numeric effects are reduced by 1 (min 0),
  permanently until cleansed; a Scarred raw loses its scrap effect entirely
  (it remains valid fuel and merge material).
- Tower: Scar a card.
- Stronghold: the player's damage-dealing activations recoil 1 damage onto the
  player this round.
- Fortress: discard every Scarred card in hand.
- **Manifestation:** the dead don't stay dead — destroyed enemies return once
  as weakened echoes; each corruption draw deals 2 to the player and Scars a
  card.

### 5.4 Death ♠ — attacks existence

- **Mark — Doomed:** when drawn, gains another Doom mark; at three, the card is
  destroyed — exiled from the run.
- Tower: Doom a random card in hand.
- Stronghold: Doom a card **and exile the top card of the deck face-down** —
  the player never learns what was lost.
- Fortress: choose — exile a forged card, or take 4 damage and Doom two cards.
- **Manifestation:** instant-lose condition — Death accumulates a counter with
  each corruption draw; at the threshold the player dies regardless of HP.
  Beatable. Barely. On purpose.

---

## 6. The campaign map

Kept nearly verbatim from the physical playtest that worked:

- Branching, tiered map dealt from a standard 52-card deck (no jokers in v1)
  that **never reshuffles** — faced cards never reappear.
- Zones per level: easy → easy-med → med → med-hard → hard → boss, with
  "hyphen" zones mixing cards from adjacent difficulty groups so drawn
  encounters may skew easier, harder, or mixed. Card budgets per suit: 4 easy,
  5 medium, 3 hard.
- Layout follows the hand-balanced example (columns of 2–3 nodes, splits and
  rejoins, ~10 encounter cards per level from the available pool).
- **Four levels, one manifestation each. Death is always last.** The order of
  the first three is dealt/chosen at run start (dealt for v1).
- A defeated horseman's **suit leaves the map deck** — later levels are dealt
  from the remaining domains, so the endgame map is dealt almost entirely from
  spades.
- Scouting: map nodes are face-down by default; ♦ reward points reveal them at
  1 point for the next step +1 per additional step ahead.

---

## 7. Rewards

After a victory the player earns **reward points proportional to encounter
difficulty**, plus suit-keyed rewards from the encounter's cards. Reframed for
a shrinking deck:

| Suit | Reward |
|---|---|
| ♥ Hearts | Heal |
| ♠ Spades | Burn a chosen card, or cleanse a mark |
| ♦ Diamonds | Scout the map ahead, or reroll/widen the next forge window, or tutor (move a chosen card toward the next hand) |
| ♣ Clubs | +1 hand size for the next encounter |

Reward points additionally buy **elemental followup relics**: persistent
passives keyed to elements that charge whenever that element activates (e.g.
"whenever you activate fire twice in a round, …"). These are the game's
tactical inertia — bought commitments that make chosen colours compound.
Expensive option: **reduced struggles** — pick one fewer struggle in the next
fight.

Merging is free between fights (within the forge window); there is no card
purchase of any kind.

---

## 8. Content summary (v1 scope)

- 4 raw colours × 10 values (76 cards with standard Uno duplication)
- 4 tier-2 elements × 3 variants (7/8/9)
- 10 tier-3 variations with followups
- 4 horsemen: 1 mark + 3 rank triggers + 1 manifestation gimmick each
- Struggle lists per domain (authored from §5 axes)
- Elemental followup relics (initial set: ~2 per element, tuning)
- Map generator per §6

Out of scope for v1: Uno action/wild cards, multiplayer/co-op, meta-progression
between runs, art beyond programmer UI.

---

## 9. Prototype architecture

### 9.1 Stack

Plain **TypeScript + Vite**, DOM rendering, no framework and no game engine.
(Phaser was considered and rejected for v1: the UI is text, panels, and card
lists — native DOM strengths — and the headless core means a Phaser front-end
can be added later without rewriting.)

### 9.2 The architectural law

`core/` is a **pure, deterministic, headless game engine**:

- seeded RNG only; no wall-clock, no I/O
- entire game state serializable; state in → events out
- knows nothing about rendering

`ui/` is a dumb DOM renderer over core state and events. `content/` holds all
cards, elements, variants, enemies, struggles, relics, and **all economy
numbers as data** — including the turn-economy variant switch.

### 9.3 Why the law pays

- **Simulation-first balancing:** auto-play thousands of seeded runs headlessly
  (bot policies) to tune volcano, rain, win rates toward the 5–20% target.
- **Swappable economy:** strict colour fuel is the shipped baseline; variants
  (any-colour-with-match-bonus, elemental saturation pools) live behind the
  config switch for play-comparison. Exploring the turn economy is an explicit
  design goal, not an afterthought.
- Cheap UI iteration and trivial save/replay (state + seed + event log).

### 9.4 UI first-class features

- **The forecast panel:** "from your remaining raws you can still forge: …" —
  visible narrowing of the option space is the game's emotional core and ships
  in the first playable.
- Fuel-starvation warnings (you are about to merge away your last activatable
  reds).
- Marks rendered as permanent stickers on cards, with history.

### 9.5 Testing

Unit tests against `core/` rules (merging legality, fuel payment, triggers,
marks, map dealing). Simulation harness doubles as an integration test.

---

## 10. Initial tuning values

All subject to simulation; recorded here so the first playable is fully
specified: HP 20 · hand size 5 · forge window 7 · merge totals {7,8,9} ·
tier-2 fuel cost 1, tier-3 fuel cost 2 (baseline before per-card data) ·
hail mary = burn 3 raws → 1 damage · enemy power 2/4/6 · corruption injection
1/2/2/4 · Death counter threshold 6 · manifestation clock 10 rounds ·
starting corruption 1 card · reward points 1/2/3/5 per
tower/stronghold/fortress/manifestation defeated · relic cost 4 points ·
reduced-struggles cost 6 points.
