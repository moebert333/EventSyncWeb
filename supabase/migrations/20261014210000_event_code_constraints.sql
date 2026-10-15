-- Event Code shape for the website. Run once in the Supabase SQL editor
-- after sql/CreateAllTables.sql. admin_allowlist already exists there.

alter table public.event_codes
  add constraint event_codes_code_key unique (code);

alter table public.event_codes
  add constraint event_codes_code_len
  check (char_length(code) between 6 and 12);
