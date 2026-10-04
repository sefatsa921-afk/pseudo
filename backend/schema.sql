-- Veya Campus backend foundation (v2)
-- PostgreSQL / Supabase-compatible initial migration.
-- Run this only in a new development database or convert it into reviewed migrations.
--
-- v2 changes (security review):
--   * profiles.role / account_status / residence can no longer be written by clients.
--   * Only the *recipient* of a friend request can accept or decline it.
--   * Comments and reactions inherit post visibility instead of `using (true)`.
--   * Posting needs community membership (and a role for official / academic posts).
--   * Added: events, opportunities, bookings, credentials, portfolio sharing,
--     reports + moderation, blocks, media approval, trust labels.
--   * Sensitive transitions (verification, approvals, moderation, roles) happen
--     only in SECURITY DEFINER functions; clients get no direct UPDATE path.
--
-- Conventions
--   * Helper functions live in the `private` schema, which the Supabase API does
--     not expose, so they cannot be called as /rpc endpoints.
--   * Functions callable from the app live in `public` and are named below in
--     the "Server functions" section. Their parameters are prefixed `p_`.
--   * Trust labels: community | official | academic | verified | sponsored.
--     "expired" is derived at read time with public.content_trust_label().

create extension if not exists pgcrypto;
create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  username text unique check (username is null or username ~ '^[a-z0-9._]{3,20}$'),
  role text not null default 'student' check (role in ('student', 'lecturer', 'warden', 'committee', 'moderator', 'admin')),
  residence text,
  bio text check (bio is null or char_length(bio) <= 500),
  avatar_url text,
  discoverable boolean not null default true,
  account_status text not null default 'active' check (account_status in ('active', 'suspended')),
  suspended_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{3}[0-9]{3}$'),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('campus', 'residence', 'house', 'society', 'module', 'company', 'opportunity')),
  name text not null,
  description text,
  verified_source boolean not null default false,
  sponsored boolean not null default false,
  sponsor_label text,
  module_id uuid references public.modules(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kind, name),
  check (not sponsored or (sponsor_label is not null and char_length(sponsor_label) > 0))
);

create table public.community_memberships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  membership_state text not null default 'following' check (membership_state in ('following', 'verified_member', 'admin')),
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, community_id)
);

create table public.module_representatives (
  module_id uuid not null references public.modules(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  appointed_by uuid references public.profiles(id) on delete set null,
  appointed_at timestamptz not null default now(),
  primary key (module_id, user_id)
);

create table public.lecturer_modules (
  lecturer_id uuid not null references public.profiles(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  active boolean not null default true,
  primary key (lecturer_id, module_id)
);

-- Posts. `label` is the trust label shown on the card; clients may only choose
-- the label their role allows (enforced by posts_insert_allowed).
-- Media lives in public.post_media so it can have its own approval state.
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid references public.communities(id) on delete set null,
  content_kind text not null default 'post' check (content_kind in ('post', 'reply', 'reel')),
  label text not null default 'community' check (label in ('community', 'official', 'academic', 'sponsored')),
  body text not null check (char_length(body) between 1 and 5000),
  visibility text not null default 'followers' check (visibility in ('public', 'followers', 'verified_members')),
  moderation_state text not null default 'visible' check (moderation_state in ('visible', 'hidden', 'removed')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,           -- path in a PRIVATE storage bucket, never a public URL
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  alt_text text check (alt_text is null or char_length(alt_text) <= 300),
  consent_confirmed boolean not null default false,   -- uploader confirms pictured people agreed
  approval_state text not null default 'pending' check (approval_state in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  check (approval_state = 'pending' or (reviewed_by is not null and reviewed_at is not null))
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  moderation_state text not null default 'visible' check (moderation_state in ('visible', 'hidden', 'removed')),
  created_at timestamptz not null default now()
);

create table public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null default 'like' check (reaction = 'like'),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, reaction)
);

-- 'blocked' is no longer a friendship status: blocks live in user_blocks so a
-- block survives (and cannot be undone by) the other person.
create table public.friendships (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requested_by = user_a or requested_by = user_b)
);

create table public.user_blocks (
  blocker_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

-- Verification: sessions are created and consumed only by the functions below.
create table public.verification_sessions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete restrict,
  administrator_id uuid not null references public.profiles(id) on delete restrict,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'used', 'revoked', 'expired')),
  max_uses integer not null default 1 check (max_uses between 1 and 500),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (use_count <= max_uses)
);

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.verification_sessions(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, student_id),
  check (status = 'pending' or (reviewed_by is not null and reviewed_at is not null))
);

-- Events (residence, inter-residence, society, academic, opportunity sessions).
create table public.events (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  kind text not null default 'residence' check (kind in ('residence', 'inter_residence', 'society', 'academic', 'opportunity_session')),
  title text not null check (char_length(title) between 3 and 140),
  description text check (description is null or char_length(description) <= 2000),
  location text check (location is null or char_length(location) <= 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'cancelled')),
  trust_label text not null default 'community' check (trust_label in ('community', 'official', 'sponsored')),
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);

create table public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'going' check (status in ('going', 'interested')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- Opportunities. Students never write here; providers submit for review and a
-- moderator/admin publishes with a trust label.
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  provider_community_id uuid not null references public.communities(id) on delete restrict,
  kind text not null check (kind in ('bursary', 'scholarship', 'job', 'internship', 'programme')),
  title text not null check (char_length(title) between 3 and 140),
  summary text check (summary is null or char_length(summary) <= 2000),
  value_label text check (value_label is null or char_length(value_label) <= 80),
  eligibility text check (eligibility is null or char_length(eligibility) <= 1000),
  required_documents text check (required_documents is null or char_length(required_documents) <= 500),
  location_type text check (location_type is null or location_type in ('campus', 'external', 'remote')),
  apply_url text check (apply_url is null or apply_url ~ '^https://'),
  closes_at timestamptz,
  review_state text not null default 'pending_review' check (review_state in ('draft', 'pending_review', 'published', 'rejected', 'closed')),
  trust_label text not null default 'unverified' check (trust_label in ('unverified', 'verified', 'sponsored')),
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (review_state not in ('published', 'rejected') or (reviewed_by is not null and reviewed_at is not null) or created_by is null)
);

create table public.opportunity_saves (
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (opportunity_id, user_id)
);

-- Bookings: tutor slots, facilities, counselling. No free-text about wellbeing
-- is collected for counselling: only a service, a time and a status.
create table public.bookable_resources (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references public.communities(id) on delete set null,
  kind text not null check (kind in ('tutor', 'facility', 'counselling')),
  name text not null check (char_length(name) between 2 and 120),
  description text check (description is null or char_length(description) <= 500),
  host_id uuid references public.profiles(id) on delete set null,
  capacity integer not null default 1 check (capacity between 1 and 200),
  auto_confirm boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.bookable_resources(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  purpose text check (purpose is null or char_length(purpose) <= 140),
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'declined', 'cancelled')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '8 hours')
);

-- Credentials are issued, never self-asserted. Portfolio items may point at a
-- credential (verified) or stand alone (shown as "self-reported").
create table public.credentials (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('residence_member', 'module_rep', 'society_role', 'event_participation', 'award', 'certificate')),
  title text not null check (char_length(title) between 3 and 140),
  issuer_community_id uuid references public.communities(id) on delete set null,
  issued_by uuid references public.profiles(id) on delete set null,
  source_request_id uuid references public.verification_requests(id) on delete set null,
  state text not null default 'active' check (state in ('active', 'revoked')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason is null or char_length(revoked_reason) <= 300),
  check (state = 'active' or revoked_at is not null)
);

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  item_kind text not null default 'project' check (item_kind in ('credential', 'project', 'role', 'volunteering', 'achievement')),
  title text not null check (char_length(title) between 2 and 140),
  description text check (description is null or char_length(description) <= 1000),
  credential_id uuid references public.credentials(id) on delete set null,
  visibility text not null default 'private' check (visibility in ('private', 'shareable')),
  created_at timestamptz not null default now()
);

