-- Phase 3: create a profile automatically whenever someone signs up.
--
-- Why: until now the app created the profile on a person's first sign-in. Accounts made any other way
-- (Supabase dashboard, invite, password reset flow) had no profile, which is what caused
-- "PROFILE_NOT_FOUND" earlier. The database should guarantee it instead of the app.
--
-- Safe to run more than once. Run it in Supabase -> SQL Editor.
--
-- Security notes:
--   * The role is NEVER read from sign-up data. raw_user_meta_data is chosen by the person signing up,
--     so trusting it would let anyone make themselves a warden. Every new profile is a plain 'student';
--     promote people with public.set_user_role(...) as before.
--   * Only a display name is taken from sign-up data, and it is length-checked.
--   * If creating the profile ever fails, the sign-up still succeeds (the app's first-sign-in
--     fallback creates the profile), so this can never lock anyone out of creating an account.

-- 1. Work out a sensible display name (same rule the app uses, so both paths agree).
create or replace function public.derive_display_name(p_email text, p_meta jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  v := btrim(coalesce(p_meta ->> 'display_name', p_meta ->> 'full_name', ''));
  if char_length(v) between 2 and 80 then
    return v;
  end if;
  v := btrim(regexp_replace(split_part(coalesce(p_email, ''), '@', 1), '[^a-zA-Z0-9]+', ' ', 'g'));
  v := left(initcap(v), 80);
  if char_length(v) < 2 then
    v := 'Student';
  end if;
  return v;
end;
$$;

-- 2. The trigger function.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, public.derive_display_name(new.email, new.raw_user_meta_data))
  on conflict (id) do nothing;
  return new;
exception when others then
  -- Never block account creation because of a profile problem.
  raise warning 'handle_new_user: could not create profile for %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- These are internal. Nobody should be able to call them through the API.
revoke all on function public.derive_display_name(text, jsonb) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 3. Attach it to new auth users.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Backfill: give a profile to every existing account that doesn't have one.
insert into public.profiles (id, display_name)
select u.id, public.derive_display_name(u.email, u.raw_user_meta_data)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Check it worked. Both of these should return what the comment says:
--
--   -- should return 0 (every account has a profile):
--   select count(*) as accounts_without_profile
--   from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id);
--
--   -- should list on_auth_user_created:
--   select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
--
-- To test properly: Authentication -> Users -> Add user -> create "trigger.test@demo.veya", then
--   select id, display_name, role from public.profiles
--   where id = (select id from auth.users where email = 'trigger.test@demo.veya');
-- It should show display_name "Trigger Test" and role "student". Delete that test user afterwards.
--
-- To undo:  drop trigger if exists on_auth_user_created on auth.users;
-- ---------------------------------------------------------------------------------------------
