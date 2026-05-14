/**
 * `corastate sync <connector>`
 *
 * Runs one sync against the named connector. The real flow:
 *   1. Resolve the connector from its id.
 *   2. Insert a sync_runs row in status=running.
 *   3. Iterate connector.sync(ctx), pipe through correlate(), write batched.
 *   4. Update sync_runs to status=succeeded with observationCount + finishedAt.
 *   5. REFRESH MATERIALIZED VIEW CONCURRENTLY current_state.
 *
 * Today it just prints a placeholder and exits.
 */

import type { Command } from 'commander';

export function registerSync(program: Command): void {
  program
    .command('sync')
    .description('Run a single sync against the named connector')
    .argument('<connector>', "Connector id, e.g. 'okta'")
    .option('--full', 'Force a full sweep instead of an incremental sync')
    .action(async (connectorId: string, opts: { full?: boolean }) => {
      console.log(`corastate sync: connector=${connectorId} full=${Boolean(opts.full)}`);
      // TODO:
      //  - look up the connector by id
      //  - insert a sync_runs row
      //  - run connector.sync(...) through correlate() and writeObservations()
      //  - refresh the current_state materialized view
      console.log('not implemented yet');
      process.exitCode = 2;
    });
}