create table public.portfolio_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  audience_label text check (audience_label is null or char_length(audience_label) <= 80),
  include_identity boolean not null default false,   -- real name only when the student chooses
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.portfolio_share_items (
  share_id uuid not null references public.portfolio_shares(id) on delete cascade,
  item_id uuid not null references public.portfolio_items(id) on delete cascade,
  primary key (share_id, item_id)
);

create table public.opportunity_applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  portfolio_share_id uuid references public.portfolio_shares(id) on delete set null,
  status text not null default 'submitted' check (status in ('submitted', 'withdrawn', 'shortlisted', 'declined')),
  created_at timestamptz not null default now(),
  unique (opportunity_id, applicant_id)
);

-- Reports and moderation.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'profile', 'message', 'event', 'opportunity', 'media')),
  target_id uuid not null,
  target_user_id uuid references public.profiles(id) on delete set null,   -- filled by trigger
  community_id uuid references public.communities(id) on delete set null,  -- filled by trigger, routes to community admins
  reason text not null check (reason in ('harassment', 'hate', 'sexual_content', 'violence_or_threat', 'self_harm', 'spam', 'misinformation', 'impersonation', 'privacy', 'scam', 'unsafe', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  snapshot jsonb not null default '{}'::jsonb,                             -- excerpt captured at report time
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id),
  check (status in ('open', 'reviewing') or (resolved_by is not null and resolved_at is not null))
);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('hide', 'remove', 'restore', 'dismiss', 'suspend', 'approve_media', 'reject_media', 'review')),
  target_type text not null,
  target_id uuid,
  target_user_id uuid references public.profiles(id) on delete set null,
  community_id uuid references public.communities(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create table public.notification_subscriptions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, community_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  source_community_id uuid references public.communities(id) on delete set null,
  notification_type text not null,
  title text not null check (char_length(title) <= 160),
  body text check (body is null or char_length(body) <= 1000),
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index posts_feed_idx on public.posts (community_id, created_at desc);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index post_comments_post_idx on public.post_comments (post_id, created_at);
create index post_media_post_idx on public.post_media (post_id);
create index post_media_review_idx on public.post_media (approval_state, created_at);
create index messages_pair_idx on public.direct_messages (sender_id, recipient_id, created_at desc);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index verification_queue_idx on public.verification_requests (community_id, status, created_at);
create index events_community_idx on public.events (community_id, starts_at);
create index events_status_idx on public.events (status, starts_at);
create index opportunities_listing_idx on public.opportunities (review_state, closes_at);
create index bookings_resource_idx on public.bookings (resource_id, starts_at);
create index bookings_user_idx on public.bookings (user_id, starts_at desc);
create index reports_queue_idx on public.reports (status, community_id, created_at);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);
create index portfolio_shares_owner_idx on public.portfolio_shares (owner_id);
create index credentials_holder_idx on public.credentials (holder_id);

-- ---------------------------------------------------------------------------
-- Private helper functions (not exposed through the API)
-- ---------------------------------------------------------------------------

