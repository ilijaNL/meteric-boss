import { Type } from '@sinclair/typebox';
import db from './db';
import { createEventsFactory, InferEvents } from './utils/ddd';
import { Uuid } from './utils/schema';
import fastJson from 'fast-json-stable-stringify';
import { sql } from 'kysely';

export type InProcessEvents = {
  /**
   * Emitted on operation ingested
   * @param data
   * @returns
   */
  op_ingested: (data: { target_id: string }) => void;
};

export const integrationEvents = createEventsFactory({
  quota_reached: Type.Object({
    target_id: Uuid,
  }),
  quota_almost_reached: Type.Object({
    target_id: Uuid,
  }),
});

export type IntegrationEvents = InferEvents<typeof integrationEvents>;

type ArrayOrSingle<T> = T | Array<T>;

/**
 * Create sql builder from integration events
 *
 * TTL is default 60 days from creation
 * @param intEventOrEvents
 * @returns
 */
export function toEventsBuilder(
  intEventOrEvents: ArrayOrSingle<IntegrationEvents & { idempotence_key?: string; ttl?: string }>
) {
  const events = Array.isArray(intEventOrEvents) ? intEventOrEvents : [intEventOrEvents];

  return db
    .insertInto('usage.event_stream')
    .values(
      events.map((event) => ({
        event_name: event.event_name,
        event_data: fastJson(event.data),
        ttl: event.ttl ?? sql<string>`now() + interval '60 d'`,
        idempotence_key: event.idempotence_key,
        created_at: sql<string>`now()`,
      }))
    )
    .onConflict((c) => c.doNothing());
}
