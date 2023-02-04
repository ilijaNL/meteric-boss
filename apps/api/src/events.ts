import { Type } from '@sinclair/typebox';
import { createEventsFactory, InferEvents } from './utils/ddd';
import { Uuid } from './utils/schema';

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