create or replace function private.is_staff(candidate uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (select 1 from public.profiles p where p.id = candidate and p.role in ('moderator', 'admin'));
$$;

create or replace function private.is_admin(candidate uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (select 1 from public.profiles p where p.id = candidate and p.role = 'admin');
$$;

-- Suspended accounts can read but not write. A suspension with a past
-- suspended_until counts as lifted.
create or replace function private.is_active_user(candidate uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = candidate
      and (p.account_status = 'active' or (p.suspended_until is not null and p.suspended_until <= now()))
  );
$$;

create or replace function private.is_blocked_pair(first_user uuid, second_user uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = first_user and b.blocked_id = second_user)
       or (b.blocker_id = second_user and b.blocked_id = first_user)
  );
$$;

create or replace function private.are_friends(first_user uuid, second_user uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (
    select 1 from public.friendships f
    where f.user_a = least(first_user, second_user)
      and f.user_b = greatest(first_user, second_user)
      and f.status = 'accepted'
  );
$$;

create or replace function private.is_module_rep(candidate uuid, module uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (
    select 1 from public.module_representatives r
    where r.user_id = candidate and r.module_id = module and r.active
  );
$$;

create or replace function private.is_community_admin(candidate uuid, target_community uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (
    select 1 from public.community_memberships m
    join public.profiles p on p.id = m.user_id
    where m.user_id = candidate
      and m.community_id = target_community
      and m.membership_state = 'admin'
      and p.role in ('warden', 'committee', 'moderator', 'admin')
  );
$$;

create or replace function private.is_community_member(candidate uuid, target_community uuid, verified_only boolean default false)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (
    select 1 from public.community_memberships m
    where m.user_id = candidate
      and m.community_id = target_community
      and (not verified_only or m.membership_state in ('verified_member', 'admin'))
  );
$$;

-- Who may post an ordinary (label = 'community') post or propose an event in a community.
-- Houses, residences and the campus page need a verified membership. Societies
-- and module pages accept followers. Company and opportunity pages are not
-- open to student posts at all.
create or replace function private.can_post_in_community(candidate uuid, target_community uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select private.is_active_user(candidate) and exists (
    select 1
    from public.communities c
    join public.community_memberships m on m.community_id = c.id and m.user_id = candidate
    where c.id = target_community
      and c.kind in ('campus', 'residence', 'house', 'society', 'module')
      and (
        m.membership_state in ('verified_member', 'admin')
        or (m.membership_state = 'following' and c.kind in ('society', 'module'))
      )
  );
$$;

-- Lecturers assigned to the module (or its active representative) may post
-- 'academic' updates on that module's page.
create or replace function private.is_module_staff(candidate uuid, target_community uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select private.is_active_user(candidate) and exists (
    select 1
    from public.communities c
    where c.id = target_community
      and c.kind = 'module'
      and c.module_id is not null
      and (
        exists (
          select 1 from public.lecturer_modules lm
          join public.profiles p on p.id = lm.lecturer_id and p.role = 'lecturer'
          where lm.lecturer_id = candidate and lm.module_id = c.module_id and lm.active
        )
        or private.is_module_rep(candidate, c.module_id)
      )
  );
$$;

-- Single source of truth for "can this viewer see this post?".
create or replace function private.can_view_post(post_visibility text, post_author uuid, post_community uuid, post_state text, viewer uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select case
    when viewer is null then false
    when post_author = viewer then true
    when private.is_staff(viewer) then true
    when private.is_blocked_pair(viewer, post_author) then false
    when post_state <> 'visible' then post_community is not null and private.is_community_admin(viewer, post_community)
    when post_visibility = 'public' then true
    when post_community is null then false   -- personal posts: public or author-only until a user-follow table exists
    when post_visibility = 'followers' then private.is_community_member(viewer, post_community, false)
    when post_visibility = 'verified_members' then private.is_community_member(viewer, post_community, true)
    else false
  end;
$$;

create or replace function private.hash_token(raw text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(raw, 'UTF8')), 'hex');
$$;

create or replace function private.write_audit(actor uuid, act text, etype text, eid uuid, meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (actor, act, etype, eid, coalesce(meta, '{}'::jsonb));
$$;

-- Derived label: anything past its expiry date shows as "expired".
create or replace function public.content_trust_label(label text, expires_at timestamptz)
returns text language sql immutable as $$
  select case when expires_at is not null and expires_at < now() then 'expired' else label end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Defence in depth for the column-level grants below: even if a grant is ever
-- widened by mistake, a direct client write cannot change privileged columns.
-- Writes made inside the SECURITY DEFINER functions run as the function owner
-- and pass through.
create or replace function private.guard_profile_columns()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.role <> 'student' or new.account_status <> 'active' or new.suspended_until is not null or new.residence is not null then
        raise exception 'PROFILE_FIELD_PROTECTED' using errcode = '42501';
      end if;
    else
      if new.id is distinct from old.id
         or new.role is distinct from old.role
         or new.account_status is distinct from old.account_status
         or new.suspended_until is distinct from old.suspended_until
         or new.residence is distinct from old.residence then
        raise exception 'PROFILE_FIELD_PROTECTED' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before insert or update on public.profiles
  for each row execute function private.guard_profile_columns();
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger posts_touch before update on public.posts
  for each row execute function private.touch_updated_at();
create trigger friendships_touch before update on public.friendships
  for each row execute function private.touch_updated_at();

-- Blocking someone ends any friendship or pending request between the pair.
create or replace function private.on_block_cleanup()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.friendships
  where user_a = least(new.blocker_id, new.blocked_id) and user_b = greatest(new.blocker_id, new.blocked_id);
  return new;
end;
$$;
create trigger user_blocks_cleanup after insert on public.user_blocks
  for each row execute function private.on_block_cleanup();

-- Event capacity: lock the event row so two people cannot take the last seat.
create or replace function private.guard_event_capacity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare cap integer; taken integer;
begin
  if new.status <> 'going' then return new; end if;
  select capacity into cap from public.events where id = new.event_id for update;
  if cap is null then return new; end if;
  select count(*) into taken from public.event_rsvps
   where event_id = new.event_id and status = 'going' and user_id <> new.user_id;
  if taken >= cap then raise exception 'EVENT_FULL'; end if;
  return new;
end;
$$;
create trigger event_rsvps_capacity before insert or update on public.event_rsvps
  for each row execute function private.guard_event_capacity();

-- Booking capacity: lock the resource row, then count overlapping live bookings.
create or replace function private.guard_booking()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare res public.bookable_resources%rowtype; taken integer;
begin
  select * into res from public.bookable_resources where id = new.resource_id for update;
  if not found or not res.active then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  if new.starts_at <= now() then raise exception 'BOOKING_IN_PAST'; end if;
  select count(*) into taken from public.bookings b
   where b.resource_id = new.resource_id
     and b.status in ('requested', 'confirmed')
     and tstzrange(b.starts_at, b.ends_at) && tstzrange(new.starts_at, new.ends_at);
  if taken >= res.capacity then raise exception 'BOOKING_SLOT_TAKEN'; end if;
  return new;
end;
$$;
create trigger bookings_guard before insert on public.bookings
  for each row execute function private.guard_booking();

-- Reports: resolve the target, route it to the right community admins, and
-- keep an excerpt so moderators can act even if the content is later edited.
create or replace function private.fill_report_context()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare found_row boolean := false; recent integer;
begin
  select count(*) into recent from public.reports where reporter_id = new.reporter_id and created_at > now() - interval '1 hour';
  if recent >= 20 then raise exception 'REPORT_RATE_LIMITED'; end if;

  if new.target_type = 'post' then
    select p.author_id, p.community_id, jsonb_build_object('excerpt', left(p.body, 300), 'label', p.label)
      into new.target_user_id, new.community_id, new.snapshot
      from public.posts p where p.id = new.target_id;
    found_row := found;
  elsif new.target_type = 'comment' then
    select c.author_id, p.community_id, jsonb_build_object('excerpt', left(c.body, 300), 'post_id', c.post_id)
      into new.target_user_id, new.community_id, new.snapshot
      from public.post_comments c join public.posts p on p.id = c.post_id where c.id = new.target_id;
    found_row := found;
  elsif new.target_type = 'profile' then
    select p.id, null::uuid, jsonb_build_object('display_name', p.display_name, 'username', p.username)
      into new.target_user_id, new.community_id, new.snapshot
      from public.profiles p where p.id = new.target_id;
    found_row := found;
  elsif new.target_type = 'message' then
    -- only a participant can report a message
    select m.sender_id, null::uuid, jsonb_build_object('excerpt', left(m.body, 300))
      into new.target_user_id, new.community_id, new.snapshot
      from public.direct_messages m
      where m.id = new.target_id and new.reporter_id in (m.sender_id, m.recipient_id);
    found_row := found;
  elsif new.target_type = 'event' then
    select e.proposed_by, e.community_id, jsonb_build_object('title', e.title)
      into new.target_user_id, new.community_id, new.snapshot
      from public.events e where e.id = new.target_id;
    found_row := found;
  elsif new.target_type = 'opportunity' then
    select o.created_by, o.provider_community_id, jsonb_build_object('title', o.title)
      into new.target_user_id, new.community_id, new.snapshot
      from public.opportunities o where o.id = new.target_id;
    found_row := found;
  elsif new.target_type = 'media' then
    select m.owner_id, p.community_id, jsonb_build_object('post_id', m.post_id, 'alt_text', m.alt_text)
      into new.target_user_id, new.community_id, new.snapshot
      from public.post_media m join public.posts p on p.id = m.post_id where m.id = new.target_id;
    found_row := found;
  end if;

  if not found_row then raise exception 'REPORT_TARGET_NOT_FOUND'; end if;
  if new.target_user_id = new.reporter_id then raise exception 'CANNOT_REPORT_SELF'; end if;
  return new;
end;
$$;
create trigger reports_context before insert on public.reports
  for each row execute function private.fill_report_context();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.modules enable row level security;
alter table public.communities enable row level security;
alter table public.community_memberships enable row level security;
alter table public.module_representatives enable row level security;
alter table public.lecturer_modules enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;
alter table public.direct_messages enable row level security;
alter table public.verification_sessions enable row level security;
alter table public.verification_requests enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_saves enable row level security;
alter table public.opportunity_applications enable row level security;
alter table public.bookable_resources enable row level security;
alter table public.bookings enable row level security;
alter table public.credentials enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.portfolio_shares enable row level security;
alter table public.portfolio_share_items enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.notification_subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.device_tokens enable row level security;
alter table public.audit_events enable row level security;

-- Column-level privileges. RLS decides which ROWS; these decide which COLUMNS.
-- Anyone who needs to change a column not listed here goes through a server function.
revoke all on all tables in schema public from anon;
revoke insert, update on public.profiles from authenticated;
grant insert (id, display_name, username, bio, avatar_url, discoverable) on public.profiles to authenticated;
grant update (display_name, username, bio, avatar_url, discoverable) on public.profiles to authenticated;
revoke update on public.posts from authenticated;
grant update (body) on public.posts to authenticated;
revoke update on public.friendships from authenticated;
grant update (status) on public.friendships to authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke update on public.verification_sessions from authenticated;
grant update (status) on public.verification_sessions to authenticated;
revoke update on public.bookings from authenticated;
grant update (status) on public.bookings to authenticated;
revoke update on public.opportunity_applications from authenticated;
grant update (status) on public.opportunity_applications to authenticated;
revoke update on public.event_rsvps from authenticated;
grant update (status) on public.event_rsvps to authenticated;
revoke update on public.portfolio_items from authenticated;
grant update (title, description, visibility) on public.portfolio_items to authenticated;
revoke update on public.opportunities from authenticated;
grant update (title, summary, value_label, eligibility, required_documents, location_type, apply_url, closes_at, review_state) on public.opportunities to authenticated;
-- The public reference directory is readable without an account.
grant select on public.communities, public.modules to anon;

-- profiles ------------------------------------------------------------------
create policy profiles_read on public.profiles for select to authenticated
  using (discoverable or id = auth.uid() or private.is_staff(auth.uid()));
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid() and role = 'student' and account_status = 'active' and residence is null);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- reference data --------------------------------------------------------------
create policy modules_read_authenticated on public.modules for select to authenticated using (true);
create policy communities_read_authenticated on public.communities for select to authenticated using (true);
create policy modules_read_reference_anon on public.modules for select to anon using (true);
create policy communities_read_reference_anon on public.communities for select to anon using (true);
create policy representatives_read_authenticated on public.module_representatives for select to authenticated using (true);
create policy lecturer_modules_read_authenticated on public.lecturer_modules for select to authenticated using (true);

-- memberships: users can follow/unfollow; verified_member and admin are granted by server functions only
create policy memberships_read_scoped on public.community_memberships for select to authenticated
  using (user_id = auth.uid() or private.is_community_admin(auth.uid(), community_id));
create policy memberships_follow_self on public.community_memberships for insert to authenticated
  with check (user_id = auth.uid() and membership_state = 'following' and verified_at is null and verified_by is null and private.is_active_user(auth.uid()));
create policy memberships_unfollow_self on public.community_memberships for delete to authenticated
  using (user_id = auth.uid() and membership_state = 'following');

-- posts ---------------------------------------------------------------------
create policy posts_read on public.posts for select to authenticated
  using (private.can_view_post(visibility, author_id, community_id, moderation_state, auth.uid()));
create policy posts_insert_allowed on public.posts for insert to authenticated
  with check (
    author_id = auth.uid()
    and moderation_state = 'visible'
    and private.is_active_user(auth.uid())
    and (visibility <> 'verified_members' or community_id is not null)
    and (
      -- ordinary post: own timeline, or a community the author is allowed to post in
      (label = 'community' and (community_id is null or private.can_post_in_community(auth.uid(), community_id)))
      -- official post: warden / committee / moderator who is an admin of that community
      or (label = 'official' and community_id is not null and private.is_community_admin(auth.uid(), community_id))
      -- academic post: lecturer on the module (or its representative) in the module's page
      or (label = 'academic' and community_id is not null and private.is_module_staff(auth.uid(), community_id))
      -- 'sponsored' has no client path: only service-role tooling can create it
    )
  );
create policy posts_update_self on public.posts for update to authenticated
  using (author_id = auth.uid() and moderation_state = 'visible' and private.is_active_user(auth.uid()))
  with check (author_id = auth.uid());
create policy posts_delete_self on public.posts for delete to authenticated
  using (author_id = auth.uid());

-- post media: visible to others only once approved
create policy post_media_read on public.post_media for select to authenticated
  using (
    owner_id = auth.uid()
    or private.is_staff(auth.uid())
    or exists (select 1 from public.posts p where p.id = post_media.post_id and p.community_id is not null and private.is_community_admin(auth.uid(), p.community_id))
    or (approval_state = 'approved' and exists (select 1 from public.posts p where p.id = post_media.post_id))
  );
create policy post_media_insert_own on public.post_media for insert to authenticated
  with check (
    owner_id = auth.uid()
    and approval_state = 'pending' and reviewed_by is null and reviewed_at is null
    and consent_confirmed
    and private.is_active_user(auth.uid())
    and exists (select 1 from public.posts p where p.id = post_media.post_id and p.author_id = auth.uid())
  );
create policy post_media_delete_own on public.post_media for delete to authenticated
  using (owner_id = auth.uid());

-- comments and reactions inherit post visibility: the sub-select on posts is
-- itself filtered by posts_read, so a private post's thread stays private.
create policy comments_read on public.post_comments for select to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_comments.post_id)
    and (
      moderation_state = 'visible' and not private.is_blocked_pair(auth.uid(), author_id)
      or author_id = auth.uid()
      or private.is_staff(auth.uid())
    )
  );
create policy comments_insert_self on public.post_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and moderation_state = 'visible'
    and private.is_active_user(auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id = post_comments.post_id and p.moderation_state = 'visible' and not private.is_blocked_pair(auth.uid(), p.author_id)
    )
  );
create policy comments_delete_self on public.post_comments for delete to authenticated
  using (author_id = auth.uid());
create policy reactions_read on public.post_reactions for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_reactions.post_id));
create policy reactions_insert_self on public.post_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and private.is_active_user(auth.uid())
    and exists (select 1 from public.posts p where p.id = post_reactions.post_id and p.moderation_state = 'visible')
  );
