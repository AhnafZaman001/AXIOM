-- =========================================================================
-- AXIOM — Parent contacts (for report cards / "Message Parent")
-- Run once in: Supabase Dashboard -> SQL Editor -> New query. Safe to re-run.
--
-- Students in AXIOM are identified across Excel imports by Roll No. (or by
-- name when there is no roll number), so contacts are keyed the same way:
--   student_key = trimmed roll no., else the lower-cased student name.
-- Who can do what (enforced by the database, not just the UI):
--   principal / coordinator : read + write every contact
--   hod                     : read every contact
--   teacher                 : read contacts of sections they are assigned to
--   student                 : no access at all
-- =========================================================================
create table if not exists public.parent_contacts (
  section_key  text not null references public.sections(key) on delete cascade,
  student_key  text not null,
  student_name text,
  parent_name  text,
  phone        text,
  email        text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid default auth.uid(),
  primary key (section_key, student_key)
);

alter table public.parent_contacts enable row level security;

drop policy if exists "parent_contacts: staff read" on public.parent_contacts;
create policy "parent_contacts: staff read" on public.parent_contacts
  for select using (
    public.current_profile_role() in ('principal','coordinator','hod')
    or exists (
      select 1 from public.teacher_assignments ta
      where ta.user_id = auth.uid() and ta.section_key = parent_contacts.section_key
    )
  );

drop policy if exists "parent_contacts: principal/coordinator write" on public.parent_contacts;
create policy "parent_contacts: principal/coordinator write" on public.parent_contacts
  for all
  using      (public.current_profile_role() in ('principal','coordinator'))
  with check (public.current_profile_role() in ('principal','coordinator'));
