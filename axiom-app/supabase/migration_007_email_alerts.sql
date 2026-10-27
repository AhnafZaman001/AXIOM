-- =========================================================================
-- AXIOM — Email alerts for critical database changes
-- Run once in: Supabase Dashboard -> SQL Editor -> New query.
-- Safe to re-run. Read SETUP.md ("Email alerts") first: the Edge Function must
-- be deployed and the two config rows at the bottom must be filled in.
--
-- Critical (alerts):  sections added / renamed / removed, students REMOVED,
--   teacher assignments changed, section subject lists changed, user roles
--   changed or profiles removed, and bulk deletes of test scores (10+ at once).
-- NOT alerts:         adding students, entering / editing individual marks.
-- Cascades don't spam: removing a section sends ONE email, not one per
-- student/test that disappeared with it.
-- =========================================================================

create extension if not exists pg_net with schema extensions;

-- Private config (RLS on + no policies = unreadable through the API).
create table if not exists public.alert_config (key text primary key, value text not null);
alter table public.alert_config enable row level security;
revoke all on public.alert_config from anon, authenticated;

create or replace function public.ax_send_alert(p_event text, p_summary text, p_details jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_secret text; v_actor text;
begin
  select value into v_url    from public.alert_config where key = 'function_url';
  select value into v_secret from public.alert_config where key = 'webhook_secret';
  if v_url is null or v_secret is null then return; end if;
  begin
    select email into v_actor from auth.users where id = auth.uid();
  exception when others then v_actor := null; end;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-alert-secret', v_secret),
    body := jsonb_build_object('type','db_change','event',p_event,'summary',p_summary,'actor',v_actor,'details',p_details),
    timeout_milliseconds := 5000);
exception when others then
  null;  -- an alert problem must never block the real change
end $$;
revoke all on function public.ax_send_alert(text,text,jsonb) from public, anon, authenticated;

-- ---------- sections ----------
create or replace function public.ax_alert_sections_ins() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; l text;
begin
  select count(*), string_agg(label || ' [' || key || ']', ', ') into n, l from new_rows;
  if n > 0 then perform public.ax_send_alert('Section added', n || ' section(s): ' || l, jsonb_build_object('sections', l)); end if;
  return null;
end $$;

create or replace function public.ax_alert_sections_upd() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; l text;
begin
  select count(*), string_agg(o.key || ': "' || o.label || '" -> "' || n2.label || '" (group ' || coalesce(o.subject_group,'-') || ' -> ' || coalesce(n2.subject_group,'-') || ')', E'\n')
    into n, l from old_rows o join new_rows n2 on n2.key = o.key
   where (o.label, o.sheet_name, o.subject_group) is distinct from (n2.label, n2.sheet_name, n2.subject_group);
  if n > 0 then perform public.ax_send_alert('Section renamed / edited', n || ' section(s) changed', jsonb_build_object('changes', l)); end if;
  return null;
end $$;

create or replace function public.ax_alert_sections_del() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; l text;
begin
  select count(*), string_agg(label || ' [' || key || ']', ', ') into n, l from old_rows;
  if n > 0 then perform public.ax_send_alert('Section REMOVED', n || ' section(s) deleted (with all their students, marks and assignments): ' || l, jsonb_build_object('sections', l)); end if;
  return null;
end $$;

-- ---------- students (removal only) ----------
create or replace function public.ax_alert_students_del() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; l text;
begin
  -- skip rows that vanished only because their whole section was deleted (that has its own alert)
  select count(*), string_agg(o.name || ' (' || o.section_key || ')', ', ') into n, l
    from (select * from old_rows limit 25) o
   where exists (select 1 from public.sections s where s.key = o.section_key);
  if n > 0 then perform public.ax_send_alert('Student(s) REMOVED', n || ' student(s) deleted: ' || l, jsonb_build_object('students', l)); end if;
  return null;
end $$;

-- ---------- teacher assignments ----------
create or replace function public.ax_alert_ta_ins() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; l text;
begin
  select count(*), string_agg(section_key || ' / ' || subject || ' -> ' || teacher_name, E'\n') into n, l from new_rows;
  if n > 0 then perform public.ax_send_alert('Teacher assignment added', n || ' assignment(s)', jsonb_build_object('assignments', l)); end if;
  return null;
end $$;
create or replace function public.ax_alert_ta_upd() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; l text;
begin
  select count(*), string_agg(o.section_key || ' / ' || o.subject || ': ' || o.teacher_name || ' -> ' || n2.teacher_name, E'\n') into n, l
    from old_rows o join new_rows n2 on n2.id = o.id where o.teacher_name is distinct from n2.teacher_name;
  if n > 0 then perform public.ax_send_alert('Teacher assignment changed', n || ' assignment(s)', jsonb_build_object('changes', l)); end if;
  return null;
end $$;
create or replace function public.ax_alert_ta_del() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; l text;
begin
  select count(*), string_agg(o.section_key || ' / ' || o.subject || ' (' || o.teacher_name || ')', E'\n') into n, l
    from old_rows o where exists (select 1 from public.sections s where s.key = o.section_key);
  if n > 0 then perform public.ax_send_alert('Teacher assignment removed', n || ' assignment(s)', jsonb_build_object('removed', l)); end if;
  return null;
end $$;

-- ---------- section subject lists ----------
create or replace function public.ax_alert_sso_ins() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; l text;
begin
  select count(*), string_agg(section_key || ': ' || array_to_string(subjects, ', '), E'\n') into n, l from new_rows;
  if n > 0 then perform public.ax_send_alert('Section subject list set', n || ' section(s)', jsonb_build_object('subjects', l)); end if;
  return null;
