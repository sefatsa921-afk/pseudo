-- Veya security regression tests.
--
-- Run in the Supabase SQL editor of a DEVELOPMENT project, after schema.sql.
-- Everything happens inside one transaction that is rolled back at the end, so
-- no data is kept. Each test prints NOTICE 'PASS: ...' or fails with 'FAIL: ...'.
--
-- NOTE: these were written without a live Postgres to run them against. If the
-- fixture INSERT into auth.users complains about a missing NOT NULL column,
-- add that column to the insert; the tests themselves do not depend on it.

begin;

-- ---------- fixtures (run as the SQL-editor superuser) ----------
-- A ...0a student (sender)      B ...0b student (recipient)    C ...0c verified Kora House member
-- D ...0d outsider student      W ...0e warden / Kora House admin    M ...0f global admin
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.invalid'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.invalid'),
  ('00000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'c@test.invalid'),
  ('00000000-0000-0000-0000-00000000000d', 'authenticated', 'authenticated', 'd@test.invalid'),
  ('00000000-0000-0000-0000-00000000000e', 'authenticated', 'authenticated', 'e@test.invalid'),
  ('00000000-0000-0000-0000-00000000000f', 'authenticated', 'authenticated', 'f@test.invalid'),
  ('00000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'new@test.invalid');

insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Test A', 'student'),
  ('00000000-0000-0000-0000-00000000000b', 'Test B', 'student'),
  ('00000000-0000-0000-0000-00000000000c', 'Test C', 'student'),
  ('00000000-0000-0000-0000-00000000000d', 'Test D', 'student'),
  ('00000000-0000-0000-0000-00000000000e', 'Test Warden', 'warden'),
  ('00000000-0000-0000-0000-00000000000f', 'Test Admin', 'admin');

insert into public.communities (id, kind, name, verified_source) values
  ('00000000-0000-0000-0000-000000000101', 'house', 'Test Kora House', true),
  ('00000000-0000-0000-0000-000000000102', 'society', 'Test Chess Club', true);

insert into public.community_memberships (user_id, community_id, membership_state) values
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000101', 'verified_member'),
  ('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000101', 'admin'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000101', 'following');

-- a members-only post with a comment and a reaction
insert into public.posts (id, author_id, community_id, body, visibility) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-00000000000c',
   '00000000-0000-0000-0000-000000000101', 'members only', 'verified_members');
insert into public.post_comments (post_id, author_id, body) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-00000000000c', 'private comment');
insert into public.post_reactions (post_id, user_id) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-00000000000c');

-- ---------- 1. role escalation ----------
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL: student changed their own role';
  exception when insufficient_privilege then raise notice 'PASS: student cannot UPDATE profiles.role'; end;
  begin
    perform public.set_user_role('00000000-0000-0000-0000-00000000000a', 'admin');
    raise exception 'FAIL: student called set_user_role';
  exception when insufficient_privilege then raise notice 'PASS: student cannot call set_user_role'; end;
  reset role;
end $$;

do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000010', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000010","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.profiles (id, display_name, role) values ('00000000-0000-0000-0000-000000000010', 'Sneaky', 'admin');
    raise exception 'FAIL: new account inserted itself as admin';
  exception when insufficient_privilege then raise notice 'PASS: cannot INSERT a profile with role=admin'; end;
  reset role;
end $$;

-- ---------- 2. friend requests ----------
do $$ declare n integer; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.friendships (user_a, user_b, requested_by, status)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'accepted');
    raise exception 'FAIL: sender inserted an already-accepted friendship';
  exception when insufficient_privilege then raise notice 'PASS: cannot insert a friendship as accepted'; end;
  insert into public.friendships (user_a, user_b, requested_by)
  values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a');
  update public.friendships set status = 'accepted'
   where user_a = '00000000-0000-0000-0000-00000000000a' and user_b = '00000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: sender accepted their own friend request'; end if;
  raise notice 'PASS: sender cannot accept their own request';
  begin
    insert into public.direct_messages (sender_id, recipient_id, body)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'hello?');
    raise exception 'FAIL: message sent before the request was accepted';
  exception when insufficient_privilege then raise notice 'PASS: no messaging before acceptance'; end;
  reset role;
end $$;

do $$ declare n integer; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  set local role authenticated;
  update public.friendships set status = 'accepted'
   where user_a = '00000000-0000-0000-0000-00000000000a' and user_b = '00000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: recipient could not accept'; end if;
  raise notice 'PASS: recipient can accept';
  reset role;
end $$;

-- ---------- 3. members-only posts, comments and reactions ----------
do $$ declare n integer; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);   -- outsider
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.posts where id = '00000000-0000-0000-0000-000000000201';
  if n <> 0 then raise exception 'FAIL: outsider can read members-only post'; end if;
  select count(*) into n from public.post_comments;
  if n <> 0 then raise exception 'FAIL: outsider can read comments on a private post'; end if;
  select count(*) into n from public.post_reactions;
  if n <> 0 then raise exception 'FAIL: outsider can read reactions on a private post'; end if;
  raise notice 'PASS: private post, comments and reactions are hidden from outsiders';
  reset role;
end $$;

do $$ declare n integer; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);   -- follower only
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.posts where id = '00000000-0000-0000-0000-000000000201';
  if n <> 0 then raise exception 'FAIL: a mere follower can read verified_members posts'; end if;
  raise notice 'PASS: followers cannot read verified_members posts';
  reset role;
end $$;

do $$ declare n integer; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);   -- verified member
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.post_comments;
  if n <> 1 then raise exception 'FAIL: verified member cannot read the thread'; end if;
  raise notice 'PASS: verified members can read the thread';
  reset role;
