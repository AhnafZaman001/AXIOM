-- =========================================================
-- migration_005_fix_profiles_rls_recursion.sql
--
-- URGENT -- fixes a live infinite-recursion bug (Postgres error
-- 42P17), not the subject-override feature (see migration_006 for
-- that). Recommend running this one first.
--
-- Root cause: "profiles: privileged roles can read all" queries the
-- profiles table FROM WITHIN a policy defined ON profiles itself:
--
--   using (exists (select 1 from profiles p where p.id = auth.uid()
--                  and p.role in ('principal','coordinator','hod')))
--
-- Every time Postgres evaluates that policy, it has to run a query
-- against profiles -- which triggers RLS evaluation on profiles
-- again -- which runs the same policy again -- infinitely. Postgres
-- detects this and refuses with error 42P17 ("infinite recursion
-- detected in policy for relation \"profiles\""), surfaced by
-- Supabase's API layer as a plain 500. This happens even for a
-- simple own-row query, since Postgres plans all applicable SELECT
-- policies on a table together -- it doesn't skip evaluating a
-- problematic policy just because a different, simpler policy would
-- have been sufficient on its own.
--
-- This is NOT limited to profiles. The exact same inline pattern
-- (`exists (select 1 from profiles p where p.id = auth.uid() and
-- p.role in (...))`) is repeated in 6 more policies, on sections,
-- students (x2), teacher_assignments, and tests (x2). Every one of
-- those ALSO queries profiles internally, which ALSO hits the
-- recursive policy above -- meaning privileged-role (principal/
-- coordinator/hod) access is broken across every one of those
-- tables too, not just login/profile screens.
--
-- Fix: move the role lookup into a SECURITY DEFINER function. A
-- function like this runs with the privileges of whoever created
-- it, not the calling user's RLS-restricted context, so its
-- internal query to profiles does NOT re-trigger the RLS policy
-- chain -- breaking the recursion entirely for every one of the 7
-- affected policies at once.
-- =========================================================

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from profiles where id = auth.uid();
$$;

grant execute on function public.current_profile_role() to authenticated;

-- ---- profiles ---- (the actual self-referential one)
drop policy if exists "profiles: privileged roles can read all" on profiles;
create policy "profiles: privileged roles can read all"
  on profiles for select
  using (public.current_profile_role() in ('principal','coordinator','hod'));

-- ---- sections ----
drop policy if exists "sections: principal/coordinator can write" on sections;
create policy "sections: principal/coordinator can write"
  on sections for all using (
    public.current_profile_role() in ('principal','coordinator')
  );

-- ---- students ----
drop policy if exists "students: privileged roles read all" on students;
create policy "students: privileged roles read all"
  on students for select using (
    public.current_profile_role() in ('principal','coordinator','hod')
  );

drop policy if exists "students: principal/coordinator write" on students;
create policy "students: principal/coordinator write"
  on students for all using (
    public.current_profile_role() in ('principal','coordinator')
  );

-- ---- teacher_assignments ----
drop policy if exists "assignments: principal/coordinator write" on teacher_assignments;
create policy "assignments: principal/coordinator write"
  on teacher_assignments for all using (
    public.current_profile_role() in ('principal','coordinator')
  );

-- ---- tests ----
drop policy if exists "tests: privileged roles read all" on tests;
create policy "tests: privileged roles read all"
  on tests for select using (
    public.current_profile_role() in ('principal','coordinator','hod')
  );

drop policy if exists "tests: principal/coordinator full write" on tests;
create policy "tests: principal/coordinator full write"
  on tests for all using (
    public.current_profile_role() in ('principal','coordinator')
  );

-- Policies NOT touched (correctly don't reference profiles at all,
-- so were never part of this bug):
--   "profiles: user can read own row" (auth.uid() = id)
--   "sections/assignments: everyone logged in can read" (auth.uid() is not null)
--   "students/tests: teacher reads ... their assigned section" (joins teacher_assignments, not profiles)
--   "students: student reads own row only" / "tests: student reads own tests only"
--   "tests: teacher writes/updates/deletes only their own assigned section+subject"
