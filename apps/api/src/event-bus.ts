import Nanobus from 'nanobus';
import PgBoss from 'pg-boss';
import { InProcessEvents } from './events';

const inProcessBus = new Nanobus<InProcessEvents>();

export const pgboss = new PgBoss({
  connectionString: process.env.PG_CONNECTION!,
  application_name: process.env.APP_NAME,
  noScheduling: true,
  onComplete: false,
  max: 5,
  schema: 'usage',
});

export default inProcessBus;