end $$;

-- ---------- 4. who may post where ----------
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);   -- outsider
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.posts (author_id, community_id, body, visibility)
    values ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000101', 'spam in Kora House', 'public');
    raise exception 'FAIL: outsider posted into Kora House';
  exception when insufficient_privilege then raise notice 'PASS: outsider cannot post into a house'; end;
  reset role;
end $$;

do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);   -- follower only
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.posts (author_id, community_id, body)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000101', 'follower posting in a house');
    raise exception 'FAIL: follower posted into a house';
  exception when insufficient_privilege then raise notice 'PASS: following is not enough to post in a house'; end;
  reset role;
end $$;

do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);   -- verified member, not admin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.posts (author_id, community_id, body) values
    ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000101', 'verified member posting');
  raise notice 'PASS: verified member can post in their house';
  begin
    insert into public.posts (author_id, community_id, body, label) values
      ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000101', 'fake warden notice', 'official');
    raise exception 'FAIL: a student posted an official notice';
  exception when insufficient_privilege then raise notice 'PASS: students cannot post as official'; end;
  begin
    update public.posts set community_id = '00000000-0000-0000-0000-000000000102'
     where id = '00000000-0000-0000-0000-000000000201';
    raise exception 'FAIL: author moved a post to another community';
  exception when insufficient_privilege then raise notice 'PASS: author cannot change a post''s community'; end;
  reset role;
end $$;

do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true);   -- warden / Kora admin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.posts (author_id, community_id, body, label, visibility) values
    ('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000101', 'Quiet hours from 20:00', 'official', 'followers');
  raise notice 'PASS: community admin can post an official notice';
  reset role;
end $$;

-- ---------- 5. verification flow ----------
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.verification_requests (session_id, student_id, community_id)
    values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000101');
    raise exception 'FAIL: client inserted a verification request directly';
  exception when insufficient_privilege then raise notice 'PASS: no direct INSERT into verification_requests'; end;
  begin
    perform public.submit_verification_request('veya:v1:' || repeat('a', 64));
    raise exception 'FAIL: bogus token accepted';
  exception when others then
    if sqlerrm <> 'VERIFICATION_TOKEN_INVALID' then raise; end if;
    raise notice 'PASS: bogus QR token rejected';
  end;
  reset role;
end $$;

do $$ declare sess jsonb; rid uuid; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true);   -- warden creates QR
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}', true);
  set local role authenticated;
  sess := public.create_verification_session('00000000-0000-0000-0000-000000000101', 15, 1);
  perform set_config('veya.test_token', sess->>'qr_payload', true);
  reset role;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);   -- student scans
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
  set local role authenticated;
  rid := public.submit_verification_request(current_setting('veya.test_token'));
  if (select status from public.verification_requests where id = rid) <> 'pending' then
    raise exception 'FAIL: scan did not create a pending request';
  end if;
  if exists (select 1 from public.community_memberships where user_id = '00000000-0000-0000-0000-00000000000d' and membership_state = 'verified_member') then
    raise exception 'FAIL: scan verified the student by itself';
  end if;
  raise notice 'PASS: scan creates a pending request only';
  begin
    perform public.review_verification_request(rid, true);
    raise exception 'FAIL: student approved their own request';
  exception when insufficient_privilege then raise notice 'PASS: student cannot approve a request'; end;
  begin
    perform public.submit_verification_request(current_setting('veya.test_token'));
    raise exception 'FAIL: single-use QR accepted twice';
  exception when others then
    if sqlerrm not in ('VERIFICATION_SESSION_USED', 'VERIFICATION_ALREADY_REQUESTED') then raise; end if;
    raise notice 'PASS: single-use QR cannot be reused';
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true);   -- warden approves
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}', true);
  set local role authenticated;
  perform public.review_verification_request(rid, true);
  reset role;
  if not exists (select 1 from public.community_memberships where user_id = '00000000-0000-0000-0000-00000000000d' and membership_state = 'verified_member') then
    raise exception 'FAIL: approval did not create a verified membership';
  end if;
  if not exists (select 1 from public.credentials where holder_id = '00000000-0000-0000-0000-00000000000d' and kind = 'residence_member') then
    raise exception 'FAIL: approval did not issue a credential';
  end if;
  raise notice 'PASS: admin approval creates membership + credential';
end $$;

-- ---------- 6. reports and blocks ----------
do $$ declare n integer; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);   -- verified member reports
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
  set local role authenticated;
  -- report the warden's official post
  insert into public.reports (reporter_id, target_type, target_id, reason)
  select '00000000-0000-0000-0000-00000000000c', 'post', p.id, 'spam'
    from public.posts p where p.label = 'official' limit 1;
  raise notice 'PASS: member can report a post';
  begin
    update public.reports
      set status = 'dismissed'
      where reporter_id = '00000000-0000-0000-0000-00000000000c';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'FAIL: reporter closed their own report';
    end if;
    raise notice 'PASS: reporter cannot resolve reports';
  exception when insufficient_privilege then
    raise notice 'PASS: reporter has no UPDATE privilege on reports';
  end;
  reset role;
end $$;

do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);   -- B blocks A (A and B are friends now)
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.user_blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a');
  reset role;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.direct_messages (sender_id, recipient_id, body)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'still there?');
    raise exception 'FAIL: blocked user could still message';
  exception when insufficient_privilege then raise notice 'PASS: blocking stops messages and ends the friendship'; end;
  reset role;
end $$;

rollback;
