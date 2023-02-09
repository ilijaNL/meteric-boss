import { Type } from '@sinclair/typebox';
import { createContract } from '@typed-doc/core';
import { Uuid } from './schema';

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

export const ingestContract = createContract({
  ingest: {
    input: OperationReportSchema,
    methodType: 'mutation',
    output: Type.Object({
      s: Type.Boolean(),
    }),
  },
});
