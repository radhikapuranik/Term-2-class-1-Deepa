-- Idempotent: safe to run many times.
CREATE TABLE IF NOT EXISTS distributors (
  distributor_id text PRIMARY KEY, distributor_name text NOT NULL, region text NOT NULL, status text NOT NULL
);
CREATE TABLE IF NOT EXISTS skus (
  sku_id text PRIMARY KEY, sku_name text NOT NULL, category text NOT NULL,
  perishability text NOT NULL CHECK (perishability IN ('Low','High')),
  standard_reorder_qty integer NOT NULL CHECK (standard_reorder_qty > 0),
  unit_of_measure text NOT NULL, distributor_id text NOT NULL,
  unit_cost numeric CHECK (unit_cost IS NULL OR unit_cost >= 0)
);
CREATE TABLE IF NOT EXISTS weekly_sales (
  sku_id text NOT NULL, week text NOT NULL, units_sold integer NOT NULL CHECK (units_sold >= 0),
  PRIMARY KEY (sku_id, week)
);
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  sku_id text NOT NULL, location text NOT NULL, units_on_hand integer NOT NULL CHECK (units_on_hand >= 0),
  as_of_date date NOT NULL, PRIMARY KEY (sku_id, location, as_of_date)
);
CREATE TABLE IF NOT EXISTS calendar (
  year_month text PRIMARY KEY, year integer NOT NULL, month integer NOT NULL, is_festival_month boolean NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings_history (
  id bigserial PRIMARY KEY, key text NOT NULL, old_value jsonb, new_value jsonb NOT NULL,
  reason text NOT NULL, changed_by text NOT NULL, changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS import_batches (
  id bigserial PRIMARY KEY, source text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  counts jsonb NOT NULL, errors jsonb NOT NULL DEFAULT '[]', warnings jsonb NOT NULL DEFAULT '[]', status text NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id bigserial PRIMARY KEY, trigger_type text NOT NULL, status text NOT NULL, stage text NOT NULL,
  as_of date, uplift_applied boolean, warnings jsonb NOT NULL DEFAULT '[]', summary jsonb,
  error text, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE TABLE IF NOT EXISTS recommendations (
  id bigserial PRIMARY KEY, run_id bigint NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  sku_id text NOT NULL, status text NOT NULL, action text NOT NULL, qty integer, cover_after numeric,
  high_demand boolean NOT NULL DEFAULT false, urgent boolean NOT NULL DEFAULT false,
  metrics jsonb NOT NULL, flags jsonb NOT NULL, rule_trace jsonb NOT NULL,
  ai_explanation jsonb, ai_status text NOT NULL DEFAULT 'none',
  decision_status text NOT NULL DEFAULT 'Recommended'
    CHECK (decision_status IN ('Recommended','Approved','Edited','Overridden','Deferred')),
  final_qty integer, UNIQUE (run_id, sku_id)
);
CREATE INDEX IF NOT EXISTS recommendations_sku_idx ON recommendations (sku_id, run_id DESC);
CREATE TABLE IF NOT EXISTS decisions (
  id bigserial PRIMARY KEY, recommendation_id bigint NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  sku_id text NOT NULL, decision text NOT NULL, final_qty integer, reason_code text, reason_text text,
  decided_by text NOT NULL, decided_at timestamptz NOT NULL DEFAULT now(), undone boolean NOT NULL DEFAULT false,
  prev_status text, prev_qty integer
);
CREATE TABLE IF NOT EXISTS exceptions (
  id bigserial PRIMARY KEY, recommendation_id bigint NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  sku_id text NOT NULL, code text NOT NULL, message text NOT NULL, resolved boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS comments (
  id bigserial PRIMARY KEY, sku_id text NOT NULL, body text NOT NULL, author text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_cache (
  input_hash text PRIMARY KEY, output jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS prev_status text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS prev_qty integer;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS email_status text;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS email_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS ai_counts jsonb;
CREATE TABLE IF NOT EXISTS app_state (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS kill_log (id bigserial PRIMARY KEY, action text NOT NULL, reason text, by_name text NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rate_hits (key text NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS rate_hits_idx ON rate_hits (key, at DESC);
CREATE TABLE IF NOT EXISTS alerts (id bigserial PRIMARY KEY, kind text NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read boolean NOT NULL DEFAULT false);
ALTER TABLE recommendations DROP CONSTRAINT IF EXISTS recommendations_decision_status_check;
UPDATE recommendations SET decision_status='Disapproved' WHERE decision_status='Overridden';
UPDATE decisions SET decision='Disapproved' WHERE decision='Overridden';
DROP TABLE IF EXISTS zoho_pushes;
