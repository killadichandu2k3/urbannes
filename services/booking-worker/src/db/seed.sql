-- Seed data — applied once to the single Postgres instance on boot.

INSERT INTO venues (id, name, venue_type, total_seats, city)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'PVR Grand Cinema', 'CINEMA', 120, 'Bengaluru'),
    ('22222222-2222-2222-2222-222222222222', 'Chinnaswamy Stadium', 'STADIUM', 5000, 'Bengaluru'),
    ('33333333-3333-3333-3333-333333333333', 'City Playhouse', 'THEATRE', 400, 'Bengaluru'),
    ('44444444-4444-4444-4444-444444444444', 'INOX Riverside', 'CINEMA', 96, 'Mumbai'),
    ('55555555-5555-5555-5555-555555555555', 'Wankhede Stadium', 'STADIUM', 4500, 'Mumbai')
ON CONFLICT DO NOTHING;

-- Events spread across PAST and FUTURE months — this is what actually
-- exercises the `bookings` partitioning (see schema.sql): a booking's
-- created_at roughly tracks its event's timing below, so seeded bookings
-- land across multiple monthly partitions instead of piling into just
-- "this month," which is what you'd get from a demo dataset that only
-- ever inserts "now() + a few days" events.
INSERT INTO events (id, venue_id, title, starts_at, ends_at, base_price, booking_open, created_at)
VALUES
    -- Past events (bookings for these will be CONFIRMED/CANCELLED, historical)
    ('aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
     'Dune: Part Three', now() - interval '4 months', now() - interval '4 months' + interval '3 hours', 250, false, now() - interval '4 months 5 days'),
    ('bbbbbbbb-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
     'RCB vs CSK', now() - interval '3 months', now() - interval '3 months' + interval '4 hours', 1500, false, now() - interval '3 months 10 days'),
    ('cccccccc-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
     'Hamlet — Live', now() - interval '2 months', now() - interval '2 months' + interval '3 hours', 600, false, now() - interval '2 months 3 days'),
    ('dddddddd-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444',
     'Oppenheimer Encore', now() - interval '1 month', now() - interval '1 month' + interval '3 hours', 300, false, now() - interval '1 month 7 days'),
    -- Present / near-future (mix of open and recently-closed)
    ('eeeeeeee-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555',
     'MI vs RCB', now() + interval '1 day', now() + interval '1 day 4 hours', 1800, true, now() - interval '15 days'),
    ('ffffffff-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111',
     'Dune: Part Three', now() + interval '2 days', now() + interval '2 days 3 hours', 250, true, now() - interval '5 days'),
    ('11111111-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222',
     'RCB vs CSK', now() + interval '5 days', now() + interval '5 days 4 hours', 1500, true, now() - interval '2 days'),
    ('22222222-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333',
     'Hamlet — Live', now() + interval '1 day', now() + interval '1 day 3 hours', 600, true, now() - interval '1 day'),
    -- Future
    ('33333333-9999-9999-9999-999999999999', '44444444-4444-4444-4444-444444444444',
     'Dune: Part Three (IMAX)', now() + interval '1 month', now() + interval '1 month' + interval '3 hours', 400, true, now()),
    ('44444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555',
     'MI vs CSK', now() + interval '2 months', now() + interval '2 months' + interval '4 hours', 2000, true, now())
ON CONFLICT DO NOTHING;

-- Seats for EVERY venue, not just the first cinema — the original seed
-- only ever populated seats for venue 1111..., which meant any booking
-- attempt against the stadium/theatre/other cinema would find zero seats.
-- Row/seat counts and tiers are scaled roughly to each venue_type so the
-- generated seat maps look plausible (a stadium has far more rows/seats
-- than a small theatre).
DO $$
DECLARE
    v RECORD;
    r TEXT;
    n INT;
    tier TEXT;
    row_count INT;
    seats_per_row INT;
    rows_arr TEXT[];
