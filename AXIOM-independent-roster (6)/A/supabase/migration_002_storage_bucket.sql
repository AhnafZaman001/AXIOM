-- =========================================================================
-- AXIOM / Ledgerline — Storage bucket for "Import from Cloud"
-- Run this whole file in: Supabase Dashboard -> SQL Editor -> New query
-- Safe to re-run: bucket insert uses ON CONFLICT DO NOTHING, and policies
-- are dropped and recreated so re-running won't error with "already exists".
-- =========================================================================

-- ---------- 1. Create the bucket (private — not publicly downloadable) ----------
insert into storage.buckets (id, name, public)
values ('roster-files', 'roster-files', false)
on conflict (id) do nothing;

-- ---------- 2. Who can READ (download/list) files in this bucket ----------
-- Anyone logged into the app (any role) can see and download files here,
-- since any teacher/coordinator/HOD may need to run an import.
drop policy if exists "roster-files: read for any logged-in user" on storage.objects;
create policy "roster-files: read for any logged-in user"
  on storage.objects for select
  using ( bucket_id = 'roster-files' and auth.uid() is not null );

-- ---------- 3. Who can UPLOAD new files ----------
-- Only principal/coordinator can add master files — matches the same
-- permission level used for sections/students writes elsewhere in this app.
drop policy if exists "roster-files: upload for principal/coordinator" on storage.objects;
create policy "roster-files: upload for principal/coordinator"
  on storage.objects for insert
  with check (
    bucket_id = 'roster-files'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('principal','coordinator'))
  );

-- ---------- 4. Who can REPLACE an existing file (re-upload same name) ----------
drop policy if exists "roster-files: update for principal/coordinator" on storage.objects;
create policy "roster-files: update for principal/coordinator"
  on storage.objects for update
  using (
    bucket_id = 'roster-files'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('principal','coordinator'))
  );

-- ---------- 5. Who can DELETE files ----------
drop policy if exists "roster-files: delete for principal/coordinator" on storage.objects;
create policy "roster-files: delete for principal/coordinator"
  on storage.objects for delete
  using (
    bucket_id = 'roster-files'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('principal','coordinator'))
  );

-- =========================================================================
-- Done. After running this, go to: Supabase Dashboard -> Storage
-- You should see a new "roster-files" bucket (it will be empty until
-- someone uploads a file from the app's "Upload Master File to Cloud"
-- button, or you upload one manually here in the dashboard).
-- =========================================================================
