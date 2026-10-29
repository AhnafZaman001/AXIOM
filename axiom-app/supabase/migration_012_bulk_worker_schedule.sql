-- Enable the hosted queue worker. Add the Vault secret as described in SETUP.md.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule('axiom-message-worker', '* * * * *', $schedule$
  select net.http_post(
    url := 'https://adqvtmnvyzkusswbwqdr.supabase.co/functions/v1/send-parent-message',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-messaging-secret',(select decrypted_secret from vault.decrypted_secrets where name='axiom_messaging_worker_secret' limit 1)),
    body := '{"action":"process"}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists(select 1 from public.message_jobs where status='queued' or (status='sending' and updated_at < now()-interval '5 minutes'))
    and exists(select 1 from vault.decrypted_secrets where name='axiom_messaging_worker_secret');
$schedule$);
