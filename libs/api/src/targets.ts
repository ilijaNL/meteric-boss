import { Result, Success } from './common';
import { Static, Type } from '@sinclair/typebox';
import { createContract } from '@typed-doc/core';
import { Nullable, Uuid } from './schema';

export const PeriodTypeSchema = Type.Union([Type.Literal('month'), Type.Literal('day'), Type.Literal('week')]);
export type PeriodType = Static<typeof PeriodTypeSchema>;

export const TargetQuotaSchema = Type.Object({
  quota: Type.Number({ minimum: 0 }),
  period_type: PeriodTypeSchema,
  amount_of_periods: Type.Integer({ minimum: 1 }),
  start_date: Type.Optional(Type.String({ format: 'date-time' })),
});

export const targetContract = createContract({
  get: {
    type: 'query',
    input: Type.Object({
      target_id: Uuid,
    }),
    output: Type.Object({
      id: Uuid,
      label: Type.String({ minLength: 3 }),
      meta_data: Type.Any(),
      created_at: Type.String({ format: 'date-time' }),
      quota: Nullable(
        Type.Intersect([
          TargetQuotaSchema,
          Type.Object({
            created_at: Type.String({ format: 'date-time' }),
          }),
        ])
      ),
    }),
  },
  create: {
    type: 'mutation',
    input: Type.Object({
      label: Type.String({ minLength: 3 }),
      meta_data: Type.Record(Type.String(), Type.Any()),
      quota: Type.Optional(TargetQuotaSchema),
    }),
    output: Result,
  },
  update: {
    type: 'mutation',
    input: Type.Object({
      target_id: Uuid,
      label: Type.String({ minLength: 3 }),
      meta_data: Type.Record(Type.String(), Type.Any()),
    }),
    output: Success,
  },
  'update-quota': {
    type: 'mutation',
    input: Type.Object({
      target_id: Uuid,
      quota: TargetQuotaSchema,
    }),
    output: Success,
  },
  delete: {
    type: 'mutation',
    input: Type.Object({
      target_id: Uuid,
    }),
    output: Success,
  },
});
