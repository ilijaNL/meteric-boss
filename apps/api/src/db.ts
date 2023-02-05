import {
  DeleteQueryBuilder,
  InsertQueryBuilder,
  Kysely,
  PostgresDialect,
  SelectQueryBuilder,
  UpdateQueryBuilder,
} from 'kysely';
import { ClientBase, Pool, PoolClient, QueryResultRow } from 'pg';
import { DB } from './__generated__/db';
import pgp from 'pg-promise';

export const pool = new Pool({
  connectionString: process.env.PG_CONNECTION!,
  application_name: (process.env.APP_NAME ?? '') + '_pool',
  max: 30,
  min: 10,
});

const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: pool,
  }),
});

export interface QueryCommand {
  readonly sql: string;
  readonly parameters: ReadonlyArray<unknown>;
}

const pgpInstance = pgp({});

export async function execute(queries: (QueryCommand | QueryCommand[])[], client?: ClientBase) {
  const sql = pgpInstance.helpers.concat(queries.flat().map((q) => ({ query: q.sql, values: q.parameters })));
  await (client ?? pool).query(sql);
}

export interface TypedCompiledQuery<Result> extends QueryCommand {
  __result?: Result;
}

export type BuilderQuery<O> =
  | SelectQueryBuilder<any, any, O>
  | DeleteQueryBuilder<any, any, O>
  | UpdateQueryBuilder<any, any, any, O>
  | InsertQueryBuilder<any, any, O>;

export async function query<TResult extends QueryResultRow>(client: ClientBase, builder: BuilderQuery<TResult>) {
  const query = builder.compile();
  return client.query<TResult>(query.sql, query.parameters as any[]).then((d) => d.rows);
}

export async function tryToAcquireLock(id: number, db: PoolClient) {
  return await db
    .query<{ has_lock: boolean }>({
      text: `select pg_try_advisory_lock($1) as has_lock`,
      values: [id],
    })
    .then((d) => d.rows[0]?.has_lock ?? false);
}

export async function withTransaction(pool: Pool, handler: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await handler(client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export default db;
