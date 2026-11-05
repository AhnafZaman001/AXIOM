-- Daily account budget plus a cooldown, enforced atomically across workers.
create table if not exists public.reporting_assistant_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  day date not null,
  requests integer not null,
  last_request_at timestamptz not null
);

alter table public.reporting_assistant_usage enable row level security;
revoke all on public.reporting_assistant_usage from anon, authenticated;
grant select, insert, update on public.reporting_assistant_usage to service_role;

create or replace function public.claim_reporting_assistant_request(p_user_id uuid)
returns boolean
language sql
set search_path = ''
as $$
  with claimed as (
    insert into public.reporting_assistant_usage as usage (user_id, day, requests, last_request_at)
    values (p_user_id, (now() at time zone 'UTC')::date, 1, now())
    on conflict (user_id) do update
      set day = excluded.day,
          requests = case when usage.day = excluded.day then usage.requests + 1 else 1 end,
          last_request_at = excluded.last_request_at
      where (usage.day < excluded.day or usage.requests < 20)
        and usage.last_request_at <= excluded.last_request_at - interval '10 seconds'
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke all on function public.claim_reporting_assistant_request(uuid) from public, anon, authenticated;
grant execute on function public.claim_reporting_assistant_request(uuid) to service_role;
