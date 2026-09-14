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
        ( ' 5 a 6 b 8 5 8 9 - 7 2 e d - 4 c 6 a - 9 5 0 4 - 9 4 8 f c 1 a 4 1 3 3 7 ' ,   ' 0 1 4 e c 0 3 0 - f c f 0 - 4 d f 7 - 9 9 8 3 - b 4 8 0 e 7 1 4 6 9 d d ' , 
 
           ' J u s t i n   B i e b e r :   J u s t i c e   W o r l d   T o u r ' ,   n o w ( )   +   i n t e r v a l   ' 3 4   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 3 4   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 1 8 5 8 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 9 7   d a y s ' ) , 
 
         ( ' c 4 b f e 7 7 f - 8 7 4 6 - 4 c c a - a a 3 3 - c d b b 7 e 0 1 5 4 4 4 ' ,   ' 8 3 9 f d 5 7 7 - 3 8 e 3 - 4 6 4 4 - 8 3 5 b - 7 a 9 4 4 9 b 0 0 8 7 4 ' , 
 
           ' D u n e :   M e s s i a h ' ,   n o w ( )   -   i n t e r v a l   ' 2 4   d a y s ' ,   n o w ( )   -   i n t e r v a l   ' 2 4   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 4 7 2 ,   f a l s e ,   n o w ( )   -   i n t e r v a l   ' 1 7   d a y s ' ) , 
 
         ( ' 8 4 1 c 6 0 c f - 4 9 3 8 - 4 4 0 2 - 8 8 3 c - 6 f 0 0 2 7 a 4 2 a 0 5 ' ,   ' 7 a f e 7 8 5 5 - f 5 f 0 - 4 e 1 5 - b 2 d d - e 9 4 c 8 2 2 b 8 3 a 3 ' , 
 
           ' S t a n d u p   C o m e d y :   V i r   D a s ' ,   n o w ( )   +   i n t e r v a l   ' 5 1   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 5 1   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   2 0 3 5 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 7 6   d a y s ' ) , 
 
         ( ' 5 0 a c 6 5 9 f - 3 9 e 3 - 4 8 1 7 - b f e 6 - 0 3 f d 7 2 b c 5 6 6 7 ' ,   ' f 1 5 2 2 a a 6 - a 2 3 a - 4 8 4 2 - 9 3 e 5 - 2 7 7 d 4 7 2 d 8 a 0 a ' , 
 
           ' S p i d e r - M a n :   B e y o n d   t h e   S p i d e r - V e r s e ' ,   n o w ( )   -   i n t e r v a l   ' 1 1   d a y s ' ,   n o w ( )   -   i n t e r v a l   ' 1 1   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 1 5 9 ,   f a l s e ,   n o w ( )   -   i n t e r v a l   ' 4 1   d a y s ' ) , 
 
         ( ' f f 8 f 2 d 3 b - b d 3 a - 4 d b 4 - 9 9 2 5 - 7 e 7 b 3 6 c b 4 d 0 c ' ,   ' 7 e c b f 5 b 2 - e 9 4 9 - 4 6 e f - a b e 9 - 7 3 d c d 5 1 a 5 f a 4 ' , 
 
           ' T a y l o r   S w i f t :   T h e   E r a s   T o u r ' ,   n o w ( )   -   i n t e r v a l   ' 1 1   d a y s ' ,   n o w ( )   -   i n t e r v a l   ' 1 1   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   4 2 8 5 ,   f a l s e ,   n o w ( )   -   i n t e r v a l   ' 8 2   d a y s ' ) , 
 
         ( ' 8 9 c 4 a 2 a 5 - 4 f 4 7 - 4 f 6 4 - b b a 7 - a 3 c 1 8 6 f 1 8 3 1 7 ' ,   ' f 1 5 2 2 a a 6 - a 2 3 a - 4 8 4 2 - 9 3 e 5 - 2 7 7 d 4 7 2 d 8 a 0 a ' , 
 
           ' D u n e :   M e s s i a h ' ,   n o w ( )   +   i n t e r v a l   ' 2 0   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 2 0   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 3 2 3 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 5 6   d a y s ' ) , 
 
         ( ' 1 e 1 a 9 0 c 8 - 4 7 e 7 - 4 7 4 e - 8 8 7 4 - 8 2 8 c 2 d 1 4 9 9 5 f ' ,   ' 8 3 9 f d 5 7 7 - 3 8 e 3 - 4 6 4 4 - 8 3 5 b - 7 a 9 4 4 9 b 0 0 8 7 4 ' , 
 
           ' S p i d e r - M a n :   B e y o n d   t h e   S p i d e r - V e r s e ' ,   n o w ( )   -   i n t e r v a l   ' 8   d a y s ' ,   n o w ( )   -   i n t e r v a l   ' 8   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   4 0 7 ,   f a l s e ,   n o w ( )   -   i n t e r v a l   ' 4 2   d a y s ' ) , 
 
         ( ' d 9 2 d 3 b 6 e - 8 c b 5 - 4 b 7 5 - 9 a 9 1 - a 0 b 5 f 9 3 3 3 8 b 8 ' ,   ' 0 1 4 e c 0 3 0 - f c f 0 - 4 d f 7 - 9 9 8 3 - b 4 8 0 e 7 1 4 6 9 d d ' , 
 
           ' J u s t i n   B i e b e r :   J u s t i c e   W o r l d   T o u r ' ,   n o w ( )   -   i n t e r v a l   ' 8   d a y s ' ,   n o w ( )   -   i n t e r v a l   ' 8   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 0 7 8 0 ,   f a l s e ,   n o w ( )   -   i n t e r v a l   ' 3 2   d a y s ' ) , 
 
         ( ' 5 d e a e a a 1 - a c 6 4 - 4 e 4 6 - b b c d - a 4 e 9 d 5 4 a 8 2 4 2 ' ,   ' 8 3 9 f d 5 7 7 - 3 8 e 3 - 4 6 4 4 - 8 3 5 b - 7 a 9 4 4 9 b 0 0 8 7 4 ' , 
 
           ' J o k e r :   F o l i e   %á   D e u x ' ,   n o w ( )   +   i n t e r v a l   ' 2 4   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 2 4   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   9 6 6 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 6 5   d a y s ' ) , 
 
         ( ' f 2 2 0 3 3 c 5 - e 2 e a - 4 1 8 7 - 8 b 7 f - 7 5 6 d 9 4 a d b e b a ' ,   ' f 1 5 2 2 a a 6 - a 2 3 a - 4 8 4 2 - 9 3 e 5 - 2 7 7 d 4 7 2 d 8 a 0 a ' , 
 
           ' G l a d i a t o r   I I ' ,   n o w ( )   +   i n t e r v a l   ' 3 5   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 3 5   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 3 6 3 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 5 3   d a y s ' ) , 
 
         ( ' 8 e b d e 0 e 8 - 1 b 2 5 - 4 4 5 f - 9 7 6 f - d b c 7 9 3 8 8 4 4 9 8 ' ,   ' f 1 5 2 2 a a 6 - a 2 3 a - 4 8 4 2 - 9 3 e 5 - 2 7 7 d 4 7 2 d 8 a 0 a ' , 
 
           ' J o k e r :   F o l i e   %á   D e u x ' ,   n o w ( )   +   i n t e r v a l   ' 1 4   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 1 4   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 0 7 7 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 2 5   d a y s ' ) , 
 
         ( ' 3 8 f 6 8 5 6 f - 4 8 a f - 4 5 5 7 - 9 0 6 4 - 1 f 6 7 b c e e a 8 a 8 ' ,   ' f 1 5 2 2 a a 6 - a 2 3 a - 4 8 4 2 - 9 3 e 5 - 2 7 7 d 4 7 2 d 8 a 0 a ' , 
 
           ' A v a t a r :   F i r e   a n d   A s h ' ,   n o w ( )   -   i n t e r v a l   ' 2 1   d a y s ' ,   n o w ( )   -   i n t e r v a l   ' 2 1   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 3 3 0 ,   f a l s e ,   n o w ( )   -   i n t e r v a l   ' 3 2   d a y s ' ) , 
 
         ( ' f d d 5 4 7 b 2 - 6 8 9 a - 4 0 8 2 - 9 6 d f - e a f d f a c 9 5 3 8 6 ' ,   ' 7 a f e 7 8 5 5 - f 5 f 0 - 4 e 1 5 - b 2 d d - e 9 4 c 8 2 2 b 8 3 a 3 ' , 
 
           ' T h e   L i o n   K i n g   M u s i c a l ' ,   n o w ( )   +   i n t e r v a l   ' 3 0   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 3 0   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 8 1 9 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 7 8   d a y s ' ) , 
 
         ( ' e 8 6 0 3 6 9 c - 0 9 8 0 - 4 9 6 8 - b 5 5 0 - 9 4 a 6 8 2 0 d 8 5 5 7 ' ,   ' 0 1 4 e c 0 3 0 - f c f 0 - 4 d f 7 - 9 9 8 3 - b 4 8 0 e 7 1 4 6 9 d d ' , 
 
           ' J u s t i n   B i e b e r :   J u s t i c e   W o r l d   T o u r ' ,   n o w ( )   +   i n t e r v a l   ' 1 2   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 1 2   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 7 6 5 8 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 6 6   d a y s ' ) , 
 
         ( ' 6 9 e c a b f e - 5 d f f - 4 6 0 d - 9 5 e 9 - e 0 e c 3 b 4 f f 2 1 1 ' ,   ' 8 3 9 f d 5 7 7 - 3 8 e 3 - 4 6 4 4 - 8 3 5 b - 7 a 9 4 4 9 b 0 0 8 7 4 ' , 
 
           ' D u n e :   M e s s i a h ' ,   n o w ( )   +   i n t e r v a l   ' 1 7   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 1 7   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   3 1 3 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 4 6   d a y s ' ) , 
 
         ( ' 8 0 f 5 1 8 3 0 - 4 1 2 6 - 4 9 0 0 - b b 7 9 - 6 0 3 0 e 5 8 a 1 a 7 e ' ,   ' 7 e c b f 5 b 2 - e 9 4 9 - 4 6 e f - a b e 9 - 7 3 d c d 5 1 a 5 f a 4 ' , 
 
           ' T a y l o r   S w i f t :   T h e   E r a s   T o u r ' ,   n o w ( )   +   i n t e r v a l   ' 5 1   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 5 1   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 4 1 1 4 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 1 7   d a y s ' ) , 
 
         ( ' 6 b 0 6 5 2 2 2 - f 4 b 5 - 4 5 5 7 - 8 1 a 0 - a e 9 b 3 a 6 f 7 3 5 8 ' ,   ' 7 a f e 7 8 5 5 - f 5 f 0 - 4 e 1 5 - b 2 d d - e 9 4 c 8 2 2 b 8 3 a 3 ' , 
 
           ' T h e   P h a n t o m   o f   t h e   O p e r a ' ,   n o w ( )   -   i n t e r v a l   ' 1 5   d a y s ' ,   n o w ( )   -   i n t e r v a l   ' 1 5   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   3 0 5 0 ,   f a l s e ,   n o w ( )   -   i n t e r v a l   ' 4 3   d a y s ' ) , 
 
         ( ' e 3 6 e b 8 b 3 - d 3 e 2 - 4 2 3 e - 9 f f 5 - 9 4 0 e 4 0 5 c f e 7 c ' ,   ' 7 e c b f 5 b 2 - e 9 4 9 - 4 6 e f - a b e 9 - 7 3 d c d 5 1 a 5 f a 4 ' , 
 
           ' U E F A   C h a m p i o n s   L e a g u e   F i n a l   V i e w i n g ' ,   n o w ( )   +   i n t e r v a l   ' 2 3   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 2 3   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   2 4 8 5 7 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 5 1   d a y s ' ) , 
 
         ( ' 7 1 b a e a 7 a - e 0 8 6 - 4 e 8 1 - 9 f c 5 - 0 b 2 3 d 4 1 c 1 a 8 e ' ,   ' f 1 5 2 2 a a 6 - a 2 3 a - 4 8 4 2 - 9 3 e 5 - 2 7 7 d 4 7 2 d 8 a 0 a ' , 
 
           ' T h e   L o r d   o f   t h e   R i n g s :   T h e   W a r   o f   t h e   R o h i r r i m ' ,   n o w ( )   +   i n t e r v a l   ' 6 0   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 6 0   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 0 0 4 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 6 7   d a y s ' ) , 
 
         ( ' c 0 3 3 c 1 e 3 - 9 9 8 5 - 4 9 2 e - b 7 b 8 - 1 e 0 8 b 7 2 5 0 b 9 0 ' ,   ' f 1 5 2 2 a a 6 - a 2 3 a - 4 8 4 2 - 9 3 e 5 - 2 7 7 d 4 7 2 d 8 a 0 a ' , 
 
           ' A v a t a r :   F i r e   a n d   A s h ' ,   n o w ( )   -   i n t e r v a l   ' 2 0   d a y s ' ,   n o w ( )   -   i n t e r v a l   ' 2 0   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   3 5 6 ,   f a l s e ,   n o w ( )   -   i n t e r v a l   ' 9 7   d a y s ' ) , 
 
         ( ' 9 0 a 1 d b f 2 - 2 4 5 5 - 4 a e 3 - a 6 e 7 - f 0 b c 1 7 4 e 1 c 1 4 ' ,   ' f 1 5 2 2 a a 6 - a 2 3 a - 4 8 4 2 - 9 3 e 5 - 2 7 7 d 4 7 2 d 8 a 0 a ' , 
 
           ' M i s s i o n :   I m p o s s i b l e   -   D e a d   R e c k o n i n g ' ,   n o w ( )   +   i n t e r v a l   ' 3 6   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 3 6   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 2 0 8 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 9 3   d a y s ' ) , 
 
         ( ' 8 4 2 6 0 5 8 3 - 3 d 5 f - 4 9 e 0 - b 3 6 e - 9 6 e 0 a e 6 c 1 1 1 4 ' ,   ' f 1 5 2 2 a a 6 - a 2 3 a - 4 8 4 2 - 9 3 e 5 - 2 7 7 d 4 7 2 d 8 a 0 a ' , 
 
           ' D e a d p o o l   &   W o l v e r i n e ' ,   n o w ( )   -   i n t e r v a l   ' 3 7   d a y s ' ,   n o w ( )   -   i n t e r v a l   ' 3 7   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   5 8 7 ,   f a l s e ,   n o w ( )   -   i n t e r v a l   ' 2 2   d a y s ' ) , 
 
         ( ' 2 f d 5 5 9 f 7 - 2 2 f 2 - 4 3 2 5 - b e b c - e 3 4 2 f 4 3 2 5 f 9 0 ' ,   ' 7 a f e 7 8 5 5 - f 5 f 0 - 4 e 1 5 - b 2 d d - e 9 4 c 8 2 2 b 8 3 a 3 ' , 
 
           ' W i c k e d :   T h e   U n t o l d   S t o r y ' ,   n o w ( )   +   i n t e r v a l   ' 1 0   d a y s ' ,   n o w ( )   +   i n t e r v a l   ' 1 0   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   7 1 9 9 ,   t r u e ,   n o w ( )   -   i n t e r v a l   ' 8 4   d a y s ' ) , 
 
         ( ' f e 8 b 9 9 e c - 6 c 7 a - 4 d 1 2 - 8 9 c 6 - 5 0 6 c 2 9 f f a d 1 6 ' ,   ' 0 1 4 e c 0 3 0 - f c f 0 - 4 d f 7 - 9 9 8 3 - b 4 8 0 e 7 1 4 6 9 d d ' , 
 
           ' U E F A   C h a m p i o n s   L e a g u e   F i n a l   V i e w i n g ' ,   n o w ( )   -   i n t e r v a l   ' 1 1   d a y s ' ,   n o w ( )   -   i n t e r v a l   ' 1 1   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 4 1 2 8 ,   f a l s e ,   n o w ( )   -   i n t e r v a l   ' 3 7   d a y s ' ) , 
 
         ( ' 8 5 e 1 2 8 f 6 - f b 3 0 - 4 0 7 0 - 9 4 9 e - 0 7 a 5 a f 6 5 a e 2 1 ' ,   ' 7 e c b f 5 b 2 - e 9 4 9 - 4 6 e f - a b e 9 - 7 3 d c d 5 1 a 5 f a 4 ' , 
 
           ' M e t a l l i c a :   M 7 2   W o r l d   T o u r ' ,   n o w ( )   -   i n t e r v a l   ' 2 0   d a y s ' ,   n o w ( )   -   i n t e r v a l   ' 2 0   d a y s '   +   i n t e r v a l   ' 3   h o u r s ' ,   1 7 9 1 0 ,   f a l s e ,   n o w ( )   -   i n t e r v a l   ' 7 7   d a y s ' ) 
 
 