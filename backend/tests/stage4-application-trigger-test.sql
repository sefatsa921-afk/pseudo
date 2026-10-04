-- Regression test (runs in one transaction, rolled back): opportunity application insert must succeed and notify the provider admin.
-- Needs schema.sql + grants.sql + stage4-migration.sql applied. Before the fix this failed with: column reference "community_id" is ambiguous.
begin;
insert into auth.users (id, aud, role, email) values ('00000000-0000-0000-0000-0000000000a1','authenticated','authenticated','s@t.invalid'),('00000000-0000-0000-0000-0000000000a2','authenticated','authenticated','p@t.invalid');
insert into public.profiles (id, display_name, role) values ('00000000-0000-0000-0000-0000000000a1','Stu','student'),('00000000-0000-0000-0000-0000000000a2','Prov','student');
insert into public.communities (id, kind, name, verified_source) values ('00000000-0000-0000-0000-000000000201','society','Provider Co',true);
insert into public.community_memberships (user_id, community_id, membership_state) values ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000201','admin');
insert into public.opportunities (id, provider_community_id, kind, title, summary, review_state, created_by, reviewed_by, reviewed_at)
 values ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000201','bursary','Test Bursary','Summary text here','published','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2', now());
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
insert into public.opportunity_applications (opportunity_id, applicant_id) values ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-0000000000a1');
select 'APPLICATION_INSERT_OK' as result; reset role; select recipient_id, title, body from public.notifications;
rollback;
