import { pgboss } from '@/event-bus';
import { IntegrationEvents } from '@/events';
import { createEventsFactory, EventMapper, InferEvents, toMap } from '@/utils/ddd';
import { Uuid } from '@/utils/schema';
import { callEndpoint } from '@/utils/webhook';
import { UsageEventStream } from '@/__generated__/db';
import { Type } from '@sinclair/typebox';
import { Selectable } from 'kysely';
import { PoolClient } from 'pg';
import PgBoss from 'pg-boss';
import fastJson from 'fast-json-stable-stringify';

// abuse events, since it has same data structure
export const tasksFactory = createEventsFactory({
  'limiter.quota_almost_reached_webhook': Type.Object({
    target_id: Uuid,
  }),
  'limiter.quota_reached_webhook': Type.Object({
    target_id: Uuid,
  }),
});

export type Tasks = InferEvents<typeof tasksFactory>;

const eventTaskMapper: EventMapper<IntegrationEvents, PgBoss.JobInsert[]> = {
  quota_almost_reached: (event) => {
    const task = tasksFactory['limiter.quota_almost_reached_webhook'](event.data);

    return [
      {
        name: task.event_name,
        data: task,
        expireInSeconds: 30,
        retryBackoff: true,
        retryDelay: 5,
        retryLimit: 5,
      },
    ];
  },
  quota_reached: (event) => {
    const task = tasksFactory['limiter.quota_reached_webhook'](event.data);

    return [
      {
        name: task.event_name,
        data: task,
        expireInSeconds: 30,
        retryBackoff: true,
        retryDelay: 5,
        retryLimit: 5,
      },
    ];
  },
};

const mapping = toMap(eventTaskMapper);

export async function createLimiterTasks(events: Selectable<UsageEventStream>[], client: PoolClient) {
  const jobs = mapping(
    events.map((e) => ({ data: e.event_data, event_name: e.event_name } as IntegrationEvents)),
    undefined
  ).flat();

  await pgboss.insert(jobs, {
    db: {
      executeSql(text, values) {
        return client.query(text, values);
      },
    },
  });
}

const taskExecutionMapper: EventMapper<Tasks, Promise<void>> = {
  'limiter.quota_almost_reached_webhook': async (task) => {
    await callEndpoint({
      body: fastJson(task),
      callbackUrl: 'http://localhost:3001/test-webhook',
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });
  },
  'limiter.quota_reached_webhook': async (task) => {
    await callEndpoint({
      body: fastJson(task),
      callbackUrl: 'http://localhost:3001/test-webhook',
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });
  },
};

export async function registerTaskQueues() {
  // listen for all events from the limiter queue and map in memory
  await pgboss.work<Tasks, any>(
    'limiter.*',
    {
      newJobCheckInterval: 1500,
      teamRefill: true,
      teamSize: 50,
      teamConcurrency: 20,
    },
    async (task) => {
      const mapping = toMap(taskExecutionMapper);
      await Promise.all(mapping([task.data], undefined));
    }
  );
}
