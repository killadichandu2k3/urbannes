-- Seed data â€” applied once to the single Postgres instance on boot.

INSERT INTO venues (id, name, venue_type, total_seats, city)
VALUES
    ('839fd577-38e3-4644-835b-7a9449b00874', 'PVR Director''s Cut, UB City', 'CINEMA', 120, 'Bengaluru'),
    ('7ecbf5b2-e949-46ef-abe9-73dcd51a5fa4', 'Mahalaxmi Race Course', 'STADIUM', 5000, 'Mumbai'),
    ('7afe7855-f5f0-4e15-b2dd-e94c822b83a3', 'NMACC Grand Theatre', 'THEATRE', 400, 'Mumbai'),
    ('f1522aa6-a23a-4842-93e5-277d472d8a0a', 'INOX Insignia, Atria Mall', 'CINEMA', 96, 'Mumbai'),
    ('014ec030-fcf0-4df7-9983-b480e71469dd', 'Jio World Garden', 'STADIUM', 4500, 'Mumbai')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city;

-- Events spread across PAST and FUTURE months â€” this is what actually
-- exercises the `bookings` partitioning (see schema.sql): a booking's
-- created_at roughly tracks its event's timing below, so seeded bookings
-- land across multiple monthly partitions instead of piling into just
-- "this month," which is what you'd get from a demo dataset that only
-- ever inserts "now() + a few days" events.
INSERT INTO events (id, venue_id, title, starts_at, ends_at, base_price, booking_open, created_at)
VALUES
-- Past events (bookings for these will be CONFIRMED/CANCELLED, historical)
    ('5308c601-6eed-4cd9-bf1b-d321534817e2', '839fd577-38e3-4644-835b-7a9449b00874',
     'Oppenheimer (IMAX 70mm Experience)', now() - interval '4 months', now() - interval '4 months' + interval '3 hours', 850, false, now() - interval '4 months 5 days'),
    ('52ac91e1-24f9-4c5c-b7fa-47d4d034bfa9', '7ecbf5b2-e949-46ef-abe9-73dcd51a5fa4',
     'Ed Sheeran: +â€“=Ã·Ã— Tour', now() - interval '3 months', now() - interval '3 months' + interval '4 hours', 4500, false, now() - interval '3 months 10 days'),
    ('63805fdc-cc0b-474a-bc4e-a2af79e7bd28', '7afe7855-f5f0-4e15-b2dd-e94c822b83a3',
     'Hamilton: The Broadway Musical', now() - interval '2 months', now() - interval '2 months' + interval '3 hours', 6500, false, now() - interval '2 months 3 days'),
    ('8ea03434-d09d-462d-9625-d493ba8d3395', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',
     'Trevor Noah: Off The Record Tour', now() - interval '1 month', now() - interval '1 month' + interval '3 hours', 3000, false, now() - interval '1 month 7 days'),
    -- Present / near-future (mix of open and recently-closed)
    ('4fd31c91-7c51-4dce-9fcc-0630a4741305', '014ec030-fcf0-4df7-9983-b480e71469dd',
     'Coldplay: Music of the Spheres World Tour', now() + interval '1 day', now() + interval '1 day 4 hours', 12500, true, now() - interval '15 days'),
    ('9199be9f-b623-486e-9ea3-d135ed7f7b19', '839fd577-38e3-4644-835b-7a9449b00874',
     'Dune: Part Two (Director''s Cut)', now() + interval '2 days', now() + interval '2 days 3 hours', 650, true, now() - interval '5 days'),
    ('86602f53-4c76-40c0-9f66-c3632a303036', '7ecbf5b2-e949-46ef-abe9-73dcd51a5fa4',
     'Lollapalooza India 2026', now() + interval '5 days', now() + interval '5 days 10 hours', 7500, true, now() - interval '2 days'),
    ('5ea14abc-01c4-413a-97c7-c7c5afeff5b3', '7afe7855-f5f0-4e15-b2dd-e94c822b83a3',
     'Cirque du Soleil: BAZZAR', now() + interval '1 day', now() + interval '1 day 3 hours', 4000, true, now() - interval '1 day'),
    -- Future
    ('44e15883-580b-4e8b-9fd8-891916aef135', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',
     'Hans Zimmer Live Orchestra', now() + interval '1 month', now() + interval '1 month' + interval '3 hours', 5000, true, now()),
    ('ca25e72d-d231-4d35-b3c2-6f970724ff2b', '014ec030-fcf0-4df7-9983-b480e71469dd',
     'Dua Lipa: Radical Optimism Tour', now() + interval '2 months', now() + interval '2 months' + interval '4 hours', 8500, true, now()),
    ('5a6b8589-72ed-4c6a-9504-948fc1a41337', '014ec030-fcf0-4df7-9983-b480e71469dd',
     'Justin Bieber: Justice World Tour', now() + interval '34 days', now() + interval '34 days' + interval '3 hours', 11858, true, now() - interval '97 days'),
    ('c4bfe77f-8746-4cca-aa33-cdbb7e015444', '839fd577-38e3-4644-835b-7a9449b00874',
     'Dune: Messiah', now() - interval '24 days', now() - interval '24 days' + interval '3 hours', 1472, false, now() - interval '17 days'),
    ('841c60cf-4938-4402-883c-6f0027a42a05', '7afe7855-f5f0-4e15-b2dd-e94c822b83a3',
     'Standup Comedy: Vir Das', now() + interval '51 days', now() + interval '51 days' + interval '3 hours', 2035, true, now() - interval '76 days'),
    ('50ac659f-39e3-4817-bfe6-03fd72bc5667', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',
     'Spider-Man: Beyond the Spider-Verse', now() - interval '11 days', now() - interval '11 days' + interval '3 hours', 1159, false, now() - interval '41 days'),
    ('ff8f2d3b-bd3a-4db4-9925-7e7b36cb4d0c', '7ecbf5b2-e949-46ef-abe9-73dcd51a5fa4',
     'Taylor Swift: The Eras Tour', now() - interval '11 days', now() - interval '11 days' + interval '3 hours', 4285, false, now() - interval '82 days'),
    ('89c4a2a5-4f47-4f64-bba7-a3c186f18317', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',
     'Dune: Messiah', now() + interval '20 days', now() + interval '20 days' + interval '3 hours', 1323, true, now() - interval '56 days'),
    ('1e1a90c8-47e7-474e-8874-828c2d14995f', '839fd577-38e3-4644-835b-7a9449b00874',
     'Spider-Man: Beyond the Spider-Verse', now() - interval '8 days', now() - interval '8 days' + interval '3 hours', 407, false, now() - interval '42 days'),
    ('d92d3b6e-8cb5-4b75-9a91-a0b5f93338b8', '014ec030-fcf0-4df7-9983-b480e71469dd',
     'Justin Bieber: Justice World Tour', now() - interval '8 days', now() - interval '8 days' + interval '3 hours', 10780, false, now() - interval '32 days'),
    ('5deaeaa1-ac64-4e46-bbcd-a4e9d54a8242', '839fd577-38e3-4644-835b-7a9449b00874',
     'Joker: Folie à Deux', now() + interval '24 days', now() + interval '24 days' + interval '3 hours', 966, true, now() - interval '65 days'),
    ('f22033c5-e2ea-4187-8b7f-756d94adbeba', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',
     'Gladiator II', now() + interval '35 days', now() + interval '35 days' + interval '3 hours', 1363, true, now() - interval '53 days'),
    ('8ebde0e8-1b25-445f-976f-dbc793884498', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',
     'Joker: Folie à Deux', now() + interval '14 days', now() + interval '14 days' + interval '3 hours', 1077, true, now() - interval '25 days'),
    ('38f6856f-48af-4557-9064-1f67bceea8a8', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',
     'Avatar: Fire and Ash', now() - interval '21 days', now() - interval '21 days' + interval '3 hours', 1330, false, now() - interval '32 days'),
    ('fdd547b2-689a-4082-96df-eafdfac95386', '7afe7855-f5f0-4e15-b2dd-e94c822b83a3',
     'The Lion King Musical', now() + interval '30 days', now() + interval '30 days' + interval '3 hours', 1819, true, now() - interval '78 days'),
    ('e860369c-0980-4968-b550-94a6820d8557', '014ec030-fcf0-4df7-9983-b480e71469dd',
     'Justin Bieber: Justice World Tour', now() + interval '12 days', now() + interval '12 days' + interval '3 hours', 17658, true, now() - interval '66 days'),
    ('69ecabfe-5dff-460d-95e9-e0ec3b4ff211', '839fd577-38e3-4644-835b-7a9449b00874',
     'Dune: Messiah', now() + interval '17 days', now() + interval '17 days' + interval '3 hours', 313, true, now() - interval '46 days'),
    ('80f51830-4126-4900-bb79-6030e58a1a7e', '7ecbf5b2-e949-46ef-abe9-73dcd51a5fa4',
     'Taylor Swift: The Eras Tour', now() + interval '51 days', now() + interval '51 days' + interval '3 hours', 14114, true, now() - interval '17 days'),
    ('6b065222-f4b5-4557-81a0-ae9b3a6f7358', '7afe7855-f5f0-4e15-b2dd-e94c822b83a3',
     'The Phantom of the Opera', now() - interval '15 days', now() - interval '15 days' + interval '3 hours', 3050, false, now() - interval '43 days'),
    ('e36eb8b3-d3e2-423e-9ff5-940e405cfe7c', '7ecbf5b2-e949-46ef-abe9-73dcd51a5fa4',
     'UEFA Champions League Final Viewing', now() + interval '23 days', now() + interval '23 days' + interval '3 hours', 24857, true, now() - interval '51 days'),
    ('71baea7a-e086-4e81-9fc5-0b23d41c1a8e', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',
     'The Lord of the Rings: The War of the Rohirrim', now() + interval '60 days', now() + interval '60 days' + interval '3 hours', 1004, true, now() - interval '67 days'),
    ('c033c1e3-9985-492e-b7b8-1e08b7250b90', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',
     'Avatar: Fire and Ash', now() - interval '20 days', now() - interval '20 days' + interval '3 hours', 356, false, now() - interval '97 days'),
    ('90a1dbf2-2455-4ae3-a6e7-f0bc174e1c14', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',
     'Mission: Impossible - Dead Reckoning', now() + interval '36 days', now() + interval '36 days' + interval '3 hours', 1208, true, now() - interval '93 days'),
    ('84260583-3d5f-49e0-b36e-96e0ae6c1114', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',
     'Deadpool & Wolverine', now() - interval '37 days', now() - interval '37 days' + interval '3 hours', 587, false, now() - interval '22 days'),
    ('2fd559f7-22f2-4325-bebc-e342f4325f90', '7afe7855-f5f0-4e15-b2dd-e94c822b83a3',
     'Wicked: The Untold Story', now() + interval '10 days', now() + interval '10 days' + interval '3 hours', 7199, true, now() - interval '84 days'),
    ('fe8b99ec-6c7a-4d12-89c6-506c29ffad16', '014ec030-fcf0-4df7-9983-b480e71469dd',
     'UEFA Champions League Final Viewing', now() - interval '11 days', now() - interval '11 days' + interval '3 hours', 14128, false, now() - interval '37 days'),
    ('85e128f6-fb30-4070-949e-07a5af65ae21', '7ecbf5b2-e949-46ef-abe9-73dcd51a5fa4',
     'Metallica: M72 World Tour', now() - interval '20 days', now() - interval '20 days' + interval '3 hours', 17910, false, now() - interval '77 days')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, base_price = EXCLUDED.base_price;

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

