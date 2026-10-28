-- Run after migrations 008 and 009. Keep the admin destination out of contacts.
create or replace function public.messaging_phone_digits(raw text)
returns text language sql immutable set search_path = public as $$
  select case
    when d like '00%' then substr(d, 3)
    when d like '0%' then '92' || substr(d, 2)
    when length(d) = 10 and d like '3%' then '92' || d
    else d end
  from (select regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') as d) n;
$$;

create or replace function public.reject_admin_parent_contact()
returns trigger language plpgsql security definer set search_path = public as $$
declare admin_phone text;
begin
  select public.messaging_phone_digits(value) into admin_phone
    from public.app_settings where key = 'admin_whatsapp';
  if coalesce(admin_phone, '') <> ''
     and public.messaging_phone_digits(new.phone) = admin_phone then
    raise exception 'The admin number cannot be saved as a parent contact.';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_admin_parent_contact on public.parent_contacts;
create trigger reject_admin_parent_contact
before insert or update on public.parent_contacts
for each row execute function public.reject_admin_parent_contact();

-- Clear only an admin number accidentally stored as a parent phone.
update public.parent_contacts set phone = null
where public.messaging_phone_digits(phone) in (
  select public.messaging_phone_digits(value) from public.app_settings
  where key = 'admin_whatsapp' and value <> ''
);
