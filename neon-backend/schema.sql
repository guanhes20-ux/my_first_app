CREATE TABLE IF NOT EXISTS rental_schema_versions(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rental_cars(id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS rental_bookings(
 id text PRIMARY KEY,
 car_id text NOT NULL REFERENCES rental_cars(id),
 car_snapshot jsonb NOT NULL,
 start_at timestamptz NOT NULL,
 end_at timestamptz NOT NULL CHECK(end_at > start_at),
 days integer NOT NULL CHECK(days > 0),
 total integer NOT NULL CHECK(total >= 0),
 status text NOT NULL CHECK(status IN ('hold','submitted','confirmed','cancelled','expired')),
 created timestamptz NOT NULL DEFAULT now(),
 expires timestamptz NOT NULL,
 telegram_id bigint,
 form_token_hash text UNIQUE,
 form_expires timestamptz,
 personal text,
 consent_at timestamptz,
 consent_version text
);
CREATE INDEX IF NOT EXISTS rental_bookings_overlap ON rental_bookings(car_id,start_at,end_at) WHERE status IN ('hold','submitted','confirmed');
CREATE INDEX IF NOT EXISTS rental_bookings_telegram ON rental_bookings(telegram_id,created DESC);
CREATE TABLE IF NOT EXISTS rental_webhook_updates(
 update_id bigint PRIMARY KEY,
 reply jsonb,
 delivered boolean NOT NULL DEFAULT false,
 created timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rental_rate_limits(
 key text PRIMARY KEY,
 count integer NOT NULL,
 reset_at timestamptz NOT NULL
);
INSERT INTO rental_schema_versions(version) VALUES(1) ON CONFLICT DO NOTHING;
