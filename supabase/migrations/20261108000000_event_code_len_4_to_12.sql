-- Allow Event Codes as short as 4 characters (was 6–12).

alter table public.event_codes
  drop constraint if exists event_codes_code_len;

alter table public.event_codes
  add constraint event_codes_code_len
  check (char_length(code) between 4 and 12);
