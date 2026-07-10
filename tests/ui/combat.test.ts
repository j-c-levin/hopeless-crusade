import { describe, it, expect } from 'vitest';
import { createStore } from '../../src/ui/store';
import { render } from '../../src/ui/render';
import { nodesInColumn } from '../../src/core/map';
import type { Store } from '../../src/ui/store';

// Drives a fresh store from origin draft into combat, reusing the pattern from
// tests/core/run.test.ts: choose the first offered origin, move to the single
// column-0 (tower) node, resolve struggles if any were dealt, and resolve the
// opening-draw pending choice if the corruption swing produced one.
function driveToCombat(store: Store): void {
  store.dispatch({ type: 'chooseOrigin', defId: store.run.originOptions![0]! });
  const easyNode = nodesInColumn(store.run.map.current, 0)[0]!;
  store.dispatch({ type: 'moveTo', nodeId: easyNode.id });
  if (store.run.phase === 'strugglePick') {
    const opts = store.run.struggleOptions!;
    for (let i = 0; i < opts.pick; i++) {
      store.dispatch({ type: 'toggleStruggle', id: opts.options[i]!.id });
    }
    store.dispatch({ type: 'confirmStruggles' });
  }
  if (store.run.combat?.pendingChoice) {
    const pc = store.run.combat.pendingChoice;
    store.dispatch({ type: 'combat', cmd: { type: 'resolveChoice', optionId: pc.options[0]!.id } });
  }
}

describe('combat screen (happy-dom)', () => {
  it('renders enemy panels and hand cards once combat starts', () => {
    const store = createStore(1);
    driveToCombat(store);
    expect(store.run.phase).toBe('combat');

    const root = document.createElement('div');
    render(root, store);

    const enemyPanels = root.querySelectorAll('[data-testid="enemy-panel"]');
    expect(enemyPanels.length).toBeGreaterThan(0);
    expect(enemyPanels.length).toBe(store.run.combat!.enemies.length);

    const handCards = root.querySelectorAll('[data-testid="hand-card"]');
    expect(handCards.length).toBe(store.run.combat!.hand.length);
    expect(handCards.length).toBeGreaterThan(0);
  });

  it('clicking End Turn advances combat.round (resolving any pending choice via the store)', () => {
    const store = createStore(1);
    driveToCombat(store);
    const root = document.createElement('div');
    render(root, store);

    const roundBefore = store.run.combat!.round;
    const endTurnBtn = root.querySelector<HTMLButtonElement>('[data-action="end-turn"]');
    expect(endTurnBtn).toBeTruthy();
    endTurnBtn!.click();

    // endTurn can itself surface a pending choice (e.g. a corruption draw trigger);
    // resolve it directly via the store so the round can complete.
    let guard = 0;
    while (store.run.combat?.pendingChoice && guard++ < 5) {
      const pc = store.run.combat.pendingChoice;
      store.dispatch({ type: 'combat', cmd: { type: 'resolveChoice', optionId: pc.options[0]!.id } });
    }

    expect(['combat', 'rewards', 'defeat']).toContain(store.run.phase);
    if (store.run.phase === 'combat') {
      expect(store.run.combat!.round).toBeGreaterThan(roundBefore);
    }
  });

  it('selecting a target and scrapping a red raw deals damage without throwing', () => {
    const store = createStore(1);
    driveToCombat(store);
    const root = document.createElement('div');
    render(root, store);

    const enemy = store.run.combat!.enemies[0]!;
    const enemyPanel = root.querySelector<HTMLElement>(`[data-enemy-id="${enemy.id}"]`);
    expect(enemyPanel).toBeTruthy();
    enemyPanel!.click();

    const redRaw = store.run.combat!.hand.find((c) => c.kind === 'raw' && c.colour === 'red');
    if (redRaw) {
      const hpBefore = enemy.hp;
      const scrapBtn = root.querySelector<HTMLButtonElement>(
        `[data-action="scrap"][data-card-id="${redRaw.id}"]`,
      );
      expect(scrapBtn).toBeTruthy();
      scrapBtn!.click();
      expect(store.status).toBeUndefined();
      expect(store.run.combat!.enemies.find((e) => e.id === enemy.id)!.hp).toBeLessThan(hpBefore);
    }
  });
});
