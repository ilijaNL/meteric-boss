import { Uuid } from '@/utils/schema';
import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Static, Type } from '@sinclair/typebox';
import { getPeriodEstimation } from '../estimator/api';
import createHttpError from 'http-errors';
import inProcessBus from '@/event-bus';
import db from '@/db';
import fastJson from 'fast-json-stable-stringify';
import { sql } from 'kysely';
import LRUCache from 'lru-cache';
import crypto from 'crypto';
import { integrationEvents } from '@/events';
import { registerTaskQueues } from './tasks';

const RateLimitCheckResponseSchema = Type.Object({
  exceeded: Type.Boolean(),
  quota: Type.Number(),
  current: Type.Number(),
  period: Type.Number(),
  period_start: Type.String(),
  period_end: Type.String(),
});

type RateLimitCheckResponse = Static<typeof RateLimitCheckResponseSchema>;

type PeriodEstimationResult = Readonly<{
  total_weight: number;
  total_operations: number;
  quota: number;
  startDate: string;
  endDate: string;
  period: number;
}>;

async function check(target_id: string): Promise<RateLimitCheckResponse> {
  const periodEstimation = await getPeriodEstimation(target_id);

  if (!periodEstimation) {
    throw new createHttpError.NotFound();
  }

  return {
    quota: periodEstimation.quota,
    current: periodEstimation.total_weight,
    period: periodEstimation.period,
    exceeded: periodEstimation.total_weight > periodEstimation.quota,
    period_end: periodEstimation.endDate,
    period_start: periodEstimation.startDate,
  };
}

/**
 * TODO: create more compact version
 * @param props
 * @returns
 */
function calculateQuotaEventKey(props: PeriodEstimationResult & { target_id: string; event_name: string }) {
  return crypto
    .createHash('md5')
    .update([props.event_name, props.target_id, props.quota, props.startDate, props.endDate].join('.'))
    .digest('hex');
}

const dispatchCache = new LRUCache({
  max: 200,
});

async function dispatchQuotaReachedEvent(target_id: string, context: PeriodEstimationResult) {
  const key = calculateQuotaEventKey({ ...context, target_id, event_name: 'q_r' });

  if (dispatchCache.has(key)) {
    return dispatchCache.get(key);
  }
  const event = integrationEvents.quota_reached({ target_id });

  const promise = db
    .insertInto('usage.event_stream')
    .values({
      event_name: event.event_name,
      event_data: fastJson(event.data),
      idempotence_key: key,
      ttl: context.endDate,
      created_at: sql`now()`,
    })
    .onConflict((c) => c.doNothing())
    .execute();

  dispatchCache.set(key, promise);

  return promise;
}

async function dispatchQuotaAlmostReachedEvent(target_id: string, context: PeriodEstimationResult) {
  const key = calculateQuotaEventKey({ ...context, target_id, event_name: 'q_a_r' });

  if (dispatchCache.has(key)) {
    return dispatchCache.get(key);
  }

  const event = integrationEvents.quota_almost_reached({ target_id });

  const promise = db
    .insertInto('usage.event_stream')
    .values({
      event_name: event.event_name,
      event_data: fastJson(event.data),
      idempotence_key: key,
      ttl: context.endDate,
      created_at: sql`now()`,
    })
    .onConflict((c) => c.doNothing())
    .execute();

  dispatchCache.set(key, promise);

  return promise;
}

export const limiterPlugin: FastifyPluginAsyncTypebox = async (fastify) => {
  await registerTaskQueues();

  fastify.get(
    '/check/:target',
    {
      schema: {
        params: Type.Object({
          target: Uuid,
        }),
        response: {
          '2xx': RateLimitCheckResponseSchema,
        },
      },
    },
    async (req, _): Promise<RateLimitCheckResponse> => {
      const { target } = req.params;
      const checkResult = await check(target);

      return checkResult;
    }
  );

  /**
   * Listen for ingesting events and check if we should dispatch a (unique) event
   */
  inProcessBus.on('op_ingested', (eventData) => {
    // debounce this
    async function check(target_id: string) {
      const periodEstimation = await getPeriodEstimation(target_id);

      if (!periodEstimation) {
        return;
      }

      if (periodEstimation.total_weight >= periodEstimation.quota) {
        await dispatchQuotaReachedEvent(target_id, periodEstimation);
        return;
      }

      if (periodEstimation.total_weight / periodEstimation.quota >= 0.85) {
        await dispatchQuotaAlmostReachedEvent(target_id, periodEstimation);
        return;
      }
    }

    check(eventData.target_id).catch((err) => {
      fastify.log.warn(err);
    });
  });
};