create policy reactions_delete_self on public.post_reactions for delete to authenticated
  using (user_id = auth.uid());

-- friendships: only the RECIPIENT can accept or decline ------------------------
create policy friendships_read_participant on public.friendships for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());
create policy friendships_request_self on public.friendships for insert to authenticated
  with check (
    requested_by = auth.uid()
    and (user_a = auth.uid() or user_b = auth.uid())
    and status = 'pending'
    and private.is_active_user(auth.uid())
    and not private.is_blocked_pair(user_a, user_b)
  );
create policy friendships_respond_recipient on public.friendships for update to authenticated
  using (
    (user_a = auth.uid() or user_b = auth.uid())
    and requested_by <> auth.uid()
    and status = 'pending'
  )
  with check (
    (user_a = auth.uid() or user_b = auth.uid())
    and requested_by <> auth.uid()
    and status in ('accepted', 'declined')
  );
create policy friendships_remove on public.friendships for delete to authenticated
  using (
    (user_a = auth.uid() or user_b = auth.uid())
    and (
      status = 'accepted'                                        -- either side can unfriend
      or (status = 'pending' and requested_by = auth.uid())      -- sender cancels
      or (status = 'declined' and requested_by <> auth.uid())    -- recipient clears a decline
    )
  );

-- blocks: visible only to the blocker ---------------------------------------
create policy blocks_read_own on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert_own on public.user_blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete_own on public.user_blocks for delete to authenticated using (blocker_id = auth.uid());

-- messages ------------------------------------------------------------------
create policy messages_read_allowed on public.direct_messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy messages_insert_allowed on public.direct_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and private.is_active_user(auth.uid())
    and not private.is_blocked_pair(sender_id, recipient_id)
    and (
      private.are_friends(sender_id, recipient_id)
      or exists (
        select 1
        from public.profiles recipient
        join public.lecturer_modules taught on taught.lecturer_id = recipient.id and taught.active
        join public.module_representatives rep on rep.module_id = taught.module_id and rep.user_id = sender_id and rep.active
        where recipient.id = recipient_id and recipient.role = 'lecturer'
      )
    )
  );

-- verification: read-only for clients; created and decided by server functions
create policy verification_sessions_read_admin on public.verification_sessions for select to authenticated
  using (private.is_community_admin(auth.uid(), community_id));
create policy verification_sessions_revoke_admin on public.verification_sessions for update to authenticated
  using (private.is_community_admin(auth.uid(), community_id) and status = 'active')
  with check (private.is_community_admin(auth.uid(), community_id) and status = 'revoked');
create policy verification_requests_read on public.verification_requests for select to authenticated
  using (student_id = auth.uid() or private.is_community_admin(auth.uid(), community_id));