end $$;
create or replace function public.ax_alert_sso_upd() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; l text;
begin
  select count(*), string_agg(o.section_key || ': [' || array_to_string(o.subjects, ', ') || '] -> [' || array_to_string(n2.subjects, ', ') || ']', E'\n') into n, l
    from old_rows o join new_rows n2 on n2.section_key = o.section_key where o.subjects is distinct from n2.subjects;
  if n > 0 then perform public.ax_send_alert('Section subject list changed', n || ' section(s)', jsonb_build_object('changes', l)); end if;
  return null;
end $$;
create or replace function public.ax_alert_sso_del() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; l text;
begin
  select count(*), string_agg(o.section_key, ', ') into n, l
    from old_rows o where exists (select 1 from public.sections s where s.key = o.section_key);
  if n > 0 then perform public.ax_send_alert('Section subject list reset', n || ' section(s): ' || l, jsonb_build_object('sections', l)); end if;
  return null;
end $$;

-- ---------- profiles (roles) ----------
create or replace function public.ax_alert_profiles_upd() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; l text;
begin
  select count(*), string_agg(o.full_name || ': ' || o.role || ' -> ' || n2.role, E'\n') into n, l
    from old_rows o join new_rows n2 on n2.id = o.id where o.role is distinct from n2.role;
  if n > 0 then perform public.ax_send_alert('User ROLE changed', n || ' user(s)', jsonb_build_object('changes', l)); end if;
  return null;
end $$;
create or replace function public.ax_alert_profiles_del() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; l text;
begin
  select count(*), string_agg(full_name || ' (' || role || ')', ', ') into n, l from old_rows;
  if n > 0 then perform public.ax_send_alert('User profile(s) REMOVED', n || ' profile(s): ' || l, jsonb_build_object('profiles', l)); end if;
  return null;
end $$;

-- ---------- tests (bulk deletes only; single mark edits are routine) ----------
create or replace function public.ax_alert_tests_del() returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from old_rows o
   where exists (select 1 from public.students s where s.id = o.student_id);  -- ignore student/section cascades
  if n >= 10 then perform public.ax_send_alert('Bulk test-score delete', n || ' test scores deleted in one operation', jsonb_build_object('count', n)); end if;
  return null;
end $$;

-- ---------- attach triggers (statement-level, one per event) ----------
drop trigger if exists ax_alert_ins on public.sections;
drop trigger if exists ax_alert_upd on public.sections;
drop trigger if exists ax_alert_del on public.sections;
create trigger ax_alert_ins after insert on public.sections referencing new table as new_rows for each statement execute function public.ax_alert_sections_ins();
create trigger ax_alert_upd after update on public.sections referencing old table as old_rows new table as new_rows for each statement execute function public.ax_alert_sections_upd();
create trigger ax_alert_del after delete on public.sections referencing old table as old_rows for each statement execute function public.ax_alert_sections_del();

drop trigger if exists ax_alert_del on public.students;
create trigger ax_alert_del after delete on public.students referencing old table as old_rows for each statement execute function public.ax_alert_students_del();

drop trigger if exists ax_alert_ins on public.teacher_assignments;
drop trigger if exists ax_alert_upd on public.teacher_assignments;
drop trigger if exists ax_alert_del on public.teacher_assignments;
create trigger ax_alert_ins after insert on public.teacher_assignments referencing new table as new_rows for each statement execute function public.ax_alert_ta_ins();
create trigger ax_alert_upd after update on public.teacher_assignments referencing old table as old_rows new table as new_rows for each statement execute function public.ax_alert_ta_upd();
create trigger ax_alert_del after delete on public.teacher_assignments referencing old table as old_rows for each statement execute function public.ax_alert_ta_del();

drop trigger if exists ax_alert_ins on public.section_subject_overrides;
drop trigger if exists ax_alert_upd on public.section_subject_overrides;
drop trigger if exists ax_alert_del on public.section_subject_overrides;
create trigger ax_alert_ins after insert on public.section_subject_overrides referencing new table as new_rows for each statement execute function public.ax_alert_sso_ins();
create trigger ax_alert_upd after update on public.section_subject_overrides referencing old table as old_rows new table as new_rows for each statement execute function public.ax_alert_sso_upd();
create trigger ax_alert_del after delete on public.section_subject_overrides referencing old table as old_rows for each statement execute function public.ax_alert_sso_del();

drop trigger if exists ax_alert_upd on public.profiles;
drop trigger if exists ax_alert_del on public.profiles;
create trigger ax_alert_upd after update on public.profiles referencing old table as old_rows new table as new_rows for each statement execute function public.ax_alert_profiles_upd();
create trigger ax_alert_del after delete on public.profiles referencing old table as old_rows for each statement execute function public.ax_alert_profiles_del();

drop trigger if exists ax_alert_del on public.tests;
create trigger ax_alert_del after delete on public.tests referencing old table as old_rows for each statement execute function public.ax_alert_tests_del();

-- ---------- REQUIRED: fill these two values in (edit, then run) ----------
-- insert into public.alert_config (key, value) values
--   ('function_url',  'https://adqvtmnvyzkusswbwqdr.supabase.co/functions/v1/send-alert'),
--   ('webhook_secret','PASTE-THE-SAME-LONG-RANDOM-SECRET-YOU-SET-AS-ALERT_WEBHOOK_SECRET')
-- on conflict (key) do update set value = excluded.value;
