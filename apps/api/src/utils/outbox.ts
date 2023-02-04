import db, { QueryCommand, execute, pool, query, tryToAcquireLock, withTransaction } from '@/db';
import { UsageEventStream } from '@/__generated__/db';
import { Selectable, sql } from 'kysely';
import { Pool, PoolClient } from 'pg';
import { hashStringToInt } from './char';
import { createBaseWorker } from './worker';

const outboxHashKey = hashStringToInt('__outbox__');

/**
 * Creates a worker which creates new tasks from the event_stream events in an outbox fashion
 *
 * it is important to keep process fn fast
 * @returns
 */
export const createOutboxProcess = (
  collect: (events: Selectable<UsageEventStream>[], poolClient: PoolClient) => Promise<QueryCommand[]>
) => {
  async function run() {
    await withTransaction(pool, async (client) => {
      const hasLock = await tryToAcquireLock(outboxHashKey, client);

      if (!hasLock) {
        return;
      }

      const qBuilder = db
        .updateTable('usage.event_stream')
        .set({
          processed: sql`true`,
        })
        .where('created_at', '<=', sql`now()`)
        .whereRef('processed', '=', sql`false`)
        .returningAll();

      const events = await query(client, qBuilder);

      if (events.length === 0) {
        return;
      }

      const queries = await collect(events, client);

      await execute(queries, client);
    });
  }

  return createBaseWorker(
    async () => {
      await run();
      return false;
    },
    { loopInterval: 2_000 }
  );
};
