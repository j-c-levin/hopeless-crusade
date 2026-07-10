// Task 18: headless simulation harness. Drives newRun/runCommand with botCommand's choices,
// never crashing regardless of what the bot proposes.
import { newRun, runCommand, type RunCommand, type RunState } from '../core/run';
import { botCommand } from './bot';

export interface SimStats {
  runs: number; wins: number; winRate: number;
  avgLevelReached: number; avgFinalDeckSize: number;
  stalls: number;         // runs aborted at the command cap
  avgRoundsPerFight: number;
}

export interface SimOneResult {
  outcome: 'victory' | 'defeat' | 'stall';
  levelReached: number;
  deckSize: number;
  commands: number;
}

// A conservative recovery command for a phase, used only when the bot (or the command it
// proposed) turns out to be illegal against the live state. Phases without an obvious safe
// command (originDraft/map/strugglePick) return null — those failures simply burn a command
// from the budget and let the cap eventually resolve the run as 'stall', per the brief.
function safeFallback(run: RunState): RunCommand | null {
  switch (run.phase) {
    case 'combat': return { type: 'combat', cmd: { type: 'endTurn' } };
    case 'rewards': return { type: 'reward', suitIndex: 0, cmd: { type: 'skip' } };
    case 'forgeWindow': return { type: 'closeWindow' };
    default: return null;
  }
}

interface InternalResult extends SimOneResult {
  roundsSum: number;
  fights: number;
}

function runSimulation(seed: number, maxCommands: number): InternalResult {
  const run = newRun(seed);
  let commands = 0;
  let roundsSum = 0;
  let fights = 0;
  let prevPhase = run.phase;

  while (run.phase !== 'victory' && run.phase !== 'defeat' && commands < maxCommands) {
    let cmd: RunCommand | null;
    try {
      cmd = botCommand(run);
    } catch {
      cmd = safeFallback(run);
    }

    if (cmd) {
      try {
        runCommand(run, cmd);
      } catch {
        const fallback = safeFallback(run);
        if (fallback) {
          try {
            runCommand(run, fallback);
          } catch {
            // Even the fallback was illegal against this state; nothing safe left to try
            // this iteration. The command still counts against the budget below, so a
            // persistently-stuck state resolves as 'stall' rather than looping forever.
          }
        }
      }
    }
    commands += 1;

    // A fight's length is sampled the moment phase first leaves 'combat' (won or lost) —
    // run.combat still holds the final round count at that instant.
    if (prevPhase === 'combat' && run.phase !== 'combat' && run.combat) {
      roundsSum += run.combat.round;
      fights += 1;
    }
    prevPhase = run.phase;
  }

  const outcome: 'victory' | 'defeat' | 'stall' =
    run.phase === 'victory' ? 'victory' : run.phase === 'defeat' ? 'defeat' : 'stall';
  return {
    outcome, levelReached: run.map.level, deckSize: run.deck.length, commands, roundsSum, fights,
  };
}

export function simulateOne(seed: number, maxCommands = 2000): SimOneResult {
  const { outcome, levelReached, deckSize, commands } = runSimulation(seed, maxCommands);
  return { outcome, levelReached, deckSize, commands };
}

export function simulate(runs: number, baseSeed: number): SimStats {
  let wins = 0;
  let stalls = 0;
  let levelSum = 0;
  let deckSum = 0;
  let roundsSum = 0;
  let fights = 0;

  for (let i = 0; i < runs; i++) {
    const r = runSimulation(baseSeed + i, 2000);
    if (r.outcome === 'victory') wins += 1;
    if (r.outcome === 'stall') stalls += 1;
    levelSum += r.levelReached;
    deckSum += r.deckSize;
    roundsSum += r.roundsSum;
    fights += r.fights;
  }

  return {
    runs,
    wins,
    winRate: runs > 0 ? wins / runs : 0,
    avgLevelReached: runs > 0 ? levelSum / runs : 0,
    avgFinalDeckSize: runs > 0 ? deckSum / runs : 0,
    stalls,
    avgRoundsPerFight: fights > 0 ? roundsSum / fights : 0,
  };
}