-- events --------------------------------------------------------------------
create policy events_read on public.events for select to authenticated
  using (
    status = 'approved'
    or proposed_by = auth.uid()
    or private.is_community_admin(auth.uid(), community_id)
    or private.is_staff(auth.uid())
  );
create policy events_propose_member on public.events for insert to authenticated
  with check (
    proposed_by = auth.uid()
    and status = 'proposed' and trust_label = 'community'
    and approved_by is null and approved_at is null
    and private.can_post_in_community(auth.uid(), community_id)
  );
create policy events_create_admin on public.events for insert to authenticated
  with check (
    proposed_by = auth.uid()
    and private.is_community_admin(auth.uid(), community_id)
    and trust_label in ('community', 'official')
    and (status = 'proposed' or (status = 'approved' and approved_by = auth.uid() and approved_at is not null))
  );
create policy events_withdraw_own on public.events for delete to authenticated
  using (proposed_by = auth.uid() and status = 'proposed');

create policy rsvps_read on public.event_rsvps for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.events e where e.id = event_rsvps.event_id and private.is_community_admin(auth.uid(), e.community_id)));
create policy rsvps_insert_self on public.event_rsvps for insert to authenticated
  with check (
    user_id = auth.uid()
    and private.is_active_user(auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_rsvps.event_id and e.status = 'approved'
        and coalesce(e.ends_at, e.starts_at + interval '3 hours') > now()
    )
  );
create policy rsvps_update_self on public.event_rsvps for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy rsvps_delete_self on public.event_rsvps for delete to authenticated
  using (user_id = auth.uid());

-- opportunities ---------------------------------------------------------------
create policy opportunities_read on public.opportunities for select to authenticated
  using (
    review_state = 'published'
    or created_by = auth.uid()
    or private.is_staff(auth.uid())
    or private.is_community_admin(auth.uid(), provider_community_id)
  );
create policy opportunities_submit_provider on public.opportunities for insert to authenticated
  with check (
    created_by = auth.uid()
    and review_state in ('draft', 'pending_review')
    and trust_label = 'unverified'
    and reviewed_by is null and reviewed_at is null
    and private.is_community_admin(auth.uid(), provider_community_id)
  );
create policy opportunities_edit_draft on public.opportunities for update to authenticated
  using (
    review_state in ('draft', 'pending_review')
    and (created_by = auth.uid() or private.is_community_admin(auth.uid(), provider_community_id))
  )
  with check (
    review_state in ('draft', 'pending_review') and trust_label = 'unverified'
    and reviewed_by is null and reviewed_at is null
  );
create policy opp_saves_self on public.opportunity_saves for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy applications_read on public.opportunity_applications for select to authenticated
  using (
    applicant_id = auth.uid()
    or exists (select 1 from public.opportunities o where o.id = opportunity_applications.opportunity_id and private.is_community_admin(auth.uid(), o.provider_community_id))
  );
create policy applications_apply_self on public.opportunity_applications for insert to authenticated
  with check (
    applicant_id = auth.uid()
    and status = 'submitted'
    and private.is_active_user(auth.uid())
    and (portfolio_share_id is null or exists (select 1 from public.portfolio_shares s where s.id = portfolio_share_id and s.owner_id = auth.uid()))
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_applications.opportunity_id and o.review_state = 'published'
        and (o.closes_at is null or o.closes_at > now())
    )
  );
create policy applications_withdraw_self on public.opportunity_applications for update to authenticated
  using (applicant_id = auth.uid() and status = 'submitted')
  with check (applicant_id = auth.uid() and status = 'withdrawn');
create policy applications_review_provider on public.opportunity_applications for update to authenticated
  using (exists (select 1 from public.opportunities o where o.id = opportunity_applications.opportunity_id and private.is_community_admin(auth.uid(), o.provider_community_id)))
  with check (status in ('shortlisted', 'declined'));

-- bookings --------------------------------------------------------------------
create policy resources_read on public.bookable_resources for select to authenticated
  using (active or (community_id is not null and private.is_community_admin(auth.uid(), community_id)) or private.is_staff(auth.uid()));
create policy resources_manage on public.bookable_resources for all to authenticated
  using (community_id is not null and private.is_community_admin(auth.uid(), community_id))
  with check (community_id is not null and private.is_community_admin(auth.uid(), community_id));
create policy bookings_read on public.bookings for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.bookable_resources r where r.id = bookings.resource_id and r.community_id is not null and private.is_community_admin(auth.uid(), r.community_id))
    or exists (select 1 from public.bookable_resources r where r.id = bookings.resource_id and r.host_id = auth.uid())
  );
create policy bookings_request_self on public.bookings for insert to authenticated
  with check (
    user_id = auth.uid()
    and private.is_active_user(auth.uid())
    and decided_by is null and decided_at is null
    and (
      status = 'requested'
      or (status = 'confirmed' and exists (select 1 from public.bookable_resources r where r.id = bookings.resource_id and r.auto_confirm))
    )
  );
create policy bookings_cancel_self on public.bookings for update to authenticated
  using (user_id = auth.uid() and status in ('requested', 'confirmed'))
  with check (user_id = auth.uid() and status = 'cancelled');

-- credentials and portfolio -------------------------------------------------
create policy credentials_read on public.credentials for select to authenticated
  using (
    holder_id = auth.uid()
    or private.is_staff(auth.uid())
    or (issuer_community_id is not null and private.is_community_admin(auth.uid(), issuer_community_id))
  );
-- (no client INSERT/UPDATE/DELETE on credentials: issued by public.review_verification_request and similar)
create policy portfolio_items_read_own on public.portfolio_items for select to authenticated using (owner_id = auth.uid());
create policy portfolio_items_insert_own on public.portfolio_items for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (
      credential_id is null
      or exists (select 1 from public.credentials c where c.id = credential_id and c.holder_id = auth.uid() and c.state = 'active')
    )
  );
create policy portfolio_items_update_own on public.portfolio_items for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy portfolio_items_delete_own on public.portfolio_items for delete to authenticated using (owner_id = auth.uid());
create policy portfolio_shares_read_own on public.portfolio_shares for select to authenticated using (owner_id = auth.uid());
create policy portfolio_shares_revoke_own on public.portfolio_shares for update to authenticated
  using (owner_id = auth.uid() and revoked_at is null) with check (owner_id = auth.uid());
revoke update on public.portfolio_shares from authenticated;
grant update (revoked_at) on public.portfolio_shares to authenticated;
create policy portfolio_share_items_read_own on public.portfolio_share_items for select to authenticated
  using (exists (select 1 from public.portfolio_shares s where s.id = portfolio_share_items.share_id and s.owner_id = auth.uid()));
-- shares are created through public.create_portfolio_share and read through public.read_shared_portfolio

-- reports and moderation --------------------------------------------------------
create policy reports_read on public.reports for select to authenticated
  using (
    reporter_id = auth.uid()
    or private.is_staff(auth.uid())
    or (community_id is not null and private.is_community_admin(auth.uid(), community_id))
  );
create policy reports_insert_self on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open' and resolved_by is null and resolved_at is null and private.is_active_user(auth.uid()));
create policy moderation_actions_read on public.moderation_actions for select to authenticated
  using (
    private.is_staff(auth.uid())
    or (community_id is not null and private.is_community_admin(auth.uid(), community_id))
  );

