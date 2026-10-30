-- Durable WhatsApp batches. Run after migration 010.
create table public.message_batches (
  id uuid primary key,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  title text not null,
  test_mode boolean not null,
  total integer not null check (total > 0 and total <= 2000)
);
create table public.message_jobs (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.message_batches(id) on delete cascade,
  label text not null,
  student_name text,
  recipient text not null,
  kind text not null check (kind in ('parent', 'admin_copy', 'admin_test')),
  body text not null,
  status text not null default 'queued' check (status in ('queued','sending','accepted','failed','uncertain')),
  detail text,
  updated_at timestamptz not null default now()
);
create index message_jobs_queue on public.message_jobs(status, id);
create index message_jobs_batch on public.message_jobs(batch_id);
create index message_jobs_recipient on public.message_jobs(recipient, updated_at);
alter table public.message_batches enable row level security;
alter table public.message_jobs enable row level security;
create policy "administrators read batches" on public.message_batches for select to authenticated
  using (public.current_profile_role() in ('principal','coordinator'));
create policy "administrators read jobs" on public.message_jobs for select to authenticated
  using (public.current_profile_role() in ('principal','coordinator'));
grant select on public.message_batches, public.message_jobs to authenticated;
grant all on public.message_batches, public.message_jobs to service_role;
grant usage, select on sequence public.message_jobs_id_seq to service_role;

-- One transaction: an idempotency key cannot leave a partially-created batch.
create or replace function public.enqueue_message_batch(batch uuid, actor uuid, title text, testing boolean, jobs jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if jsonb_array_length(jobs) < 1 or jsonb_array_length(jobs) > 2000 then
    raise exception 'Invalid batch size';
  end if;
  insert into public.message_batches(id, created_by, title, test_mode, total)
    values(batch, actor, title, testing, jsonb_array_length(jobs)) on conflict(id) do nothing;
  if found then
    insert into public.message_jobs(batch_id,label,student_name,recipient,kind,body)
    select batch,j->>'label',j->>'student_name',j->>'recipient',j->>'kind',j->>'body'
    from jsonb_array_elements(jobs) j;
  elsif not exists(select 1 from public.message_batches where id=batch and created_by=actor) then
    raise exception 'Batch belongs to another user';
  end if;
  return batch;
end;
$$;

-- Concurrent workers claim different jobs. Ambiguous interrupted sends are never retried automatically.
create or replace function public.claim_message_job()
returns setof public.message_jobs language plpgsql security definer set search_path = public as $$
begin
  -- Serialize this short claim transaction so concurrent workers cannot reserve
  -- different messages for the same phone simultaneously.
  perform pg_advisory_xact_lock(8112026);
  update public.message_jobs set status='uncertain', detail='Worker interrupted; confirm delivery before creating a replacement batch.', updated_at=now()
    where status='sending' and updated_at < now() - interval '5 minutes';
  return query
    update public.message_jobs set status='sending', updated_at=now()
    where id=(select j.id from public.message_jobs j where j.status='queued'
      and not exists(select 1 from public.message_jobs prior where prior.recipient=j.recipient
        and (prior.status='sending' or (prior.status<>'queued' and prior.updated_at > now()-interval '7 seconds')))
      order by j.id for update skip locked limit 1)
    returning *;
end;
$$;
revoke all on function public.enqueue_message_batch(uuid,uuid,text,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.claim_message_job() from public, anon, authenticated;
grant execute on function public.enqueue_message_batch(uuid,uuid,text,boolean,jsonb) to service_role;
grant execute on function public.claim_message_job() to service_role;
