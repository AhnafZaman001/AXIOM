-- =========================================================================
-- AXIOM — Messaging settings + delivery log (automatic WhatsApp to parents)
-- Run once in: Supabase Dashboard -> SQL Editor. Safe to re-run.
--
-- app_settings   key/value settings (admin phone number, test mode).
--                NOTE: the admin number is deliberately NOT in this file,
--                because this repository is public. Insert it yourself (see
--                SETUP.md "Automatic WhatsApp") — it never goes in the
--                parent_contacts table.
-- message_log    one row per message the server tried to send.
-- =========================================================================
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

drop policy if exists "app_settings: staff read" on public.app_settings;
create policy "app_settings: staff read" on public.app_settings
  for select using (public.current_profile_role() in ('principal','coordinator','hod'));

drop policy if exists "app_settings: principal/coordinator write" on public.app_settings;
create policy "app_settings: principal/coordinator write" on public.app_settings
  for all
  using      (public.current_profile_role() in ('principal','coordinator'))
  with check (public.current_profile_role() in ('principal','coordinator'));

create table if not exists public.message_log (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  sent_by      uuid,
  student_name text,
  label        text,
  recipient    text,           -- phone number the message went to
  kind         text not null,  -- 'parent' | 'admin_copy' | 'admin_test'
  status       text not null,  -- 'sent' | 'failed' | 'skipped'
  detail       text            -- WhatsApp message id or the error
);
alter table public.message_log enable row level security;

-- Read-only for staff; only the server function (service role) writes.
drop policy if exists "message_log: staff read" on public.message_log;
create policy "message_log: staff read" on public.message_log
  for select using (public.current_profile_role() in ('principal','coordinator','hod'));

-- Defaults: TEST MODE ON (messages go only to the admin number until you flip it).
insert into public.app_settings (key, value) values ('wa_test_mode', 'on')
on conflict (key) do nothing;
