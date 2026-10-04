-- Exercises every Stage 4 notification trigger via real RLS + server functions (rolled back). Expect 6 rows: booking_decision, event_review, friend_request, friend_request_accepted, media_review, message.
begin;
insert into auth.users (id, aud, role, email) values
 ('00000000-0000-0000-0000-0000000000b1','authenticated','authenticated','a@t.invalid'),
 ('00000000-0000-0000-0000-0000000000b2','authenticated','authenticated','b@t.invalid'),
 ('00000000-0000-0000-0000-0000000000b3','authenticated','authenticated','m@t.invalid');
insert into public.profiles (id, display_name, role) values
 ('00000000-0000-0000-0000-0000000000b1','Alice A','student'),('00000000-0000-0000-0000-0000000000b2','Bob B','student'),('00000000-0000-0000-0000-0000000000b3','Mod M','admin');
insert into public.communities (id, kind, name, verified_source) values ('00000000-0000-0000-0000-000000000401','society','Soc',true);

-- friendship: A requests B, B accepts, A messages B
set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
insert into public.friendships (user_a,user_b,requested_by,status) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b1','pending');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
update public.friendships set status='accepted' where user_a='00000000-0000-0000-0000-0000000000b1';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
insert into public.direct_messages (sender_id, recipient_id, body) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','hi');
reset role;

-- event proposal reviewed by the admin through the real server function
insert into public.events (id, community_id, title, starts_at, proposed_by, status) values ('00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000401','Quiz night', now()+interval '2 days','00000000-0000-0000-0000-0000000000b1','proposed');
set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b3',true);
select public.review_event('00000000-0000-0000-0000-000000000501', true);
reset role;

-- booking decision
insert into public.bookable_resources (id, kind, name) values ('00000000-0000-0000-0000-000000000601','tutor','Maths tutor');
insert into public.bookings (id, resource_id, user_id, starts_at, ends_at) values ('00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-0000000000b1', now()+interval '3 days', now()+interval '3 days 1 hour');
set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b3',true);
select public.decide_booking('00000000-0000-0000-0000-000000000701', true);
reset role;

-- photo review through the real server function
insert into public.posts (id, author_id, community_id, body, visibility) values ('00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-0000000000b1',null,'pic','public');
insert into public.post_media (id, post_id, owner_id, storage_path, consent_confirmed) values ('00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1/x.jpg', true);
set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b3',true);
select public.review_post_media('00000000-0000-0000-0000-000000000901', true, null);
reset role;

select n.notification_type, p.display_name as recipient, n.title from public.notifications n join public.profiles p on p.id=n.recipient_id order by n.created_at, n.notification_type;
rollback;
