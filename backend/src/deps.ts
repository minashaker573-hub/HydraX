/**
 * HYDRAX - application dependencies.
 *
 * Passed explicitly to every route module. `now` is injected rather than
 * called directly so tests can drive offline detection and retention without
 * waiting in real time.
 */

import type { Config } from './config.ts';
import type { Repository } from './db/repository.ts';

export interface AppDeps {
  readonly repo: Repository;
  readonly config: Config;
  /** Current time in epoch milliseconds. */
  readonly now: () => number;
}

export function nowIso(deps: AppDeps): string {
  return new Date(deps.now()).toISOString();
}
