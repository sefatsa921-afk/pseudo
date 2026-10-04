# Stage 2 fix: "profile could not be loaded ... not allowed"

Cause: newer Supabase projects no longer give the `authenticated` role access to tables in `public` automatically, and
`schema.sql` never granted it explicitly. Sign-in worked, but every table read (profiles, posts, memberships, the warden's
verification queue) was refused with `permission denied for table ...`.

- `backend/grants.sql` (new, also appended to `schema.sql`): explicit, minimal grants that mirror the row-level-security
  policies. Run it once in the Supabase SQL editor; it is safe to re-run. Column-level UPDATE restrictions are untouched.
- `www/js/20-live.js`: a missing-grant error now says so and names the table, instead of "not allowed".
- Test added (17 total).

# Stage 2: live mode (real sessions, profiles, feed, follows)

Signed in with a real Supabase account, the app now runs on the backend instead of localStorage. Signed out (or with no
backend configured) it is the same fictional demo as before.

## What changed
- **Sessions** (`backend/supabase-client.js`, copied to `www/` by `npm run build`): the session is stored in localStorage,
  refreshed automatically before it expires, retried once on a 401, and restored on app start. A revoked/expired session
  returns you to sign-in; being offline keeps the session and just asks you to reconnect.
- **Real identity** (`www/js/20-live.js`): name, role, username, bio and module-rep status come from `profiles` and
  `module_representatives`. The role is no longer guessed from the email address. A missing profile row is created on first sign-in.
- **Real feed**: posts, likes, comments, new posts (to Kora House) and follow/unfollow go to Supabase. Likes and follows are
  optimistic and roll back with a message if the server refuses. No fictional promotions are mixed into the live feed.
- **Profile editing**: display name, bio, username and "show me in search" are saved to `profiles` (only the four columns the
  schema allows; never role or residence).
- **Verified badge** is read from `community_memberships`, so it survives restarts.
- **Demo isolation**: live data is never written into the offline demo copy; signing out restores the demo exactly.
- **Bug fix**: the login button used to be wired twice (two sign-in requests per tap). `19-pseudo-features.js` now wires it once.
- `tests/live-mode.test.mjs`: 16 tests running the real `www/index.html` against an in-memory fake Supabase
  (`cd tests && npm install && npm test`). They test the app's logic, not your real project.

## Not done yet (Stage 3)
Messages and friend requests, bookings, opportunities/applications, events, photo upload and approval, and wiring the
report/block tools to `reports` / `user_blocks`. These still use the local demo.

# Changes in this revision

## Backend (`backend/`)
- `schema.sql` rewritten as v2: role escalation closed, friend-request acceptance restricted to the recipient, comments/reactions inherit post visibility, posting needs membership/role, plus new tables for events, opportunities, bookings, credentials, portfolio sharing, reports/moderation, blocks, media approval and trust labels. See `backend/README.md` > "Security model (v2)".
- `tests/security-tests.sql` — rollback-only regression tests. **Not yet run on a live Postgres.**
- `supabase-client.js` — verification now goes through RPCs; feed query uses `post_media` and `label`; report/block helpers.
- `seed-demo.sql` — adds three fictional published opportunities.

## App (`www/`)
- Split the 367 KB single file into `index.html` + `css/` + `js/` (18 ordered scripts).
- Page headers compacted (112-156 px -> 65-89 px); Home trimmed so the first post is visible without scrolling (was at 831 px, now ~520 px on an 844 px screen).
- Top bar reduced to brand, search, bell, avatar; Messages and Safety & SOS moved into the profile menu (unread dot on the avatar); chat summary no longer opens by itself, the assistant button shows a count.
- Toasts sit above the floating buttons (and at the top while a sheet is open).
- "Demo mode" is one line per screen; per-card "demo only" notes removed (the SOS sheet keeps its explicit "simulated" wording on purpose).
- Report and block tools for posts, people, listings and DMs; blocked list in Settings; live moderator queue in the admin demo.
- `scripts/copy-web.mjs` no longer overwrites `www/index.html`; it checks that every referenced file exists.
