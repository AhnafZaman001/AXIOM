begin;

alter table public.year_datasets add column if not exists campus text;
alter table public.year_datasets alter column campus set default public.current_campus();

-- Before running this migration on existing data, set the verified mapping
-- in this transaction with: set local axiom.year_campus_backfill = '{"year-uuid":"campus"}';
-- Unassigned rows remain intact and are hidden until an administrator assigns them.
update public.year_datasets as y
set campus = mapping.value
from jsonb_each_text(coalesce(nullif(current_setting('axiom.year_campus_backfill', true), ''), '{}')::jsonb) as mapping
where y.id = mapping.key::uuid and y.campus is null;

create unique index if not exists year_datasets_campus_identity
  on public.year_datasets (campus, label, assessment, grade_level);
alter table public.year_datasets drop constraint if exists year_datasets_label_assessment_grade_level_key;

-- Keep existing workbook paths and scope them independently of the uploader or
-- dataset lifecycle. The migration does not move or rewrite Storage objects.
create table if not exists public.year_workbook_legacy_campuses (
  path text primary key,
  campus text not null
);
alter table public.year_workbook_legacy_campuses enable row level security;
revoke all on public.year_workbook_legacy_campuses from public, anon, authenticated;

insert into public.year_workbook_legacy_campuses (path, campus)
select source_path, min(campus)
from public.year_datasets
where source_path is not null and campus is not null
  and cardinality(string_to_array(source_path, '/')) = 2
group by source_path
having count(distinct campus) = 1
on conflict (path) do nothing;

create or replace function public.year_workbook_in_current_campus(workbook_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    split_part(workbook_path, '/', 1) = 'workbooks' and
    case cardinality(string_to_array(workbook_path, '/'))
      when 3 then split_part(workbook_path, '/', 2) = public.current_campus()
      when 2 then exists (
        select 1 from public.year_workbook_legacy_campuses
        where path = workbook_path and campus = public.current_campus()
      )
      else false
    end, false
  );
$$;
revoke all on function public.year_workbook_in_current_campus(text) from public, anon;
grant execute on function public.year_workbook_in_current_campus(text) to authenticated;

drop policy if exists "year datasets campus isolation" on public.year_datasets;
create policy "year datasets campus isolation" on public.year_datasets
  as restrictive for all to authenticated
  using (campus = public.current_campus())
  with check (campus = public.current_campus()
    and (source_path is null or public.year_workbook_in_current_campus(source_path)));

drop policy if exists "year workbooks campus isolation" on storage.objects;
create policy "year workbooks campus isolation" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'year-result-files' or public.year_workbook_in_current_campus(name))
  with check (bucket_id <> 'year-result-files' or (
    cardinality(string_to_array(name, '/')) = 3 and public.year_workbook_in_current_campus(name)
  ));

notify pgrst, 'reload schema';
commit;
