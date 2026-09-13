-- ============================================================================
-- UrbanNes schema — applied to a single Postgres instance.
-- ----------------------------------------------------------------------------
-- This project used to shard bookings across two independent Postgres
-- instances via a consistent hash ring (see git history for the removed
-- shardRouter.ts) — that's been removed. Everything now lives in one
-- database, so ordinary foreign keys apply everywhere a relationship
-- exists (e.g. events -> venues), with no cross-instance FK gaps to
-- reason about.
-- ============================================================================

-- Users — account/auth records. auth-api is the only service that writes
-- here (on register) or reads here (on login/me, cache-aside through
-- Redis — see auth-api's cache/userCache.ts). bookings.user_id stays a
-- bare UUID with no FK to this table — not a sharding artifact, just that
-- booking-worker (which owns `bookings`) and auth-api (which owns `users`)
-- are separate services with separate write paths, so enforcing that FK
-- would mean a cross-service check on every booking write.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
-- Google-authenticated accounts have no password of their own (Google IS
-- the credential check) and are identified by Google's stable per-account
-- subject id, not email alone — a user could change their Google email,
-- and two different providers could theoretically claim the same email.
-- password_hash is relaxed to nullable for exactly this case: a
-- Google-only account has NULL here, and login() (see resolvers.ts)
-- already refuses any account with no password hash before it would ever
-- call bcrypt.compare against null.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));

-- One-time codes for email verification at signup. Short-lived and
-- deliberately separate from `users` (rather than a couple of columns on
-- it) so OTP churn — resend, expiry, attempt-count — never touches the
-- users table's own write path, matching this project's existing pattern
-- of small purpose-specific tables (see payment_orders below) instead of
-- widening a core table for a narrow, temporary concern.
CREATE TABLE IF NOT EXISTS email_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'SIGNUP_VERIFICATION' CHECK (purpose IN ('SIGNUP_VERIFICATION')),
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps (lower(email), created_at DESC);

