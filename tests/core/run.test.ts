import { describe, it, expect } from 'vitest';
import { newRun, runCommand, serialize, deserialize, type RunState, type Phase } from '../../src/core/run';
import { nodesInColumn } from '../../src/core/map';
import { isForged, isCorruption, isRaw } from '../../src/core/cards';
import { CONFIG } from '../../src/content/config';
import type { RawCard } from '../../src/core/types';

describe('run state machine — integration', () => {
  it('plays a scripted mini-run from origin draft to a cleared forge window', () => {
    const run = newRun(1);
    expect(run.phase).toBe('originDraft');
    expect(run.originOptions).toHaveLength(3);
    expect(new Set(run.originOptions)).toEqual(new Set(run.originOptions)); // sanity: array exists
    expect(new Set(run.originOptions!).size).toBe(3); // distinct

    const rawsBefore = run.deck.filter(isRaw).length;
    expect(rawsBefore).toBe(76);

    runCommand(run, { type: 'chooseOrigin', defId: run.originOptions![0]! });
    expect(run.phase).toBe('map');
    expect(run.originOptions).toBeUndefined();
    expect(run.deck.filter(isForged)).toHaveLength(1);
    expect(run.deck.filter(isCorruption)).toHaveLength(CONFIG.startingCorruption);
    expect(run.deck.filter(isRaw).length).toBeLessThan(rawsBefore); // some raws consumed by the forge

    // the easy column (0) always holds a single tower-rank card => 0 struggles required
    const easyNode = nodesInColumn(run.map.current, 0)[0]!;
    const corruptionBefore = run.deck.filter(isCorruption).length;
    runCommand(run, { type: 'moveTo', nodeId: easyNode.id });
    expect(run.phase).toBe('combat');
    expect(run.combat).toBeDefined();
    expect(run.deck.filter(isCorruption)).toHaveLength(corruptionBefore + (CONFIG.corruptionInjection.tower ?? 0));

    // the opening draw can rarely trigger a corruption pending-choice; resolve it before acting
    if (run.combat!.pendingChoice) {
      const pc = run.combat!.pendingChoice;
      runCommand(run, { type: 'combat', cmd: { type: 'resolveChoice', optionId: pc.options[0]!.id } });
    }
    expect(run.phase).toBe('combat'); // a single tower enemy's opening draw should not resolve the fight

    // cheat the enemy down to 1 hp, then kill it with a red raw placed directly in hand
    const enemy = run.combat!.enemies[0]!;
    enemy.hp = 1;
    const redRaw: RawCard = { kind: 'raw', id: 'test-red-scrap', colour: 'red', value: 3, marks: {} };
    run.combat!.hand.push(redRaw);
    runCommand(run, {
      type: 'combat',
      cmd: { type: 'scrap', cardId: redRaw.id, targetEnemyId: enemy.id },
    });

    expect(run.phase).toBe('rewards');
    expect(run.pendingRewards).toBeDefined();
    expect(run.pendingRewards!.points).toBeGreaterThanOrEqual(1);
    expect(run.rewardPoints).toBeGreaterThanOrEqual(1);

    // spend/skip every dealt suit choice
    while (run.pendingRewards && run.pendingRewards.suitChoices.length > 0) {
      runCommand(run, { type: 'reward', suitIndex: 0, cmd: { type: 'skip' } });
    }

    expect(run.phase).toBe('forgeWindow');
    expect(run.window).toBeDefined();
    expect(run.window!.slotIds).toHaveLength(CONFIG.forgeWindowSize);

    runCommand(run, { type: 'closeWindow' });
    expect(run.phase).toBe('map');
    expect(run.window).toBeUndefined();
  });

  it('serializes and deserializes mid-run, and the restored run continues to accept commands', () => {
    const run = newRun(2);
    runCommand(run, { type: 'chooseOrigin', defId: run.originOptions![0]! });

    const json = serialize(run);
    const restored = deserialize(json);
    expect(restored).toEqual(run);

    const easyNode = nodesInColumn(restored.map.current, 0)[0]!;
    expect(() => runCommand(restored, { type: 'moveTo', nodeId: easyNode.id })).not.toThrow();
    expect(restored.phase).toBe('combat');
  });

  it('throws on commands issued in the wrong phase, without mutating state', () => {
    const run = newRun(3);
    expect(run.phase).toBe('originDraft');
    const before = serialize(run);
    expect(() => runCommand(run, { type: 'moveTo', nodeId: 'anything' })).toThrow(/illegal/);
    expect(serialize(run)).toBe(before); // no partial mutation on rejection

    expect(() => runCommand(run, {
      type: 'combat', cmd: { type: 'endTurn' },
    })).toThrow(/illegal/);

    expect(() => runCommand(run, { type: 'closeWindow' })).toThrow(/illegal/);
  });

  it('rejects choosing an origin that was not offered', () => {
    const run = newRun(4);
    expect(() => runCommand(run, { type: 'chooseOrigin', defId: 'not-a-real-option' })).toThrow(/illegal/);
  });

  it('carries a full campaign seed loop from origin through several combats without throwing', () => {
    // runCommand mutates run.phase in place; TS keeps property narrowing across function
    // calls, so read the phase through an accessor that re-evaluates at the declared type.
    const phase = (r: RunState): Phase => r.phase;
    for (let seed = 1; seed <= 8; seed++) {
      const run: RunState = newRun(seed);
      runCommand(run, { type: 'chooseOrigin', defId: run.originOptions![0]! });
      for (let col = 0; col < 6 && phase(run) === 'map'; col++) {
        const node = nodesInColumn(run.map.current, col)[0];
        if (!node) break;
        runCommand(run, { type: 'moveTo', nodeId: node.id });
        if (phase(run) === 'strugglePick') {
          const opts = run.struggleOptions!;
          for (let i = 0; i < opts.pick; i++) {
            runCommand(run, { type: 'toggleStruggle', id: opts.options[i]!.id });
          }
          runCommand(run, { type: 'confirmStruggles' });
        }
        if (phase(run) !== 'combat') break; // opening draw already resolved the fight (rare corruption swing)
        for (const e of run.combat!.enemies) e.hp = 0;
        let guard = 0;
        while (phase(run) === 'combat' && guard++ < 10) {
          const pc = run.combat!.pendingChoice;
          if (pc) {
            runCommand(run, { type: 'combat', cmd: { type: 'resolveChoice', optionId: pc.options[0]!.id } });
          } else {
            runCommand(run, { type: 'combat', cmd: { type: 'endTurn' } });
          }
        }
        expect(guard).toBeLessThan(10); // outcome resolved, not stuck
        if (phase(run) !== 'rewards') break; // defeat is a valid outcome; not this test's focus
        while (run.pendingRewards && run.pendingRewards.suitChoices.length > 0) {
          runCommand(run, { type: 'reward', suitIndex: 0, cmd: { type: 'skip' } });
        }
        expect(run.phase).toBe('forgeWindow');
        runCommand(run, { type: 'closeWindow' });
        expect(['map', 'victory']).toContain(run.phase);
        if (phase(run) === 'victory') break;
      }
    }
  });
});
