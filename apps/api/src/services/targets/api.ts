import db, { execute, QueryCommand } from '@/db';
import { toPlugin } from '@/plugins/fastify-typed-doc';
import { metericClient } from '@/utils/client';
import { UsageQuotas } from '@/__generated__/db';
import { PeriodType, targetContract } from '@meteric-boss/api';
import { FastifyPluginAsync, FastifyPluginCallback } from 'fastify';
import createHttpError from 'http-errors';
import { Selectable, sql } from 'kysely';
import { v4 } from 'uuid';
import fp from 'fastify-plugin';

const _targetPlugin = toPlugin(targetContract)<{}>({
  get: {
    resolve: async ({ input: { target_id } }) => {
      const target = await db
        .selectFrom('usage.targets as targets')
        .leftJoin('usage.quotas as q', 'q.target_id', 'targets.id')
        .select([
          'targets.id',
          'targets.label',
          'targets.created_at',
          'targets.meta_data',
          sql<Selectable<UsageQuotas> | null>`row_to_json(q.*)`.as('quota'),
        ])
        .where('targets.id', '=', target_id)
        // .call((e) => {
        //   console.log(e.compile().sql);
        //   return e;
        // })
        .executeTakeFirst();

      if (!target) {
        throw new createHttpError.NotFound();
      }

      return {
        id: target.id,
        created_at: target.created_at.toISOString(),
        label: target.label,
        meta_data: target.meta_data ?? {},
        quota: target.quota
          ? {
              amount_of_periods: target.quota.amount_of_periods,
              created_at: target.quota.created_at.toString(),
              period_type: target.quota.period_type as PeriodType,
              quota: target.quota.quota,
              start_date: target.quota.start_date.toString(),
            }
          : null,
      };
    },
  },
  create: {
    resolve: async ({ input }) => {
      const queries: QueryCommand[] = [];
      const target_id = v4();

      queries.push(
        db
          .insertInto('usage.targets')
          .values({ label: input.label, meta_data: JSON.stringify(input.meta_data), id: target_id })
          .compile()
      );

      if (input.quota) {
        queries.push(
          db
            .insertInto('usage.quotas')
            .values({
              period_type: input.quota.period_type,
              target_id: target_id,
              amount_of_periods: input.quota.amount_of_periods,
              quota: input.quota.quota,
              start_date: input.quota.start_date,
            })
            .compile()
        );
      }

      await execute(queries);

      return {
        id: target_id,
        version: 1,
      };
    },
  },
  update: {
    resolve: async ({ input }) => {
      await db
        .updateTable('usage.targets')
        .set({
          label: input.label,
          meta_data: JSON.stringify(input.meta_data),
        })
        .where('id', '=', input.target_id)
        .execute();

      return {
        success: true,
      };
    },
  },
  'update-quota': {
    resolve: async ({ input }) => {
      await db
        .updateTable('usage.quotas')
        .set({
          amount_of_periods: input.quota.amount_of_periods,
          period_type: input.quota.period_type,
          start_date: input.quota.start_date,
          quota: input.quota.quota,
        })
        .where('target_id', '=', input.target_id)
        .execute();

      return {
        success: true,
      };
    },
  },
  delete: {
    resolve: async ({ input: { target_id } }) => {
      await db.deleteFrom('usage.targets').where('id', '=', target_id).execute();

      return {
        success: true,
      };
    },
  },
});

const _metericPlugin: FastifyPluginCallback<{ target_id: string }> = async (fastify, opts, done) => {
  fastify.decorateRequest('__metericboss', null);

  fastify.addHook('onRequest', async function onRequest(request) {
    (request as any).__metericboss = {
      startTime: Date.now(),
    };
  });

  fastify.addHook('onSend', async (request, reply) => {
    const meteric = (request as any).__metericboss;

    await metericClient.i.mutate.ingest({
      op: request.routerPath,
      d: Date.now() - meteric.startTime,
      s: reply.statusCode,
      w: 3,
      m_d: {},
      t_id: opts.target_id,
    });
  });

  done();
};

const metericPlugin = fp(_metericPlugin);

export const targetPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(metericPlugin, {
    target_id: 'd040b0ce-c58d-4f31-9924-0adacbc0fc66',
  });

  fastify.register(_targetPlugin, {
    contextFactory: () => ({}),
  });
};