-- Dummy bookings â€” gives analytics-api's venueStats/eventStats/
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
            -- the booking_seats FK column â€” random() re-evaluates on every
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
    ('5a6b8589-72ed-4c6a-9504-948fc1a41337', '014ec030-fcf0-4df7-9983-b480e71469dd',

     'Justin Bieber: Justice World Tour', now() + interval '34 days', now() + interval '34 days' + interval '3 hours', 11858, true, now() - interval '97 days'),

    ('c4bfe77f-8746-4cca-aa33-cdbb7e015444', '839fd577-38e3-4644-835b-7a9449b00874',

     'Dune: Messiah', now() - interval '24 days', now() - interval '24 days' + interval '3 hours', 1472, false, now() - interval '17 days'),

    ('841c60cf-4938-4402-883c-6f0027a42a05', '7afe7855-f5f0-4e15-b2dd-e94c822b83a3',

     'Standup Comedy: Vir Das', now() + interval '51 days', now() + interval '51 days' + interval '3 hours', 2035, true, now() - interval '76 days'),

    ('50ac659f-39e3-4817-bfe6-03fd72bc5667', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',

     'Spider-Man: Beyond the Spider-Verse', now() - interval '11 days', now() - interval '11 days' + interval '3 hours', 1159, false, now() - interval '41 days'),

    ('ff8f2d3b-bd3a-4db4-9925-7e7b36cb4d0c', '7ecbf5b2-e949-46ef-abe9-73dcd51a5fa4',

     'Taylor Swift: The Eras Tour', now() - interval '11 days', now() - interval '11 days' + interval '3 hours', 4285, false, now() - interval '82 days'),

    ('89c4a2a5-4f47-4f64-bba7-a3c186f18317', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',

     'Dune: Messiah', now() + interval '20 days', now() + interval '20 days' + interval '3 hours', 1323, true, now() - interval '56 days'),

    ('1e1a90c8-47e7-474e-8874-828c2d14995f', '839fd577-38e3-4644-835b-7a9449b00874',

     'Spider-Man: Beyond the Spider-Verse', now() - interval '8 days', now() - interval '8 days' + interval '3 hours', 407, false, now() - interval '42 days'),

    ('d92d3b6e-8cb5-4b75-9a91-a0b5f93338b8', '014ec030-fcf0-4df7-9983-b480e71469dd',

     'Justin Bieber: Justice World Tour', now() - interval '8 days', now() - interval '8 days' + interval '3 hours', 10780, false, now() - interval '32 days'),

    ('5deaeaa1-ac64-4e46-bbcd-a4e9d54a8242', '839fd577-38e3-4644-835b-7a9449b00874',

     'Joker: Folie ├ꇃ 䐀攀甀砀✀Ⰰ 渀漀眀⠀⤀ ⬀ 椀渀琀攀爀瘀愀氀 ✀㈀㐀 搀愀礀猀✀Ⰰ 渀漀眀⠀⤀ ⬀ 椀渀琀攀爀瘀愀氀 ✀㈀㐀 搀愀礀猀✀ ⬀ 椀渀琀攀爀瘀愀氀 ✀㌀ 栀漀甀爀猀✀Ⰰ 㤀㘀㘀Ⰰ 琀爀甀攀Ⰰ 渀漀眀⠀⤀ ⴀ 椀渀琀攀爀瘀愀氀 ✀㘀㔀 搀愀礀猀✀⤀Ⰰ਀਀    ⠀✀昀㈀㈀　㌀㌀挀㔀ⴀ攀㈀攀愀ⴀ㐀㄀㠀㜀ⴀ㠀戀㜀昀ⴀ㜀㔀㘀搀㤀㐀愀搀戀攀戀愀✀Ⰰ ✀昀㄀㔀㈀㈀愀愀㘀ⴀ愀㈀㌀愀ⴀ㐀㠀㐀㈀ⴀ㤀㌀攀㔀ⴀ㈀㜀㜀搀㐀㜀㈀搀㠀愀　愀✀Ⰰ਀਀     ✀䜀氀愀搀椀愀琀漀爀 䤀䤀✀Ⰰ 渀漀眀⠀⤀ ⬀ 椀渀琀攀爀瘀愀氀 ✀㌀㔀 搀愀礀猀✀Ⰰ 渀漀眀⠀⤀ ⬀ 椀渀琀攀爀瘀愀氀 ✀㌀㔀 搀愀礀猀✀ ⬀ 椀渀琀攀爀瘀愀氀 ✀㌀ 栀漀甀爀猀✀Ⰰ ㄀㌀㘀㌀Ⰰ 琀爀甀攀Ⰰ 渀漀眀⠀⤀ ⴀ 椀渀琀攀爀瘀愀氀 ✀㔀㌀ 搀愀礀猀✀⤀Ⰰ਀਀    ⠀✀㠀攀戀搀攀　攀㠀ⴀ㄀戀㈀㔀ⴀ㐀㐀㔀昀ⴀ㤀㜀㘀昀ⴀ搀戀挀㜀㤀㌀㠀㠀㐀㐀㤀㠀✀Ⰰ ✀昀㄀㔀㈀㈀愀愀㘀ⴀ愀㈀㌀愀ⴀ㐀㠀㐀㈀ⴀ㤀㌀攀㔀ⴀ㈀㜀㜀搀㐀㜀㈀搀㠀愀　愀✀Ⰰ਀਀     ✀䨀漀欀攀爀㨀 䘀漀氀椀攀 ᰀ쌥¡ Deux', now() + interval '14 days', now() + interval '14 days' + interval '3 hours', 1077, true, now() - interval '25 days'),

    ('38f6856f-48af-4557-9064-1f67bceea8a8', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',

     'Avatar: Fire and Ash', now() - interval '21 days', now() - interval '21 days' + interval '3 hours', 1330, false, now() - interval '32 days'),

    ('fdd547b2-689a-4082-96df-eafdfac95386', '7afe7855-f5f0-4e15-b2dd-e94c822b83a3',

     'The Lion King Musical', now() + interval '30 days', now() + interval '30 days' + interval '3 hours', 1819, true, now() - interval '78 days'),

    ('e860369c-0980-4968-b550-94a6820d8557', '014ec030-fcf0-4df7-9983-b480e71469dd',

     'Justin Bieber: Justice World Tour', now() + interval '12 days', now() + interval '12 days' + interval '3 hours', 17658, true, now() - interval '66 days'),

    ('69ecabfe-5dff-460d-95e9-e0ec3b4ff211', '839fd577-38e3-4644-835b-7a9449b00874',

     'Dune: Messiah', now() + interval '17 days', now() + interval '17 days' + interval '3 hours', 313, true, now() - interval '46 days'),

    ('80f51830-4126-4900-bb79-6030e58a1a7e', '7ecbf5b2-e949-46ef-abe9-73dcd51a5fa4',

     'Taylor Swift: The Eras Tour', now() + interval '51 days', now() + interval '51 days' + interval '3 hours', 14114, true, now() - interval '17 days'),

    ('6b065222-f4b5-4557-81a0-ae9b3a6f7358', '7afe7855-f5f0-4e15-b2dd-e94c822b83a3',

     'The Phantom of the Opera', now() - interval '15 days', now() - interval '15 days' + interval '3 hours', 3050, false, now() - interval '43 days'),

    ('e36eb8b3-d3e2-423e-9ff5-940e405cfe7c', '7ecbf5b2-e949-46ef-abe9-73dcd51a5fa4',

     'UEFA Champions League Final Viewing', now() + interval '23 days', now() + interval '23 days' + interval '3 hours', 24857, true, now() - interval '51 days'),

    ('71baea7a-e086-4e81-9fc5-0b23d41c1a8e', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',

     'The Lord of the Rings: The War of the Rohirrim', now() + interval '60 days', now() + interval '60 days' + interval '3 hours', 1004, true, now() - interval '67 days'),

    ('c033c1e3-9985-492e-b7b8-1e08b7250b90', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',

     'Avatar: Fire and Ash', now() - interval '20 days', now() - interval '20 days' + interval '3 hours', 356, false, now() - interval '97 days'),

    ('90a1dbf2-2455-4ae3-a6e7-f0bc174e1c14', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',

     'Mission: Impossible - Dead Reckoning', now() + interval '36 days', now() + interval '36 days' + interval '3 hours', 1208, true, now() - interval '93 days'),

    ('84260583-3d5f-49e0-b36e-96e0ae6c1114', 'f1522aa6-a23a-4842-93e5-277d472d8a0a',

     'Deadpool & Wolverine', now() - interval '37 days', now() - interval '37 days' + interval '3 hours', 587, false, now() - interval '22 days'),

    ('2fd559f7-22f2-4325-bebc-e342f4325f90', '7afe7855-f5f0-4e15-b2dd-e94c822b83a3',

     'Wicked: The Untold Story', now() + interval '10 days', now() + interval '10 days' + interval '3 hours', 7199, true, now() - interval '84 days'),

    ('fe8b99ec-6c7a-4d12-89c6-506c29ffad16', '014ec030-fcf0-4df7-9983-b480e71469dd',

     'UEFA Champions League Final Viewing', now() - interval '11 days', now() - interval '11 days' + interval '3 hours', 14128, false, now() - interval '37 days'),

    ('85e128f6-fb30-4070-949e-07a5af65ae21', '7ecbf5b2-e949-46ef-abe9-73dcd51a5fa4',

     'Metallica: M72 World Tour', now() - interval '20 days', now() - interval '20 days' + interval '3 hours', 17910, false, now() - interval '77 days')

