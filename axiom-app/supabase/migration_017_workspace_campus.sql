begin;

-- Resolve the two campuses from their existing login assignments.
create table public.workspace_campus_kinds (
  campus text primary key,
  kind text not null unique check (kind in ('academy', 'college'))
);
alter table public.workspace_campus_kinds enable row level security;
revoke all on public.workspace_campus_kinds from anon, authenticated;

insert into public.workspace_campus_kinds (campus, kind)
select p.campus, case split_part(lower(u.email), '@', 1)
  when 'kipsacademy01' then 'academy' else 'college' end
from public.profiles p join auth.users u on u.id = p.id
where split_part(lower(u.email), '@', 1) in ('kipsacademy01', 'kipsclg01')
  and nullif(btrim(p.campus), '') is not null;

do $$
begin
  if (select count(*) from public.workspace_campus_kinds) <> 2 then
    raise exception 'Verify the two existing campus login assignments before migrating workspace data';
  end if;
end $$;

create function public.workspace_campus_kind()
returns text language sql stable security definer set search_path = ''
as $$
  select kind from public.workspace_campus_kinds where campus = public.current_campus()
$$;
revoke all on function public.workspace_campus_kind() from public, anon;
grant execute on function public.workspace_campus_kind() to authenticated;

alter table public.sections add column if not exists campus text;
alter table public.sections alter column campus set default public.current_campus();

-- Use the supplied section names, ignoring punctuation and display-only stream labels.
update public.sections s
set campus = c.campus
from public.workspace_campus_kinds c
where c.kind = case when regexp_replace(lower(coalesce(nullif(s.sheet_name, ''), split_part(s.label, '—', 1))), '[^a-z0-9]', '', 'g') in (
  '9th1staprilboys','9thboardresultbio','9thboardresultcomp',
  'syboardresultpm','syboardresultpe','syboardresultics',
  'fyboardresultpm','fyboardresultpe','fyboardresultics',
  '10thboardresultbio','10thboardresultcomp',
  'fyboardresultpmpv2025','fyboardresultpepv2025','fyboardresulticspv2025'
) then 'academy' else 'college' end;

alter table public.sections alter column campus set not null;
create index if not exists sections_campus_idx on public.sections(campus);

-- Preserve mismatched assignments before clearing them. Keep the assignment
-- row so a cleared teacher cannot reappear through a built-in roster fallback.
create table public.workspace_teacher_assignment_archive (
  assignment_id uuid primary key,
  assignment jsonb not null
);
alter table public.workspace_teacher_assignment_archive enable row level security;
revoke all on public.workspace_teacher_assignment_archive from anon, authenticated;

insert into public.workspace_teacher_assignment_archive
select a.id, to_jsonb(a)
from public.teacher_assignments a
join public.sections s on s.key = a.section_key
join public.workspace_campus_kinds c on c.campus = s.campus
where btrim(a.teacher_name) <> ''
  and (c.kind = 'academy') <> (
    regexp_replace(lower(regexp_replace(btrim(a.teacher_name), '^(professor|prof|p)\.?\s+', '', 'i')), '[^a-z0-9]', '', 'g') in (
      'abdulkhaliq','ayesha','drjaved','huzaifawarraich','mukarramhusnainacadmy',
      'mukarramhusnainacademy','nayyarsulatan','nayyarsultan','tanveerjazib','waqasgull','waseemcomp'
    )
  );

update public.teacher_assignments
set teacher_name = '', user_id = null
where id in (select assignment_id from public.workspace_teacher_assignment_archive);

-- Security-definer lookups avoid recursive policy checks across these tables.
create function public.workspace_owns_section(section_id text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sections s where s.key = section_id and s.campus = public.current_campus()
  )
$$;
create function public.workspace_owns_student(student_uuid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.students s where s.id = student_uuid and public.workspace_owns_section(s.section_key)
  )
$$;
revoke all on function public.workspace_owns_section(text), public.workspace_owns_student(uuid) from public, anon;
grant execute on function public.workspace_owns_section(text), public.workspace_owns_student(uuid) to authenticated;

create policy workspace_campus on public.sections as restrictive for all to authenticated
  using (campus = public.current_campus()) with check (campus = public.current_campus());
create policy workspace_campus on public.teacher_assignments as restrictive for all to authenticated
  using (public.workspace_owns_section(section_key)) with check (public.workspace_owns_section(section_key));
create policy workspace_campus on public.section_subject_overrides as restrictive for all to authenticated
  using (public.workspace_owns_section(section_key)) with check (public.workspace_owns_section(section_key));
create policy workspace_campus on public.students as restrictive for all to authenticated
  using (public.workspace_owns_section(section_key)) with check (public.workspace_owns_section(section_key));
create policy workspace_campus on public.tests as restrictive for all to authenticated
  using (public.workspace_owns_student(student_id)) with check (public.workspace_owns_student(student_id));
create policy workspace_campus on public.parent_contacts as restrictive for all to authenticated
  using (public.workspace_owns_section(section_key)) with check (public.workspace_owns_section(section_key));

commit;