CREATE TABLE IF NOT EXISTS venues (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    venue_type TEXT NOT NULL CHECK (venue_type IN ('CINEMA', 'STADIUM', 'THEATRE')),
    total_seats INT NOT NULL,
    city TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_venues_name_trgm ON venues USING GIN (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES venues(id),
    title TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    base_price NUMERIC(10, 2) NOT NULL,
    booking_open BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events (starts_at);
-- Backs venueStats/eventStats aggregate joins (events JOIN ... WHERE venue_id = $1)
-- in analytics-api, and the venue-detail page's "events at this venue" read.
CREATE INDEX IF NOT EXISTS idx_events_venue ON events (venue_id);
-- pg_trgm trigram index — a plain B-tree index (the default) can't serve
-- `ILIKE '%query%'` at all, since a leading wildcard means there's no
-- fixed prefix to seek on; Postgres would fall back to a full sequential
-- scan on every keystroke. Trigram indexes decompose the string into
-- overlapping 3-character sequences and index THOSE, which a leading-
-- wildcard ILIKE can use via GIN. This is the standard real-world fix for
-- "autocomplete on a substring match," not something specific to this
-- project — the same technique backs substring search in most production
-- Postgres-backed systems that don't reach for a dedicated search engine
-- (Elasticsearch/Meilisearch/etc.) for a workload this size.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_events_title_trgm ON events USING GIN (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS seats (
    id UUID PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES venues(id),
    row_label TEXT NOT NULL,
    seat_number INT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('PLATINUM', 'GOLD', 'SILVER')),
    UNIQUE (venue_id, row_label, seat_number)
);
-- Backs seat-map reads (all seats for a venue) and analytics venue rollups.
CREATE INDEX IF NOT EXISTS idx_seats_venue ON seats (venue_id);

CREATE TABLE IF NOT EXISTS bookings (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    event_id UUID NOT NULL REFERENCES events(id),
    status TEXT NOT NULL DEFAULT 'CREATED'
        CHECK (status IN ('CREATED', 'SEATS_LOCKED', 'PAYMENT_PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
    base_price NUMERIC(10, 2) NOT NULL,
    final_price NUMERIC(10, 2) NOT NULL,
    discount_code TEXT,
    pricing_strategy TEXT NOT NULL DEFAULT 'flat',
    history JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Partitioned tables require the partition key (created_at) to be part
    -- of every unique constraint, including the primary key — Postgres
    -- can't otherwise guarantee uniqueness without knowing which partition
    -- to check. This means `id` alone is no longer enforced unique AT THE
    -- DATABASE LEVEL (only the (id, created_at) pair is) — in practice
    -- that's fine here since `id` is a gen_random_uuid(), whose collision
    -- odds are negligible, but it's a real, worth-knowing tradeoff of
    -- partitioning, not a detail to gloss over.
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Monthly partitions. Real production systems automate this (pg_partman,
-- or a scheduled job that creates next month's partition ahead of time)
-- rather than hand-listing months — the DO block below creates a rolling
-- window (6 months back, 6 months forward from "now") so the seed data and
-- near-future bookings both land somewhere, and gives you a concrete
-- pattern to automate later rather than a one-off migration that silently
-- stops working the month after you stop maintaining it by hand.
DO $$
DECLARE
    month_start DATE;
    month_end DATE;
    partition_name TEXT;
    i INT;
BEGIN
    FOR i IN -6..6 LOOP
        month_start := date_trunc('month', now() + (i || ' months')::interval)::date;
        month_end := (month_start + interval '1 month')::date;
        partition_name := 'bookings_' || to_char(month_start, 'YYYY_MM');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF bookings FOR VALUES FROM (%L) TO (%L)',
            partition_name, month_start, month_end
        );
    END LOOP;
END $$;

-- Catch-all partition for any row outside the rolling window above (e.g. a
-- clock skew, a backfilled historical booking, or simply running this
-- container many months after it was first deployed without the
-- automation mentioned above having kept up) — without this, an INSERT
-- for a created_at outside all listed ranges would hard-fail.
CREATE TABLE IF NOT EXISTS bookings_default PARTITION OF bookings DEFAULT;

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event_status ON bookings (event_id, status);
-- Composite index backing analytics-api's per-venue/per-event aggregate
-- queries (see analytics-api/src/graphql/resolvers.ts), which filter by
-- status and read final_price — this lets Postgres satisfy those GROUP BY
-- queries from the index instead of the heap for the CONFIRMED-only rows
-- that matter for revenue math.
CREATE INDEX IF NOT EXISTS idx_bookings_status_price ON bookings (status, final_price) WHERE status = 'CONFIRMED';

-- FKs into `bookings` now need BOTH columns of its composite primary key
-- (id, created_at) — that's the direct, unavoidable cost of partitioning
-- `bookings`: every child table gets a booking_created_at "shadow" column
-- purely to satisfy the FK, even though it's redundant with the parent
-- row it points to. This is a well-known real-world partitioning
-- trade-off, not a workaround specific to this project.
CREATE TABLE IF NOT EXISTS booking_seats (
    booking_id UUID NOT NULL,
    booking_created_at TIMESTAMPTZ NOT NULL,
    seat_id UUID NOT NULL REFERENCES seats(id),
    PRIMARY KEY (booking_id, seat_id),
    FOREIGN KEY (booking_id, booking_created_at) REFERENCES bookings (id, created_at) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS booking_addons (
    booking_id UUID NOT NULL,
    booking_created_at TIMESTAMPTZ NOT NULL,
    addon_code TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    PRIMARY KEY (booking_id, addon_code),
    FOREIGN KEY (booking_id, booking_created_at) REFERENCES bookings (id, created_at) ON DELETE CASCADE
);

-- Durable seat-hold record, reconciled against the Redis Cluster TTL lock.
CREATE TABLE IF NOT EXISTS seat_locks (
    seat_id UUID NOT NULL,
    event_id UUID NOT NULL,
    booking_id UUID NOT NULL,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (seat_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_seat_locks_expires ON seat_locks (expires_at);

-- Short links (folded in from the standalone URL-shortener concept).
-- Keyed by its own short code, unrelated to any event.
CREATE TABLE IF NOT EXISTS short_links (
    code TEXT PRIMARY KEY,
    target_url TEXT NOT NULL,
    hit_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Payments — one Razorpay order per booking attempt. `bookings` stays the
-- source of truth for booking STATE (SEATS_LOCKED/PAYMENT_PENDING/CONFIRMED
-- — see BookingState.ts); this table is the source of truth for the actual
-- payment gateway interaction, kept separate because a booking can retry
-- payment (a failed/abandoned Razorpay order shouldn't block a fresh one)
-- and because gateway fields (order id, signature) are meaningless to any
-- other part of the system.
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    booking_created_at TIMESTAMPTZ NOT NULL,
    user_id UUID NOT NULL,
    razorpay_order_id TEXT NOT NULL UNIQUE,
    razorpay_payment_id TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'CREATED'
        CHECK (status IN ('CREATED', 'PAID', 'VERIFICATION_FAILED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (booking_id, booking_created_at) REFERENCES bookings (id, created_at) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_booking ON payment_orders (booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders (user_id);

-- ============================================================================
-- In-app notifications — the bell icon's data source. Written by
-- notification-service's new InAppChannelAdapter (see
-- services/notification-service/src/patterns/adapter/ChannelAdapters.ts)
-- alongside the email send, not instead of it — the two channels are
-- independent per the existing Adapter pattern, so one failing doesn't
-- block the other.
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
