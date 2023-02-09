CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS timescaledb_toolkit;

create schema "usage";

CREATE TABLE "usage"."targets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "label" text NOT NULL,
  "meta_data" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  PRIMARY KEY ("id") 
);

CREATE TABLE "usage"."quotas" (
  "target_id" uuid NOT NULL,
  "quota" integer NOT NULL DEFAULT 99999999,
  -- daily, weekly, monthly, yearly
  "period_type" text NOT NULL,
  -- how many periods is the retention period
  "amount_of_periods" integer NOT NULL default 1,
  -- initial start date of the period
  "start_date" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("target_id"),
  FOREIGN KEY ("target_id") REFERENCES "usage"."targets"("id") ON UPDATE cascade ON DELETE cascade
);


CREATE TABLE "usage"."operations" (
  "ts" timestamptz NOT NULL, 
  "operation" text NOT NULL,
  "meta_data" jsonb NOT NULL,
  "status_code" int2 NOT NULL DEFAULT 200,
  "duration" integer NOT NULL DEFAULT 0,
  "weight" integer NOT NULL DEFAULT 0,
  "target_id" uuid NOT NULL
);

SELECT create_hypertable('usage.operations','ts');

create index idx_usage_ops_target_id on "usage"."operations" (target_id, ts);

create materialized view usage.ops_weight_10_minutes
  with (timescaledb.continuous) as
    SELECT target_id,
      time_bucket(INTERVAL '10 min', ts) AS bucket,
      count(operation) as operation_count,
      sum(weight) as weight
    FROM usage.operations
    GROUP BY target_id, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('usage.ops_weight_10_minutes',
  start_offset => INTERVAL '12 hours',
  end_offset => INTERVAL '1 min',
  schedule_interval => INTERVAL '10 min'
);

CREATE TABLE "usage"."event_stream" (
  "id" uuid NOT null default gen_random_uuid(), 
  "event_name" text NOT NULL, 
  "event_data" jsonb NOT null,
  "processed" boolean NOT null default false,
  "idempotence_key" text unique,
  "ttl" timestamptz not null,
  "created_at" timestamptz NOT null,
  PRIMARY KEY ("id")
);