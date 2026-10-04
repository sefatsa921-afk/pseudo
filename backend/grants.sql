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
