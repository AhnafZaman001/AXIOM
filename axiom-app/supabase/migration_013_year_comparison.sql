-- =========================================================================
-- AXIOM — Year Comparison (saved yearly result datasets)
-- Run once in: Supabase Dashboard -> SQL Editor -> New query. Safe to re-run.
-- Needs schema.sql / migration_005 first (uses public.current_profile_role()
-- and public.set_updated_at()).
--
-- One row = one year's results, read from an Excel workbook in the browser.
-- It holds ANONYMOUS results only: stream, subject maximum marks, and each
-- student's mark or status per subject under a made-up record id (r1, r2...).
-- Student names and roll numbers are never sent to this table.
--
--   streams : [{ key, label, subjects: [{ key, name, max }] }]
--   records : [{ i: "r1", st: "<stream key>",
--                c: [["s", 56.5], ["m", null], ...] }]   one cell per subject
--             cell status: s scored, a absent, n not applicable,
--                          m missing (blank), p partial paper, i invalid
--
-- Who can do what (enforced by the database, not just the screen):
--   principal / coordinator : read, add, replace and delete years
--   hod                     : read
--   teacher / student       : no access
-- This table is separate from the live students/tests data and does not
-- fire the email-alert triggers from migration_007.
-- =========================================================================
create table if not exists public.year_datasets (
  id            uuid primary key default gen_random_uuid(),
  label         text not null check (length(btrim(label)) > 0),
  assessment    text not null default '',
  grade_level   text not null default '',
  source_file   text,
  import_report jsonb not null default '{}'::jsonb,
  streams       jsonb not null,
  records       jsonb not null,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (label, assessment, grade_level),
  check (jsonb_typeof(streams) = 'array'),
  check (jsonb_typeof(records) = 'array' and jsonb_array_length(records) <= 20000)
);

drop trigger if exists year_datasets_set_updated_at on public.year_datasets;
create trigger year_datasets_set_updated_at
  before update on public.year_datasets
  for each row execute function public.set_updated_at();

alter table public.year_datasets enable row level security;

revoke all on public.year_datasets from anon;
grant select, insert, update, delete on public.year_datasets to authenticated;

drop policy if exists "year_datasets: staff read" on public.year_datasets;
create policy "year_datasets: staff read" on public.year_datasets
  for select using (public.current_profile_role() in ('principal','coordinator','hod'));

drop policy if exists "year_datasets: principal/coordinator write" on public.year_datasets;
create policy "year_datasets: principal/coordinator write" on public.year_datasets
  for all
  using      (public.current_profile_role() in ('principal','coordinator'))
  with check (public.current_profile_role() in ('principal','coordinator'));