BEGIN
    FOR v IN SELECT id, venue_type FROM venues LOOP
        IF v.venue_type = 'STADIUM' THEN
            rows_arr := ARRAY['A','B','C','D','E','F','G','H'];
            seats_per_row := 20;
        ELSIF v.venue_type = 'THEATRE' THEN
            rows_arr := ARRAY['A','B','C','D','E','F'];
            seats_per_row := 12;
        ELSE -- CINEMA
            rows_arr := ARRAY['A','B','C','D'];
            seats_per_row := 8;
        END IF;

        FOREACH r IN ARRAY rows_arr LOOP
            FOR n IN 1..seats_per_row LOOP
                tier := CASE
                    WHEN r = rows_arr[1] THEN 'PLATINUM'
                    WHEN r = ANY(rows_arr[2:LEAST(3, array_length(rows_arr, 1))]) THEN 'GOLD'
                    ELSE 'SILVER'
                END;
                INSERT INTO seats (id, venue_id, row_label, seat_number, tier)
                VALUES (gen_random_uuid(), v.id, r, n, tier)
                ON CONFLICT (venue_id, row_label, seat_number) DO NOTHING;
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

-- Dummy bookings — gives analytics-api's venueStats/eventStats/
-- platformStats something real to aggregate, and gives the `bookings`
-- partitions something to actually hold (without this, every monthly
-- partition created in schema.sql would be empty). Spread across a mix of
-- CONFIRMED/CANCELLED/CREATED statuses and several distinct user_ids so
-- occupancy/revenue numbers look like a real, messy dataset rather than a
-- uniform demo.
DO $$
DECLARE
    ev RECORD;
    seat_row RECORD;
    booking_uuid UUID;
    fake_user UUID;
    seats_to_book INT;
    booking_status TEXT;
    price NUMERIC;
    booking_created TIMESTAMPTZ;
BEGIN
    FOR ev IN SELECT id, venue_id, base_price, created_at FROM events LOOP
        -- 3-6 bookings per event, each grabbing 1-3 seats, so occupancy
        -- numbers vary event-to-event instead of every event looking
        -- identically full.
        FOR i IN 1..(3 + (random() * 3)::int) LOOP
            fake_user := gen_random_uuid();
            booking_status := (ARRAY['CONFIRMED','CONFIRMED','CONFIRMED','CANCELLED','CREATED'])[1 + floor(random() * 5)::int];
            price := ev.base_price * (0.9 + random() * 0.4); -- some pricing-strategy-ish variance
            booking_uuid := gen_random_uuid();
            -- Computed ONCE and reused below for both the bookings row and
            -- the booking_seats FK column — random() re-evaluates on every
            -- call, so referencing "ev.created_at + random()*interval" a
            -- second time would produce a DIFFERENT timestamp than the one
            -- actually stored on the bookings row, and the composite FK
            -- (booking_id, booking_created_at) -> bookings(id, created_at)
            -- would fail to match on every insert.
            booking_created := ev.created_at + (random() * interval '2 days');

            INSERT INTO bookings (id, user_id, event_id, status, base_price, final_price, pricing_strategy, history, created_at, updated_at)
            VALUES (
                booking_uuid, fake_user, ev.id, booking_status, ev.base_price, price, 'flat',
                jsonb_build_array(jsonb_build_object('status', booking_status, 'at', booking_created)),
                booking_created,
                booking_created
            )
            ON CONFLICT DO NOTHING;

            -- Attach 1-3 real seats from this event's venue so seatsSold/
            -- occupancy math in analytics-api has real rows to COUNT().
            seats_to_book := 1 + (random() * 2)::int;
            FOR seat_row IN
                SELECT id FROM seats WHERE venue_id = ev.venue_id ORDER BY random() LIMIT seats_to_book
            LOOP
                INSERT INTO booking_seats (booking_id, booking_created_at, seat_id)
                VALUES (booking_uuid, booking_created, seat_row.id)
                ON CONFLICT DO NOTHING;
            END LOOP;
        END LOOP;
    END LOOP;
END $$;
