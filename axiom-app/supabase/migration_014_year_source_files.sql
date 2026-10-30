-- Original year workbooks are private and separate from roster-files.
-- Run after migration 013. Existing anonymous snapshots remain intact.
alter table public.year_datasets add column if not exists source_path text;
alter table public.year_datasets add column if not exists source_size bigint;
alter table public.year_datasets add column if not exists source_uploaded_at timestamptz;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('year-result-files','year-result-files',false,6291456,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "year files staff read" on storage.objects;
create policy "year files staff read" on storage.objects for select to authenticated
using(bucket_id='year-result-files' and public.current_profile_role() in ('principal','coordinator','hod'));

drop policy if exists "year files administrators insert" on storage.objects;
create policy "year files administrators insert" on storage.objects for insert to authenticated
with check(bucket_id='year-result-files' and public.current_profile_role() in ('principal','coordinator')
  and (storage.foldername(name))[1]='workbooks' and lower(storage.extension(name)) in ('xls','xlsx'));

-- Files are immutable; replacement uploads use a new UUID, then switch the
-- dataset reference before removing the previous object. No UPDATE policy.
drop policy if exists "year files administrators delete" on storage.objects;
create policy "year files administrators delete" on storage.objects for delete to authenticated
using(bucket_id='year-result-files' and public.current_profile_role() in ('principal','coordinator'));