-- notifications, devices, audit -----------------------------------------------
create policy notification_subscriptions_self on public.notification_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_self on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy device_tokens_self on public.device_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy audit_read on public.audit_events for select to authenticated
  using (actor_id = auth.uid() or private.is_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- Server functions (callable from the app via /rpc/<name>)
-- Each one re-checks who is calling. None trusts a client-supplied identity.
-- ---------------------------------------------------------------------------

-- Roles -----------------------------------------------------------------------
-- The only way to change profiles.role. Callable by an existing 'admin', or by
-- the SQL editor / service role (auth.uid() is null there; anon cannot call it).
create or replace function public.set_user_role(p_target uuid, p_new_role text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); old_role text;
begin
  if p_new_role not in ('student', 'lecturer', 'warden', 'committee', 'moderator', 'admin') then
    raise exception 'INVALID_ROLE';
  end if;
  if me is not null and not private.is_admin(me) then
    raise exception 'NOT_AUTHORISED' using errcode = '42501';
  end if;
  if me is not null and p_target = me and p_new_role <> 'admin' then
    raise exception 'CANNOT_DEMOTE_SELF';
  end if;
  select role into old_role from public.profiles where id = p_target;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  update public.profiles set role = p_new_role where id = p_target;
  perform private.write_audit(me, 'role_changed', 'profile', p_target, jsonb_build_object('from', old_role, 'to', p_new_role));
end;
$$;

-- Grants the 'admin' membership that makes warden/committee powers community-scoped.
create or replace function public.grant_community_admin(p_target uuid, p_community uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); target_role text;
begin
  if me is not null and not private.is_admin(me) then raise exception 'NOT_AUTHORISED' using errcode = '42501'; end if;
  select role into target_role from public.profiles where id = p_target;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if target_role not in ('warden', 'committee', 'moderator', 'admin') then raise exception 'ROLE_CANNOT_ADMINISTER'; end if;
  insert into public.community_memberships (user_id, community_id, membership_state, verified_at, verified_by)
  values (p_target, p_community, 'admin', now(), me)
  on conflict (user_id, community_id) do update set membership_state = 'admin', verified_at = now(), verified_by = me;
  perform private.write_audit(me, 'community_admin_granted', 'community', p_community, jsonb_build_object('user', p_target));
end;
$$;

-- Verification ------------------------------------------------------------------
-- Administrator creates a short-lived QR session. The raw token is returned ONCE
-- (render it as the QR); only its SHA-256 hash is stored. QR payload: veya:v1:<token>
create or replace function public.create_verification_session(p_community uuid, p_ttl_minutes integer default 15, p_max_uses integer default 1)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); tok text; sid uuid; exp timestamptz;
begin
  if me is null or not private.is_community_admin(me, p_community) then raise exception 'NOT_AUTHORISED' using errcode = '42501'; end if;
  if not private.is_active_user(me) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if p_ttl_minutes not between 1 and 120 then raise exception 'INVALID_TTL'; end if;
  if p_max_uses not between 1 and 500 then raise exception 'INVALID_MAX_USES'; end if;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  exp := now() + make_interval(mins => p_ttl_minutes);
  insert into public.verification_sessions (community_id, administrator_id, token_hash, expires_at, max_uses)
  values (p_community, me, private.hash_token(tok), exp, p_max_uses)
  returning id into sid;
  perform private.write_audit(me, 'verification_session_created', 'verification_session', sid,
    jsonb_build_object('community', p_community, 'ttl_minutes', p_ttl_minutes, 'max_uses', p_max_uses));
  return jsonb_build_object('session_id', sid, 'token', tok, 'qr_payload', 'veya:v1:' || tok, 'expires_at', exp);
end;
$$;

-- Student submits what the QR contained. Creates a PENDING request only.
create or replace function public.submit_verification_request(p_token text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); s public.verification_sessions%rowtype; rid uuid; raw text;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if not private.is_active_user(me) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  raw := regexp_replace(coalesce(p_token, ''), '^veya:v1:', '');
  if char_length(raw) < 32 or char_length(raw) > 128 then raise exception 'VERIFICATION_TOKEN_INVALID'; end if;

  select * into s from public.verification_sessions where token_hash = private.hash_token(raw) for update;
  if not found then raise exception 'VERIFICATION_TOKEN_INVALID'; end if;
  if s.status = 'revoked' then raise exception 'VERIFICATION_SESSION_REVOKED'; end if;
  if s.expires_at <= now() then
    update public.verification_sessions set status = 'expired' where id = s.id and status = 'active';
    raise exception 'VERIFICATION_SESSION_EXPIRED';
  end if;
  if s.status <> 'active' or s.use_count >= s.max_uses then raise exception 'VERIFICATION_SESSION_USED'; end if;
  if s.administrator_id = me then raise exception 'CANNOT_VERIFY_SELF'; end if;
  if private.is_community_member(me, s.community_id, true) then raise exception 'ALREADY_VERIFIED'; end if;

  begin
    insert into public.verification_requests (session_id, student_id, community_id)
    values (s.id, me, s.community_id) returning id into rid;
  exception when unique_violation then
    raise exception 'VERIFICATION_ALREADY_REQUESTED';
  end;

  update public.verification_sessions
     set use_count = use_count + 1,
         status = case when use_count + 1 >= max_uses then 'used' else status end
   where id = s.id;
  perform private.write_audit(me, 'verification_request_submitted', 'verification_request', rid, jsonb_build_object('community', s.community_id));
  return rid;
end;
$$;

-- Administrator decides. Approval creates the scoped membership and credential.
create or replace function public.review_verification_request(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); r public.verification_requests%rowtype; c public.communities%rowtype; cred uuid;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into r from public.verification_requests where id = p_request for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if not private.is_community_admin(me, r.community_id) then raise exception 'NOT_AUTHORISED' using errcode = '42501'; end if;
  if r.student_id = me then raise exception 'CANNOT_REVIEW_OWN_REQUEST' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'REQUEST_ALREADY_REVIEWED'; end if;

  update public.verification_requests
     set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = me, reviewed_at = now()
   where id = r.id;

  if p_approve then
    select * into c from public.communities where id = r.community_id;
    insert into public.community_memberships (user_id, community_id, membership_state, verified_at, verified_by)
    values (r.student_id, r.community_id, 'verified_member', now(), me)
    on conflict (user_id, community_id) do update
      set membership_state = case when community_memberships.membership_state = 'admin' then 'admin' else 'verified_member' end,
          verified_at = now(), verified_by = me;
    if c.kind = 'residence' then
      update public.profiles set residence = c.name where id = r.student_id;
    end if;
    insert into public.credentials (holder_id, kind, title, issuer_community_id, issued_by, source_request_id)
    values (r.student_id, 'residence_member', 'Verified member · ' || c.name, c.id, me, r.id)
    returning id into cred;
  end if;
  perform private.write_audit(me, case when p_approve then 'verification_approved' else 'verification_rejected' end,
    'verification_request', r.id, jsonb_build_object('student', r.student_id, 'community', r.community_id));
end;
$$;

-- Media, events, opportunities, bookings: reviewer decisions ------------------------
create or replace function public.review_post_media(p_media uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); m public.post_media%rowtype; comm uuid;
begin
  select * into m from public.post_media where id = p_media for update;
  if not found then raise exception 'MEDIA_NOT_FOUND'; end if;
  select community_id into comm from public.posts where id = m.post_id;
  if me is null or not (private.is_staff(me) or (comm is not null and private.is_community_admin(me, comm))) then
    raise exception 'NOT_AUTHORISED' using errcode = '42501';
  end if;
  update public.post_media
     set approval_state = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = me, reviewed_at = now(), review_note = left(p_note, 500)
   where id = m.id;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, target_user_id, community_id, note)
  values (me, case when p_approve then 'approve_media' else 'reject_media' end, 'media', m.id, m.owner_id, comm, left(p_note, 500));
  perform private.write_audit(me, 'media_reviewed', 'post_media', m.id, jsonb_build_object('approved', p_approve));
