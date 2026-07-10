import { newRun, runCommand } from '../core/run';
import type { RunCommand, RunState } from '../core/run';

/**
 * The single UI-facing wrapper around the core state machine. All state lives in
 * `run` (plain data owned by src/core); the store never mutates it directly —
 * every change flows through `runCommand`. Illegal commands (thrown as
 * `Error('illegal: ...')`) are caught here and surfaced as a `status` message
 * instead of propagating, so a screen can dispatch freely and let the store
 * report back why something didn't happen. `onRender` lets `render.ts` register
 * a full-repaint callback that fires after every dispatch (successful or not).
 */
export interface Store {
  readonly run: RunState;
  readonly status: string | undefined;
  dispatch(cmd: RunCommand): void;
  onRender(cb: () => void): void;
}

export function createStore(seed: number): Store {
  const run = newRun(seed);
  let status: string | undefined;
  let renderCb: (() => void) | undefined;

  return {
    get run(): RunState {
      return run;
    },
    get status(): string | undefined {
      return status;
    },
    dispatch(cmd: RunCommand): void {
      try {
        runCommand(run, cmd);
        status = undefined;
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('illegal:')) {
          status = err.message;
        } else {
          throw err;
        }
      }
      renderCb?.();
    },
    onRender(cb: () => void): void {
      renderCb = cb;
    },
  };
}
