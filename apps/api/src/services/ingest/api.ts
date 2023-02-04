import db from '@/db';
import inProcessBus from '@/event-bus';
import createBatcher from '@/utils/batcher';
import { Uuid } from '@/utils/schema';
import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Static, Type } from '@sinclair/typebox';
import fastJson from 'fast-json-stable-stringify';
import createHttpError from 'http-errors';
import { sql } from 'kysely';
import { getAllTargets, getTarget } from '../common/targets';

const OperationReportSchema = Type.Object({
  // target id
  t_id: Uuid,
  // operation
  op: Type.String({ minLength: 2 }),
  // metadata
  m_d: Type.Record(Type.String(), Type.Any()),
  // duration
  d: Type.Optional(Type.Number({ minimum: 0 })),
  // weigth
  w: Type.Optional(Type.Number()),
  // status code
  s: Type.Optional(Type.Integer()),
});

const ingestBatcher = createBatcher<Static<typeof OperationReportSchema>>(
  async (data) => {
    await db
      .insertInto('usage.operations')
      .values(
        data.map((d) => ({
          meta_data: fastJson(d.m_d),
          operation: d.op,
          target_id: d.t_id,
          ts: sql`now() - (interval '1 milliseconds' * ${d.delta_ms})`,
          status_code: d.s ?? 200,
          weight: d.w,
          duration: d.d,
        }))
      )
      .execute();
  },
  { maxSize: 250, maxTimeInMs: 75 }
);

export const ingestPlugin: FastifyPluginAsyncTypebox = async (fastify) => {
  // prefetch all targets beforehand
  await getAllTargets();

  fastify.post(
    '/',
    {
      schema: {
        body: OperationReportSchema,
      },
    },
    async (req, reply) => {
      const operationReport = req.body;
      // check if target exists
      const target = await getTarget(operationReport.t_id);

      if (!target) {
        throw new createHttpError.NotFound('target not found');
      }

      await ingestBatcher.add(operationReport);

      inProcessBus.emit('op_ingested', { target_id: target.id });

      reply.send('ok');
    }
  );

  fastify.addHook('onClose', () => ingestBatcher.flush());
};