end;
$$;

create or replace function public.review_event(p_event uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); e public.events%rowtype;
begin
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if me is null or not (private.is_staff(me) or private.is_community_admin(me, e.community_id)) then
    raise exception 'NOT_AUTHORISED' using errcode = '42501';
  end if;
  if e.status <> 'proposed' then raise exception 'EVENT_ALREADY_REVIEWED'; end if;
  update public.events
     set status = case when p_approve then 'approved' else 'rejected' end,
         approved_by = case when p_approve then me end,
         approved_at = case when p_approve then now() end
   where id = e.id;
  perform private.write_audit(me, 'event_reviewed', 'event', e.id, jsonb_build_object('approved', p_approve));
end;
$$;

-- Publishing an opportunity is where the "verified" / "sponsored" label is decided.
create or replace function public.review_opportunity(p_opportunity uuid, p_approve boolean, p_trust_label text default 'verified')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); o public.opportunities%rowtype;
begin
  if me is null or not private.is_staff(me) then raise exception 'NOT_AUTHORISED' using errcode = '42501'; end if;
  if p_trust_label not in ('verified', 'sponsored') then raise exception 'INVALID_TRUST_LABEL'; end if;
  select * into o from public.opportunities where id = p_opportunity for update;
  if not found then raise exception 'OPPORTUNITY_NOT_FOUND'; end if;
  update public.opportunities
     set review_state = case when p_approve then 'published' else 'rejected' end,
         trust_label = case when p_approve then p_trust_label else 'unverified' end,
         reviewed_by = me, reviewed_at = now()
   where id = o.id;
  perform private.write_audit(me, 'opportunity_reviewed', 'opportunity', o.id, jsonb_build_object('approved', p_approve, 'trust_label', p_trust_label));
end;
$$;

create or replace function public.decide_booking(p_booking uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); b public.bookings%rowtype; r public.bookable_resources%rowtype;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  select * into r from public.bookable_resources where id = b.resource_id;
  if me is null or not (r.host_id = me or (r.community_id is not null and private.is_community_admin(me, r.community_id))) then
    raise exception 'NOT_AUTHORISED' using errcode = '42501';
  end if;
  if b.status <> 'requested' then raise exception 'BOOKING_ALREADY_DECIDED'; end if;
  update public.bookings
     set status = case when p_approve then 'confirmed' else 'declined' end, decided_by = me, decided_at = now()
   where id = b.id;
  perform private.write_audit(me, 'booking_decided', 'booking', b.id, jsonb_build_object('approved', p_approve));
end;
$$;

create or replace function public.event_going_count(p_event uuid)
returns integer language sql security definer set search_path = public, pg_temp stable as $$
  select count(*)::integer from public.event_rsvps r
  join public.events e on e.id = r.event_id and e.status = 'approved'
  where r.event_id = p_event and r.status = 'going';
$$;

-- Moderation -----------------------------------------------------------------
-- Hide / remove / restore a post or comment. Staff, or an admin of the post's community.
create or replace function public.moderate_content(p_target_type text, p_target uuid, p_new_state text, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); comm uuid; owner_user uuid; act text;
begin
  if p_new_state not in ('visible', 'hidden', 'removed') then raise exception 'INVALID_STATE'; end if;
  if p_target_type = 'post' then
    select community_id, author_id into comm, owner_user from public.posts where id = p_target;
  elsif p_target_type = 'comment' then
    select p.community_id, c.author_id into comm, owner_user
      from public.post_comments c join public.posts p on p.id = c.post_id where c.id = p_target;
  else
    raise exception 'UNSUPPORTED_TARGET';
  end if;
  if not found then raise exception 'TARGET_NOT_FOUND'; end if;
  if me is null or not (private.is_staff(me) or (comm is not null and private.is_community_admin(me, comm))) then
    raise exception 'NOT_AUTHORISED' using errcode = '42501';
  end if;
  if p_target_type = 'post' then
    update public.posts set moderation_state = p_new_state where id = p_target;
  else
    update public.post_comments set moderation_state = p_new_state where id = p_target;
  end if;
  act := case p_new_state when 'hidden' then 'hide' when 'removed' then 'remove' else 'restore' end;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, target_user_id, community_id, note)
  values (me, act, p_target_type, p_target, owner_user, comm, left(p_note, 500));
  perform private.write_audit(me, 'content_' || act, p_target_type, p_target, jsonb_build_object('note', left(p_note, 500)));
end;
$$;

create or replace function public.resolve_report(p_report uuid, p_outcome text, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); r public.reports%rowtype;
begin
  if p_outcome not in ('reviewing', 'actioned', 'dismissed') then raise exception 'INVALID_OUTCOME'; end if;
  select * into r from public.reports where id = p_report for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if me is null or not (private.is_staff(me) or (r.community_id is not null and private.is_community_admin(me, r.community_id))) then
    raise exception 'NOT_AUTHORISED' using errcode = '42501';
  end if;
  update public.reports
     set status = p_outcome,
         resolved_by = case when p_outcome = 'reviewing' then null else me end,
         resolved_at = case when p_outcome = 'reviewing' then null else now() end,
         resolution_note = left(p_note, 500)
   where id = r.id;
  insert into public.moderation_actions (report_id, actor_id, action, target_type, target_id, target_user_id, community_id, note)
  values (r.id, me, case when p_outcome = 'dismissed' then 'dismiss' else 'review' end, r.target_type, r.target_id, r.target_user_id, r.community_id, left(p_note, 500));
  perform private.write_audit(me, 'report_' || p_outcome, 'report', r.id, '{}'::jsonb);
end;
$$;

create or replace function public.suspend_user(p_target uuid, p_days integer default null, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid();
begin
  if me is null or not private.is_staff(me) then raise exception 'NOT_AUTHORISED' using errcode = '42501'; end if;
  if p_target = me then raise exception 'CANNOT_SUSPEND_SELF'; end if;
  if p_days is not null and p_days not between 1 and 365 then raise exception 'INVALID_DURATION'; end if;
  update public.profiles
     set account_status = 'suspended', suspended_until = case when p_days is null then null else now() + make_interval(days => p_days) end
   where id = p_target;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, target_user_id, note)
  values (me, 'suspend', 'profile', p_target, p_target, left(p_note, 500));
  perform private.write_audit(me, 'user_suspended', 'profile', p_target, jsonb_build_object('days', p_days));
end;
$$;

-- Portfolio sharing -----------------------------------------------------------
create or replace function public.create_portfolio_share(p_item_ids uuid[], p_audience text default null, p_ttl_hours integer default 72, p_include_identity boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); ids uuid[]; n integer; tok text; sid uuid; exp timestamptz;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if p_ttl_hours not between 1 and 720 then raise exception 'INVALID_TTL'; end if;
  ids := array(select distinct x from unnest(p_item_ids) as x);
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'NO_ITEMS'; end if;
  select count(*) into n from public.portfolio_items i where i.owner_id = me and i.id = any (ids);
  if n <> array_length(ids, 1) then raise exception 'INVALID_ITEMS'; end if;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  exp := now() + make_interval(hours => p_ttl_hours);
  insert into public.portfolio_shares (owner_id, token_hash, audience_label, include_identity, expires_at)
  values (me, private.hash_token(tok), left(p_audience, 80), p_include_identity, exp) returning id into sid;
  insert into public.portfolio_share_items (share_id, item_id) select sid, unnest(ids);
  perform private.write_audit(me, 'portfolio_share_created', 'portfolio_share', sid,
    jsonb_build_object('items', n, 'identity_shared', p_include_identity));
  return jsonb_build_object('share_id', sid, 'token', tok, 'expires_at', exp);
