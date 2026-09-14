CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));

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

CREATE INDEX IF NOT EXISTS idx_events_venue ON events (venue_id);

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

    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

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

CREATE TABLE IF NOT EXISTS bookings_default PARTITION OF bookings DEFAULT;

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event_status ON bookings (event_id, status);

CREATE INDEX IF NOT EXISTS idx_bookings_status_price ON bookings (status, final_price) WHERE status = 'CONFIRMED';

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

CREATE TABLE IF NOT EXISTS seat_locks (
    seat_id UUID NOT NULL,
    event_id UUID NOT NULL,
    booking_id UUID NOT NULL,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (seat_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_seat_locks_expires ON seat_locks (expires_at);

CREATE TABLE IF NOT EXISTS short_links (
    code TEXT PRIMARY KEY,
    target_url TEXT NOT NULL,
    hit_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
