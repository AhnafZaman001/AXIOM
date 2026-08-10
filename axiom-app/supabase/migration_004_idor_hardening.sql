-- =========================================================================
-- IDOR / broken-access-control hardening
-- Run this whole file in: Supabase Dashboard -> SQL Editor -> New query
-- Safe to re-run.
-- =========================================================================

-- ---------- 1. roster-files bucket: students should NOT be able to read
-- master roster files (they contain other students' data, not just theirs).
-- Previously: any authenticated user (including students) could list/download.
-- Now: only staff roles.
drop policy if exists "roster-files: read for any logged-in user" on storage.objects;
drop policy if exists "roster-files: read for staff only" on storage.objects;
create policy "roster-files: read for staff only"
  on storage.objects for select
  using (
    bucket_id = 'roster-files'
    and exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('principal','coordinator','hod','teacher')
    )
  );

-- ---------- 2. tests: make the UPDATE check explicit (defense-in-depth).
-- Without an explicit WITH CHECK, Postgres reuses USING for both — which
-- already prevented this — but spelling it out means a teacher can never
-- retarget an existing test row (student_id/subject) to jump outside their
-- assigned section+subject, even if the USING clause is ever changed later.
drop policy if exists "tests: teacher updates only their own assigned section+subject" on tests;
create policy "tests: teacher updates only their own assigned section+subject"
  on tests for update
  using (
    exists (
      select 1 from teacher_assignments ta
      join students s on s.id = tests.student_id
      where ta.user_id = auth.uid() and ta.section_key = s.section_key and ta.subject = tests.subject
    )
  )
  with check (
    exists (
      select 1 from teacher_assignments ta
      join students s on s.id = tests.student_id
      where ta.user_id = auth.uid() and ta.section_key = s.section_key and ta.subject = tests.subject
    )
  );

-- =========================================================================
-- Done. Re-run this file any time; it's idempotent.
-- =========================================================================
