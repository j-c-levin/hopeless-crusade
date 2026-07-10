import { describe, it, expect } from 'vitest';
import { createStore } from '../../src/ui/store';
import { render } from '../../src/ui/render';
import { nodesInColumn } from '../../src/core/map';
import type { Store } from '../../src/ui/store';

// Drives a fresh store from origin draft into combat — same pattern as tests/ui/combat.test.ts
// and tests/core/run.test.ts.
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

// Drives on from combat through a won fight (cheating enemies dead) and skip-spends every
// reward, landing in the forge window — reuses the pattern from tests/core/run.test.ts's
// "carries a full campaign seed loop" case.
function driveToForgeWindow(store: Store): void {
  driveToCombat(store);
  expect(store.run.phase).toBe('combat');
  for (const e of store.run.combat!.enemies) e.hp = 0;
  let guard = 0;
  while (store.run.phase === 'combat' && guard++ < 10) {
    const pc = store.run.combat!.pendingChoice;
    if (pc) {
      store.dispatch({ type: 'combat', cmd: { type: 'resolveChoice', optionId: pc.options[0]!.id } });
    } else {
      store.dispatch({ type: 'combat', cmd: { type: 'endTurn' } });
    }
  }
  expect(store.run.phase).toBe('rewards');
  while (store.run.pendingRewards && store.run.pendingRewards.suitChoices.length > 0) {
    store.dispatch({ type: 'reward', suitIndex: 0, cmd: { type: 'skip' } });
  }
  expect(store.run.phase).toBe('forgeWindow');
}

describe('remaining run screens (happy-dom)', () => {
  it('newRun(1) renders the origin screen with 3 options', () => {
    const store = createStore(1);
    expect(store.run.phase).toBe('originDraft');

    const root = document.createElement('div');
    render(root, store);

    const options = root.querySelectorAll('[data-testid="origin-option"]');
    expect(options.length).toBe(3);
  });

  it('choosing an origin shows the map screen with a level header and clickable next-column nodes', () => {
    const store = createStore(1);
    store.dispatch({ type: 'chooseOrigin', defId: store.run.originOptions![0]! });
    expect(store.run.phase).toBe('map');

    const root = document.createElement('div');
    render(root, store);

    const heading = root.querySelector('h2');
    expect(heading?.textContent).toMatch(/Level 1/);

    const moveButtons = root.querySelectorAll('[data-action="move-to"]');
    expect(moveButtons.length).toBeGreaterThan(0);

    const columns = root.querySelectorAll('[data-testid="map-column"]');
    expect(columns.length).toBe(store.run.map.current.columns);
  });

  it('a run forced into phase "defeat" renders the ending screen with a New Run control', () => {
    const store = createStore(1);
    store.dispatch({ type: 'chooseOrigin', defId: store.run.originOptions![0]! });
    store.run.phase = 'defeat';

    const root = document.createElement('div');
    render(root, store);

    expect(root.querySelector('[data-testid="ending-title"]')?.textContent).toMatch(/Defeat/i);
    expect(root.querySelector('[data-action="new-run"]')).toBeTruthy();
  });

  it('the forge window screen renders slots after driving a fight to completion', () => {
    const store = createStore(1);
    driveToForgeWindow(store);

    const root = document.createElement('div');
    render(root, store);

    const slots = root.querySelectorAll('[data-testid="window-slot"]');
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.length).toBe(store.run.window!.slotIds.length);

    const closeBtn = root.querySelector('[data-action="close-window"]');
    expect(closeBtn).toBeTruthy();
  });
});
