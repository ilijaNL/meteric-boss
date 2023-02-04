import db from '@/db';
import { createStaleWhileRevalidateCache, createSWRFunction } from '@/utils/swr';
import { addDays, differenceInDays, addWeeks, differenceInWeeks, addMonths, differenceInMonths } from 'date-fns';
import createHttpError from 'http-errors';
import { match } from 'ts-pattern';

export const getAllTargets = createSWRFunction(createStaleWhileRevalidateCache({ minTimeToStale: 15_000 }), {
  fn: async () => {
    const targets = await db
      .selectFrom('usage.targets as targets')
      .leftJoin('usage.quotas as q', 'q.target_id', 'targets.id')
      .select(['targets.id', 'targets.meta_data', 'q.quota', 'q.period_type', 'q.start_date', 'q.amount_of_periods'])
      .execute();
    return Object.fromEntries(targets.map((target) => [target.id, target]));
  },
  refreshIntervalMs: 60_000,
  storeKey: 'targets',
});

export async function getTarget(target_id: string) {
  const targets = await getAllTargets();
  return targets[target_id];
}

const createPeriodWindow =
  (fn: { add: (date: Date | number, amount: number) => Date; difference: (left: Date, right: Date) => number }) =>
  (props: { initialStartDate: string; amount: number }) => {
    const now = new Date();
    const startDate = new Date(props.initialStartDate);

    const totalDifference = fn.difference(startDate, now);
    const periodsPassed = Math.floor(totalDifference / props.amount);

    // calculate window
    const periodStart = fn.add(startDate, periodsPassed);
    const periodEnd = fn.add(periodStart, props.amount);

    return {
      period: periodsPassed,
      startDate: periodStart.toISOString(),
      endDate: periodEnd.toISOString(),
    };
  };

const dayWindow = createPeriodWindow({ add: addDays, difference: differenceInDays });
const weekWindow = createPeriodWindow({ add: addWeeks, difference: differenceInWeeks });
const monthWindow = createPeriodWindow({ add: addMonths, difference: differenceInMonths });

export async function getCurrentPeriod(target_id: string) {
  const target = await getTarget(target_id);
  if (!target) {
    throw new createHttpError.NotFound();
  }

  if (
    target.quota === null ||
    target.period_type === null ||
    target.start_date === null ||
    target.amount_of_periods === null
  ) {
    return null;
  }

  const windowFn = match(target.period_type)
    .with('day', () => dayWindow)
    .with('week', () => weekWindow)
    .with('month', () => monthWindow)
    .otherwise(() => dayWindow);

  return windowFn({ amount: target.amount_of_periods, initialStartDate: target.start_date.toString() });
}
