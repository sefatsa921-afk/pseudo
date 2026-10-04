# Backend security checklist

Before connecting real users, verify all of the following:

- [ ] No service-role, database, APNs, or FCM secret is packaged in the APK.
- [ ] Email/identity verification and account recovery are handled by the chosen auth provider.
- [ ] QR payloads are opaque, short-lived, single-use, residence/community-scoped, and bound to an authorised administrator session.
- [ ] The scan endpoint validates the token server-side; the client cannot mark itself verified.
- [ ] Administrator actions require role and residence/community scope checks.
- [ ] Direct messages re-check accepted friendship or module-representative eligibility server-side.
- [ ] Notification fan-out is limited to explicit page/community subscriptions.
- [ ] Sponsored posts retain a visible source and sponsored/verified label.
- [ ] Private profile data is separated from public profile fields and is not exposed to ordinary feed queries.
- [ ] Audit records exist for QR creation, scan submission, approval/rejection, moderation, and role changes.
- [ ] Rate limits and abuse reporting exist for friend requests, messages, QR attempts, and posts.
- [ ] Backups, retention, deletion, and export rules are written before production launch.
- [ ] Privacy policy and consent copy match the actual data flows.
- [ ] `backend/tests/security-tests.sql` passes on a development project (written but not yet executed).
- [ ] Storage bucket for post media is private and served through signed URLs.
- [ ] First admin bootstrapped with `set_user_role` from the SQL editor, not from the app.
