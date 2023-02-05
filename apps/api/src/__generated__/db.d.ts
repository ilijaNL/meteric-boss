import type { ColumnType } from "kysely";
import type { IPostgresInterval } from "postgres-interval";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export type Interval = ColumnType<IPostgresInterval, IPostgresInterval | number, IPostgresInterval | number>;

export type JobState = "active" | "cancelled" | "completed" | "created" | "expired" | "failed" | "retry";

export type Json = ColumnType<JsonValue, string, string>;

export type JsonArray = JsonValue[];

export type JsonObject = {
  [K in string]?: JsonValue;
};

export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface UsageArchive {
  archivedon: Generated<Timestamp>;
  completedon: Timestamp | null;
  createdon: Timestamp;
  data: Json | null;
  expirein: Interval;
  id: string;
  keepuntil: Timestamp;
  name: string;
  on_complete: boolean;
  output: Json | null;
  priority: number;
  retrybackoff: boolean;
  retrycount: number;
  retrydelay: number;
  retrylimit: number;
  singletonkey: string | null;
  singletonon: Timestamp | null;
  startafter: Timestamp;
  startedon: Timestamp | null;
  state: JobState;
}

export interface UsageEventStream {
  created_at: Timestamp;
  event_data: Json;
  event_name: string;
  id: Generated<string>;
  idempotence_key: string | null;
  processed: Generated<boolean>;
  ttl: Timestamp;
}

export interface UsageJob {
  completedon: Timestamp | null;
  createdon: Generated<Timestamp>;
  data: Json | null;
  expirein: Generated<Interval>;
  id: Generated<string>;
  keepuntil: Generated<Timestamp>;
  name: string;
  on_complete: Generated<boolean>;
  output: Json | null;
  priority: Generated<number>;
  retrybackoff: Generated<boolean>;
  retrycount: Generated<number>;
  retrydelay: Generated<number>;
  retrylimit: Generated<number>;
  singletonkey: string | null;
  singletonon: Timestamp | null;
  startafter: Generated<Timestamp>;
  startedon: Timestamp | null;
  state: Generated<JobState>;
}

export interface UsageOperations {
  duration: Generated<number>;
  meta_data: Json;
  operation: string;
  status_code: Generated<number>;
  target_id: string;
  ts: Timestamp;
  weight: Generated<number>;
}

export interface UsageQuotas {
  amount_of_periods: Generated<number>;
  created_at: Generated<Timestamp>;
  period_type: string;
  quota: Generated<number>;
  start_date: Generated<Timestamp>;
  target_id: string;
}

export interface UsageSchedule {
  created_on: Generated<Timestamp>;
  cron: string;
  data: Json | null;
  name: string;
  options: Json | null;
  timezone: string | null;
  updated_on: Generated<Timestamp>;
}

export interface UsageSubscription {
  created_on: Generated<Timestamp>;
  event: string;
  name: string;
  updated_on: Generated<Timestamp>;
}

export interface UsageTargets {
  created_at: Generated<Timestamp>;
  id: Generated<string>;
  label: string;
  meta_data: Json;
}

export interface UsageVersion {
  cron_on: Timestamp | null;
  maintained_on: Timestamp | null;
  version: number;
}

export interface DB {
  "usage.archive": UsageArchive;
  "usage.event_stream": UsageEventStream;
  "usage.job": UsageJob;
  "usage.operations": UsageOperations;
  "usage.quotas": UsageQuotas;
  "usage.schedule": UsageSchedule;
  "usage.subscription": UsageSubscription;
  "usage.targets": UsageTargets;
  "usage.version": UsageVersion;
}
