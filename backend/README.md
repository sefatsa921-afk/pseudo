# Veya backend foundation

This folder defines the first real-backend contract for Veya Campus. It is intentionally separate from the fictional local-storage demo so the Android shell continues to work without credentials or a network.

## Recommended first provider

The schema is PostgreSQL/Supabase-compatible. Supabase is a practical first deployment for this prototype because it provides PostgreSQL, authentication, storage, realtime events, and row-level security without putting a custom server inside the APK.

The mobile app must never contain a Supabase service-role key. Only the public client URL and public anon key may be used in a future build, and all sensitive rules must remain in database policies or trusted server functions.

## Files

- `grants.sql` — explicit Data API grants for `authenticated`. **Required on current Supabase projects** (tables in `public` are no longer exposed automatically). Run after `schema.sql`; safe to re-run.
- `schema.sql` — tables, helper functions, indexes, row-level-security policies, column-level grants and server functions (v2: security fixes plus events, opportunities, bookings, credentials, portfolio sharing, reports/moderation, blocks, media approval and trust labels).
- `tests/security-tests.sql` — rollback-only regression tests for the policy gaps found in review. **Not yet run against a live Postgres** (none was available when it was written); run it in a development project before trusting the schema.
- `seed-demo.sql` — expanded fictional Honey Campus reference data for modules, residences, houses, societies, sponsored companies, and opportunities; `ACC201 Accounting` remains the active prototype direction.
- `api-contract.md` — provider-neutral operations the mobile app will call.
- `.env.example` — names only; copy to a private deployment environment and never commit real values.

## Safety decisions carried into the backend

- Profiles contain public campus identity fields only; no student numbers or identity documents are stored by this foundation.
- Verification uses a server-created session with an expiry, single-use state, residence/community scope, and an administrator review record. Store only a hash of the QR token.
- A scan creates a pending request. It never grants verification by itself.
- Student-to-student messages require an accepted friendship.
- Lecturer messages are allowed only when the sender is the active representative for that lecturer's module.
- Notification subscriptions are explicit and community/page scoped.
- Sponsored content has a first-class source and label instead of looking like an ordinary student post.
- Audit events are append-only in the application contract and should be retained according to the final privacy policy.

## When credentials are available

1. Create a private Supabase project.
2. Run `schema.sql` in the SQL editor.
3. Add the public URL and publishable key to `backend/.env`, a local ignored configuration file. A legacy anon key may appear in older projects, but Supabase is moving to publishable/secret keys.
4. Run `npm run build` to generate the ignored `www/supabase-config.js` and copy the dependency-free REST adapter into the web bundle.
5. With public configuration enabled, the Communities page may read the fictional `communities` and `modules` reference directory. This path is read-only; the local fictional pages remain available as fallback.
6. Add a small authenticated backend adapter to the web shell only after the relevant policies and account flows have been reviewed; keep the current fictional adapter as the offline/demo fallback.
7. Test with two or more accounts before enabling any real notification or messaging path.

No real account, payment, counselling, booking, deletion, or university-system integration is enabled by this foundation.

## Optional cloud build configuration

To let a GitHub Actions build carry the public backend configuration without committing it, add repository Actions secrets named `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The workflow passes them only to the config-generation step. If they are absent, the APK is built in fictional demo mode. Never add `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to the workflow or APK.

## Security model (v2)

- **Roles**: `profiles.role`, `account_status`, `suspended_until` and `residence` cannot be written by the app (column grants plus a guard trigger). Only `set_user_role()` changes a role, and only an existing `admin` (or the SQL editor) can call it. Bootstrap the first admin once: `select public.set_user_role('<uuid>', 'admin');`
- **Friend requests**: only the recipient can accept or decline. New requests must be `pending`.
- **Threads**: comments and reactions are only readable if the parent post is readable.
- **Posting**: houses, residences and the campus page need a verified membership; societies and module pages accept followers; `official` posts need a community-admin membership; `academic` posts need to be the module's lecturer or representative; `sponsored` has no app path.
- **Verification**: the app calls `create_verification_session`, `submit_verification_request` and `review_verification_request`; there is no direct INSERT/UPDATE on those tables for approvals.
- **Trust labels**: posts carry `community | official | academic | sponsored`, opportunities carry `unverified | verified | sponsored`, and `content_trust_label()` turns an expired `expires_at` into `expired`.
- **Media**: `post_media` has its own approval state; other students only see `approved` rows. Store files in a private bucket and serve signed URLs.
- **Safety**: `reports` (routed to community admins by trigger), `user_blocks` (blocks message, friend and comment paths), `moderate_content`, `resolve_report`, `suspend_user`.
