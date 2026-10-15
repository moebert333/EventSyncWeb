-- Optional local demo. Run by hand in the SQL editor on an empty project.
-- Replace the allowlist email with a real organizer address before signing in.
-- Does not create an auth user. Allowlist rows are not a public signup form.

insert into public.organizations (organization_id, name, description, org_key, claim_code)
values (9001, 'Demo Motocross', 'Seed organization for EventSync', 'eventsync-demo', 'CLAIMDEMO');

insert into public.series (series_id, organization_id, name, description)
values (9001, 9001, 'Demo Series', 'Outdoor demo series');

insert into public.events (event_id, series_id, name, description, date, track, location)
values
  (9001, 9001, 'Spring Classic', 'Completed demo event', '2026-04-12', 'Town Track', 'Austin, TX'),
  (9002, 9001, 'Saturday National', 'Live demo event', '2026-10-18', 'Ridge MX', 'Austin, TX');

insert into public.event_codes (event_id, code)
values (9002, 'DEMO01AB');

insert into public.classes (class_id, event_id, class_name)
values
  (9001, 9002, '250 Expert'),
  (9002, 9002, '450 Expert'),
  (9003, 9001, '250 Expert');

insert into public.races (race_id, event_id, race_name, race_num, session_name, race_date, race_start, active, completed)
values
  (9001, 9002, 'Moto 1', 1, 'Moto', '2026-10-18', '13:00', true, false),
  (9002, 9001, 'Moto 1', 1, 'Moto', '2026-04-12', '11:00', false, true);

insert into public.race_class (class_id, race_id)
values (9001, 9001), (9002, 9001);

insert into public.status (race_id, status, laps_to_go)
values (9001, 'Active', 5);

insert into public.participants (participant_id, organization_id, first_name, last_name, participant_plate)
values
  (9001, 9001, 'Alex', 'Rivera', '14'),
  (9002, 9001, 'Jordan', 'Cole', '27'),
  (9003, 9001, 'Sam', 'Nguyen', '562');

insert into public.event_entry (event_id, class_id, participant_id, participant_plate, make)
values
  (9002, 9001, 9001, '14', 'Yamaha'),
  (9002, 9001, 9002, '27', 'Honda'),
  (9001, 9003, 9003, '562', 'KTM');

insert into public.active_timing (
  race_id, class_id, participant_id, current_lap_num, status, place_num, participant_plate,
  current_lap_time, best_lap_num, best_lap_time, race_elapsed_time, leader_gap_time, next_gap_time
)
values
  (9001, 9001, 9001, 4, 'valid', 1, '14', '00:01:42.30', 3, '00:01:40.10', '00:12:30', '00:00:00', '00:00:00'),
  (9001, 9001, 9002, 4, 'valid', 2, '27', '00:01:44.05', 2, '00:01:41.80', '00:12:32.10', '00:00:02.10', '00:00:02.10');

insert into public.event_results (
  event_id, class_id, participant_id, make, participant_plate, overall_position, overall_points, race1_finish, race2_finish
)
values (9001, 9003, 9003, 'KTM', '562', 1, 50, 1, 2);

insert into public.admin_allowlist (email, organization_id, is_active)
values ('admin@example.com', 9001, true);

select setval(pg_get_serial_sequence('public.organizations', 'organization_id'), greatest(9001, (select max(organization_id) from public.organizations)));
select setval(pg_get_serial_sequence('public.series', 'series_id'), greatest(9001, (select max(series_id) from public.series)));
select setval(pg_get_serial_sequence('public.events', 'event_id'), greatest(9002, (select max(event_id) from public.events)));
select setval(pg_get_serial_sequence('public.classes', 'class_id'), greatest(9003, (select max(class_id) from public.classes)));
select setval(pg_get_serial_sequence('public.races', 'race_id'), greatest(9002, (select max(race_id) from public.races)));
