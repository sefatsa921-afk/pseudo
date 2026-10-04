-- Run once in Supabase -> SQL Editor.
-- Makes warden@demo.veya an administrator of Kora House so "Open temporary QR" is allowed.
-- (create_verification_session requires profiles.role = warden AND an 'admin' membership.)

select public.set_user_role(
  (select id from auth.users where email = 'warden@demo.veya'), 'warden');

select public.grant_community_admin(
  (select id from auth.users where email = 'warden@demo.veya'),
  (select id from public.communities where name = 'Kora House'));

-- Check: should return one row with role = warden and membership_state = admin
select u.email, p.role, m.membership_state, c.name as community
from auth.users u
join public.profiles p on p.id = u.id
left join public.community_memberships m on m.user_id = u.id
left join public.communities c on c.id = m.community_id
where u.email in ('warden@demo.veya', 'student@demo.veya');
