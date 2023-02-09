import db, { pool, query, tryToAcquireLock, withTransaction } from '@/db';
import { UsageEventStream } from '@/__generated__/db';
import { Selectable, sql } from 'kysely';
import { PoolClient } from 'pg';
import { hashStringToInt } from './char';
import { createBaseWorker } from './worker';

const outboxHashKey = hashStringToInt('__outbox__');

/**
 * Creates a worker which pools non processed events. The processed events are not in order
 *
 * The execute fn is executed in transaction
 * @returns
 */
export const createOutboxProcess = (
  execute: (events: Selectable<UsageEventStream>[], poolClient: PoolClient) => Promise<void>
) => {
  async function run() {
    await withTransaction(pool, async (client) => {
      const hasLock = await tryToAcquireLock(outboxHashKey, client);

      if (!hasLock) {
        return;
      }

      // this can become really large if many incoming events
      // alternative is to do a select skip locked with limit
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

      await execute(events, client);
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
