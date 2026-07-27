-- =========================================================================
-- AXIOM / Ledgerline — Supabase schema (fixed table/policy ordering)
-- Run this whole file in: Supabase Dashboard -> SQL Editor -> New query
-- If you already ran the old version and got the "teacher_assignments
-- does not exist" error, it's safe to just run this whole file again —
-- it starts by dropping anything that got partially created.
-- =========================================================================

-- ---------- 0. Clean slate (safe even on a fresh project) ----------
drop table if exists tests, teacher_assignments, students, sections, profiles cascade;
drop type if exists user_role cascade;

-- ---------- 1. ROLE ENUM ----------
create type user_role as enum ('principal', 'coordinator', 'hod', 'teacher', 'student');

-- =========================================================================
-- PART A — CREATE ALL TABLES FIRST (no cross-table policies yet)
-- =========================================================================

-- ---------- 2. PROFILES ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null,
  teacher_name text,        -- only used when role = 'teacher' (must match teacher_assignments.teacher_name)
  student_id uuid,          -- only used when role = 'student' (links to students.id)
  created_at timestamptz default now()
);

-- ---------- 3. SECTIONS ----------
create table sections (
  key text primary key,       -- matches the app's sectionKey, e.g. "9A"
  label text not null,        -- full display label, e.g. "F1A — Pre-Medical"
  sheet_name text,            -- just the section name part, e.g. "F1A" (matches workbook sheet names)
  subject_group text          -- one of PM / PE / ICS / ICOM — picks the subject list on other devices
);

-- ---------- 4. STUDENTS ----------
create table students (
  id uuid primary key default gen_random_uuid(),
  section_key text not null references sections(key) on delete cascade,
  name text not null,
  roll_no text,
  matric text,
  user_id uuid references auth.users(id) on delete set null, -- null until the student is given a login
  created_at timestamptz default now()
);

-- ---------- 5. TEACHER ASSIGNMENTS ----------
create table teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  section_key text not null references sections(key) on delete cascade,
  subject text not null,
  teacher_name text not null,
  user_id uuid references auth.users(id) on delete set null, -- null until that teacher has a login
  unique (section_key, subject)
);

-- ---------- 6. TESTS (the actual scores) ----------
create table tests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  subject text not null,
  test_name text not null,
  test_date date,
  obtained numeric,
  max_marks numeric,
  absent boolean default false,
  position integer,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- 7. Keep updated_at fresh ----------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tests_set_updated_at
  before update on tests
  for each row execute function set_updated_at();

-- =========================================================================
-- PART B — ENABLE ROW LEVEL SECURITY + POLICIES (all tables now exist)
-- =========================================================================

alter table profiles enable row level security;
alter table sections enable row level security;
alter table students enable row level security;
alter table teacher_assignments enable row level security;
alter table tests enable row level security;

-- ---- profiles ----
create policy "profiles: user can read own row"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles: privileged roles can read all"
  on profiles for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('principal','coordinator','hod'))
  );

-- ---- sections ----
create policy "sections: everyone logged in can read"
  on sections for select using (auth.uid() is not null);
create policy "sections: principal/coordinator can write"
  on sections for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('principal','coordinator'))
  );

-- ---- students ----
create policy "students: privileged roles read all"
  on students for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('principal','coordinator','hod'))
  );

create policy "students: teacher reads students in their assigned sections"
  on students for select using (
    exists (
      select 1 from teacher_assignments ta
      where ta.user_id = auth.uid() and ta.section_key = students.section_key
    )
  );

create policy "students: student reads own row only"
  on students for select using (user_id = auth.uid());

create policy "students: principal/coordinator write"
  on students for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('principal','coordinator'))
  );

-- ---- teacher_assignments ----
create policy "assignments: everyone logged in can read"
  on teacher_assignments for select using (auth.uid() is not null);

create policy "assignments: principal/coordinator write"
  on teacher_assignments for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('principal','coordinator'))
  );

-- ---- tests ----
create policy "tests: privileged roles read all"
  on tests for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('principal','coordinator','hod'))
  );

create policy "tests: teacher reads tests for their assigned section+subject"
  on tests for select using (
    exists (
      select 1 from teacher_assignments ta
      join students s on s.id = tests.student_id
      where ta.user_id = auth.uid()
        and ta.section_key = s.section_key
        and ta.subject = tests.subject
    )
  );

create policy "tests: student reads own tests only"
  on tests for select using (
    exists (select 1 from students s where s.id = tests.student_id and s.user_id = auth.uid())
  );

create policy "tests: teacher writes only their own assigned section+subject"
  on tests for insert with check (
    exists (
      select 1 from teacher_assignments ta
      join students s on s.id = tests.student_id
      where ta.user_id = auth.uid() and ta.section_key = s.section_key and ta.subject = tests.subject
    )
  );

create policy "tests: teacher updates only their own assigned section+subject"
  on tests for update using (
    exists (
      select 1 from teacher_assignments ta
      join students s on s.id = tests.student_id
      where ta.user_id = auth.uid() and ta.section_key = s.section_key and ta.subject = tests.subject
    )
  );

create policy "tests: teacher deletes only their own assigned section+subject"
  on tests for delete using (
    exists (
      select 1 from teacher_assignments ta
      join students s on s.id = tests.student_id
      where ta.user_id = auth.uid() and ta.section_key = s.section_key and ta.subject = tests.subject
    )
  );

create policy "tests: principal/coordinator full write"
  on tests for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('principal','coordinator'))
  );

-- =========================================================================
-- Done. Next: Authentication -> Providers -> make sure Email is enabled,
-- then create your first user (yourself, as principal) — see SETUP.md.
-- =========================================================================
