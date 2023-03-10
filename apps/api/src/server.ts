import fastify from 'fastify';
import closeWithGrace from 'close-with-grace';
import './env';
import app, { options } from './app';

const DEFAULT_PORT = 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// Instantiate Fastify with some config
const server = fastify({
  logger: {
    level: IS_PROD ? 'error' : 'info',
  },
  ...options,
});

server.register(app);

// delay is the number of milliseconds for the graceful close to finish
const closeListeners = closeWithGrace({ delay: 1000 }, async ({ err }: any) => {
  if (err) {
    server.log.error(err);
  }

  await server.close();
});

server.addHook('onClose', (_, done) => {
  closeListeners.uninstall();
  done();
});

// Start listening.
// use 0.0.0.0 for docker
server.listen(
  {
    // host: '0.0.0.0',
    port: DEFAULT_PORT,
  },
  (err) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }
  }
);
