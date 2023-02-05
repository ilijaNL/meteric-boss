require('dotenv-safe').config({
  allowEmptyValues: true,
});

import { FastifyPluginAsync, FastifyServerOptions, RouteOptions } from 'fastify';
import { migrate } from 'postgres-migrations';
import fp from 'fastify-plugin';
import fastifyHelmet from '@fastify/helmet';
import _ from 'lodash';
import sensible from '@fastify/sensible';
import db, { pool } from './db';
import { ingestPlugin } from './services/ingest/api';
import { estimatorPlugin } from './services/estimator/api';
import { limiterPlugin } from './services/limiter/api';
import { createOutboxProcess } from './utils/outbox';
import { pgboss } from './event-bus';
import { createLimiterTasks } from './services/limiter/tasks';
import { targetPlugin } from './services/targets/api';

const ENVIRONMENT = process.env.NODE_ENV ?? 'development';
const IS_PROD = ENVIRONMENT === 'production';

const app: FastifyPluginAsync = async (fastify) => {
  // run migrations
  if (process.env.SKIP_MIGRATIONS !== '1') {
    await migrate({ client: pool }, './migrations', { logger: fastify.log.warn.bind(fastify.log) });
  }

  if (IS_PROD) {
    await fastify.register(fastifyHelmet);
  }

  if (!IS_PROD) {
    await fastify.register(
      fp(async function (instance) {
        instance.addHook('onRoute', (route: RouteOptions) => {
          instance.log.info(`${route.url}`);
        });
      })
    );
  }

  await fastify.register(sensible);

  fastify.register(ingestPlugin, { prefix: '/ingest' });
  fastify.register(estimatorPlugin, { prefix: '/estimator' });
  fastify.register(limiterPlugin, { prefix: '/limiter' });

  fastify.register(targetPlugin, {
    prefix: '/targets',
    contextFactory(req, reply) {
      return {};
    },
  });

  fastify.get('/_health', (_, reply) => {
    return reply.status(200).send('ok');
  });

  fastify.post('/test-webhook', (req, reply) => {
    fastify.log.info(JSON.stringify(req.headers));
    fastify.log.info(JSON.stringify(req.body));
    return reply.status(200).send('ok');
  });

  const outboxWorker = createOutboxProcess(async (events, client) => {
    await createLimiterTasks(events, client);
    return [];
  });

  await pgboss.start();

  outboxWorker.start();

  // clean up
  fastify.addHook('onClose', async () => {
    await Promise.all([pgboss.stop(), outboxWorker.stop()]);
    await db.destroy();
    fastify.log.info('terminating');
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
};

// this will be used by fastify cli
export const options: FastifyServerOptions = {
  trustProxy: true,
};

export default app;
