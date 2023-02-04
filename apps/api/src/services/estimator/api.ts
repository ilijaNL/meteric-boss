import { pool } from '@/db';
import { Uuid } from '@/utils/schema';
import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Static, Type } from '@sinclair/typebox';
import createHttpError from 'http-errors';
import { getAllTargets, getCurrentPeriod, getTarget } from '../common/targets';
import LRU from 'lru-cache';
import { createStaleWhileRevalidateCache } from '@/utils/swr';

const PeriodSchema = Type.Object({
  startDate: Type.String({ format: 'date-time' }),
  endDate: Type.String({ format: 'date-time' }),
});

const get_all_targets_estimates = {
  name: 'get_all_targets_estimates',
  text: `
  SELECT 
    target_id,
    sum(weight) as total_weight, 
    sum(operation_count) as total_operations
  FROM usage.ops_weight_10_minutes
  WHERE bucket > $1 
    AND bucket <= $2
  GROUP BY target_id
  `,
};

const get_estimate_for_target = {
  name: 'get_estimate_for_target',
  text: `
  SELECT 
    target_id,
    sum(weight) as total_weight, 
    sum(operation_count) as total_operations
  FROM usage.ops_weight_10_minutes
  WHERE target_id = $3
    AND bucket > $1 
    AND bucket <= $2
  GROUP BY target_id
`,
};

type RowResult = { target_id: string; total_weight: number; total_operations: number };

export async function estimateTarget(period: Static<typeof PeriodSchema>, target_id: string) {
  const target = await getTarget(target_id);

  if (!target) {
    throw new createHttpError.NotFound('target not found');
  }

  const result = await pool
    .query<RowResult>({
      ...get_estimate_for_target,
      values: [period.startDate, period.endDate, target.id],
    })
    .then((d) => d.rows[0]);

  return result ?? null;
}

type PeriodEstimationResult = Readonly<{
  total_weight: number;
  total_operations: number;
  quota: number;
  startDate: string;
  endDate: string;
  period: number;
}>;

// use LRU cache
const periodEstimatorLRU = new LRU<string, PeriodEstimationResult | null>({
  max: 5_000,
});

const periodSWR = createStaleWhileRevalidateCache<PeriodEstimationResult | null>({
  minTimeToStale: 5_000,
  maxTimeToLive: 60_000,
  storage: {
    getItem(key) {
      return periodEstimatorLRU.get(key) ?? null;
    },
    del(key) {
      periodEstimatorLRU.delete(key);
    },
    setItem(key, value) {
      periodEstimatorLRU.set(key, value as PeriodEstimationResult);
    },
  },
});

async function _getPeriodEstimation(target_id: string): Promise<PeriodEstimationResult | null> {
  const target = await getTarget(target_id);
  if (!target) {
    throw new createHttpError.NotFound();
  }

  const quota = target.quota;

  if (!quota) {
    return null;
  }

  const window = await getCurrentPeriod(target_id);

  if (!window) {
    return null;
  }

  const { endDate, period, startDate } = window;

  // get retention period = period start + number of
  const estimation = await estimateTarget({ startDate, endDate }, target_id);

  const value = Object.freeze({
    quota,
    endDate,
    period,
    startDate,
    total_operations: estimation?.total_operations ?? 0,
    total_weight: estimation?.total_weight ?? 0,
  });

  return value;
}

export async function getPeriodEstimation(target_id: string) {
  return periodSWR(target_id, () => _getPeriodEstimation(target_id));
}

export async function estimateAll(props: Static<typeof PeriodSchema>) {
  const result = await pool
    .query<RowResult>({
      ...get_all_targets_estimates,
      values: [props.startDate, props.endDate],
    })
    .then((d) => d.rows);

  return Object.fromEntries(result.map((row) => [row.target_id, row]));
}

export const estimatorPlugin: FastifyPluginAsyncTypebox = async (fastify) => {
  // prefetch all targets before hand
  await getAllTargets();

  fastify.get(
    '/all',
    {
      schema: {
        querystring: PeriodSchema,
      },
    },
    async (req, _) => {
      return estimateAll(req.query);
    }
  );

  fastify.get(
    '/current-period/:target',
    {
      schema: {
        params: Type.Object({
          target: Uuid,
        }),
      },
    },
    async (req, _) => {
      return getPeriodEstimation(req.params.target);
    }
  );

  fastify.get(
    '/:target',
    {
      schema: {
        params: Type.Object({
          target: Uuid,
        }),
        querystring: PeriodSchema,
      },
    },
    async (req, _) => {
      return estimateTarget(req.query, req.params.target);
    }
  );
};