end;
$$;

-- Returns only what the student chose to share. Real name appears only when include_identity is true.
create or replace function public.read_shared_portfolio(p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); sh public.portfolio_shares%rowtype; holder public.profiles%rowtype; items jsonb;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into sh from public.portfolio_shares where token_hash = private.hash_token(coalesce(p_token, ''));
  if not found or sh.revoked_at is not null or sh.expires_at <= now() then raise exception 'SHARE_NOT_AVAILABLE'; end if;
  select * into holder from public.profiles where id = sh.owner_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'title', i.title,
           'description', i.description,
           'kind', i.item_kind,
           'self_reported', i.credential_id is null,
           'credential', case when c.id is not null then jsonb_build_object('title', c.title, 'issued_at', c.issued_at, 'state', c.state, 'issuer', ic.name) end
         ) order by i.created_at), '[]'::jsonb)
    into items
    from public.portfolio_share_items si
    join public.portfolio_items i on i.id = si.item_id
    left join public.credentials c on c.id = i.credential_id
    left join public.communities ic on ic.id = c.issuer_community_id
   where si.share_id = sh.id;
  perform private.write_audit(me, 'portfolio_share_viewed', 'portfolio_share', sh.id, '{}'::jsonb);
  return jsonb_build_object(
    'display_name', case when sh.include_identity then holder.display_name else coalesce(holder.username, 'Verified student') end,
    'identity_shared', sh.include_identity,
    'items', items,
    'expires_at', sh.expires_at
  );
end;
$$;

-- Function privileges: nothing is callable by anon; signed-in users get only the functions below.
revoke all on function public.set_user_role(uuid, text) from public, anon;
revoke all on function public.grant_community_admin(uuid, uuid) from public, anon;
revoke all on function public.create_verification_session(uuid, integer, integer) from public, anon;
revoke all on function public.submit_verification_request(text) from public, anon;
revoke all on function public.review_verification_request(uuid, boolean) from public, anon;
revoke all on function public.review_post_media(uuid, boolean, text) from public, anon;
revoke all on function public.review_event(uuid, boolean) from public, anon;
revoke all on function public.review_opportunity(uuid, boolean, text) from public, anon;
revoke all on function public.decide_booking(uuid, boolean) from public, anon;
revoke all on function public.event_going_count(uuid) from public, anon;
revoke all on function public.moderate_content(text, uuid, text, text) from public, anon;
revoke all on function public.resolve_report(uuid, text, text) from public, anon;
revoke all on function public.suspend_user(uuid, integer, text) from public, anon;
revoke all on function public.create_portfolio_share(uuid[], text, integer, boolean) from public, anon;
revoke all on function public.read_shared_portfolio(text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;
grant execute on function public.grant_community_admin(uuid, uuid) to authenticated;
grant execute on function public.create_verification_session(uuid, integer, integer) to authenticated;
grant execute on function public.submit_verification_request(text) to authenticated;
grant execute on function public.review_verification_request(uuid, boolean) to authenticated;
grant execute on function public.review_post_media(uuid, boolean, text) to authenticated;
grant execute on function public.review_event(uuid, boolean) to authenticated;
grant execute on function public.review_opportunity(uuid, boolean, text) to authenticated;
grant execute on function public.decide_booking(uuid, boolean) to authenticated;
grant execute on function public.event_going_count(uuid) to authenticated;
grant execute on function public.moderate_content(text, uuid, text, text) to authenticated;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;
grant execute on function public.suspend_user(uuid, integer, text) to authenticated;
grant execute on function public.create_portfolio_share(uuid[], text, integer, boolean) to authenticated;
grant execute on function public.read_shared_portfolio(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Data API grants (same content as backend/grants.sql)
-- ---------------------------------------------------------------------------
-- Veya: explicit Data API grants (run once in Supabase -> SQL Editor; safe to re-run).
--
-- WHY THIS EXISTS
-- Newer Supabase projects no longer give the `authenticated` role access to tables you create in `public`
-- automatically; every table needs an explicit GRANT before the REST API can touch it. schema.sql only
-- granted a handful of things (communities/modules to anon, column-level insert/update on a few tables,
-- and EXECUTE on the server functions), so signed-in reads like `profiles` failed with
-- "permission denied for table profiles" (HTTP 403 / SQLSTATE 42501) even though sign-in itself worked.
--
-- WHAT THIS DOES
-- Grants each table only the commands its row-level-security policies already allow, to `authenticated`.
-- RLS still decides WHICH ROWS. It does NOT touch the column-level UPDATE grants from schema.sql
-- (profiles, posts, friendships, ...), so clients still cannot change role, residence, status etc.
-- `anon` gets nothing here. Never grant anything to anon beyond the public reference directory.

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema private to authenticated;

-- SELECT (every table that has a select policy)
grant select on
  public.profiles, public.modules, public.communities, public.community_memberships,
  public.module_representatives, public.lecturer_modules,
  public.posts, public.post_media, public.post_comments, public.post_reactions,
  public.friendships, public.user_blocks, public.direct_messages,
  public.verification_sessions, public.verification_requests,
  public.events, public.event_rsvps, public.opportunities, public.opportunity_saves,
  public.bookable_resources, public.bookings, public.credentials,
  public.portfolio_items, public.portfolio_shares, public.portfolio_share_items,
  public.opportunity_applications, public.reports, public.moderation_actions,
  public.notification_subscriptions, public.notifications, public.device_tokens, public.audit_events
to authenticated;

-- INSERT (profiles keeps its column-level insert grant from schema.sql)
grant insert on
  public.community_memberships, public.posts, public.post_media, public.post_comments, public.post_reactions,
  public.friendships, public.user_blocks, public.direct_messages,
  public.events, public.event_rsvps, public.opportunities, public.opportunity_saves,
  public.bookable_resources, public.bookings, public.portfolio_items,
  public.opportunity_applications, public.reports,
  public.notification_subscriptions, public.device_tokens
to authenticated;

-- DELETE
grant delete on
  public.community_memberships, public.posts, public.post_media, public.post_comments, public.post_reactions,
  public.friendships, public.user_blocks, public.events, public.event_rsvps,
  public.opportunity_saves, public.bookable_resources, public.portfolio_items,
  public.notification_subscriptions, public.device_tokens
to authenticated;

-- UPDATE: only where schema.sql did not already restrict it to specific columns
grant update on public.bookable_resources, public.notification_subscriptions, public.device_tokens to authenticated;

-- Helper functions used inside the row-level-security policies
grant execute on all functions in schema private to authenticated;
grant execute on function public.content_trust_label(text, timestamptz) to authenticated;

-- Server-side tooling only (never ship the service key in the app)
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Check (each should return true):
--   select has_table_privilege('authenticated', 'public.profiles', 'select');
--   select has_table_privilege('authenticated', 'public.posts', 'insert');
--   select has_table_privilege('authenticated', 'public.verification_requests', 'select');
--   select has_schema_privilege('authenticated', 'private', 'usage');
-- And this one must stay FALSE (role/residence are changed only by server functions):
--   select has_table_privilege('authenticated', 'public.profiles', 'update');
-- ---------------------------------------------------------------------------

-- Bootstrapping the first admin (run once in the SQL editor, never from the app):
--   select public.set_user_role('<your-user-uuid>', 'admin');
-- Storage: create a PRIVATE bucket (e.g. 'post-media'); serve images through signed
-- URLs only for post_media rows the caller can select. Never store public URLs.
