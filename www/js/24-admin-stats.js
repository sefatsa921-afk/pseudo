/**
 * Real numbers for the warden overview (live mode only).
 * Counts come from Supabase under the warden's own permissions (row-level security limits them to
 * their community). If a number cannot be loaded it stays undefined and the screen shows "–",
 * never an invented figure.
 */
(function () {
  const B = window.VeyaBackend;
  const MAX_AGE_MS = 30000;
  const WEEK_MS = 7 * 24 * 3600 * 1000;
  const store = { values: {}, at: 0, loading: false, communityId: null };

  function isLiveWarden() {
    return typeof state !== 'undefined' && Boolean(state.user?.live) && typeof isAdmin === 'function' && isAdmin();
  }
  const rows = res => (res && !res.error && Array.isArray(res.data)) ? res.data : null;

  async function communityId() {
    if (store.communityId) return store.communityId;
    const res = await B.listCommunities();
    const hit = (rows(res) || []).find(c => c.name === 'Kora House');
    if (hit) store.communityId = hit.id;
    return store.communityId;
  }

  async function load() {
    if (store.loading || !B?.authed) return;
    store.loading = true;
    try {
      const id = await communityId();
      if (!id) { window.VeyaLive?.reportError?.({ code: 'HTTP_404', message: 'Kora House not found' }, 'Overview'); return; }
      const [members, pending, reports] = await Promise.all([
        B.authed(`community_memberships?community_id=eq.${id}&membership_state=in.(verified_member,admin)&select=membership_state,verified_at`),
        B.authed(`verification_requests?community_id=eq.${id}&status=eq.pending&select=id`),
        B.authed(`reports?community_id=eq.${id}&status=in.(open,reviewing)&select=id`)
      ]);
      const next = {};
      const m = rows(members);
      if (m) {
        const since = Date.now() - WEEK_MS;
        next.verified = m.filter(r => r.membership_state === 'verified_member').length;
        next.admins = m.filter(r => r.membership_state === 'admin').length;
        next.verifiedWeek = m.filter(r => r.membership_state === 'verified_member' && r.verified_at && new Date(r.verified_at).getTime() >= since).length;
      } else window.VeyaLive?.reportError?.(members?.error, 'Overview');
      const p = rows(pending); if (p) next.pending = p.length; else window.VeyaLive?.reportError?.(pending?.error, 'Overview');
      const r = rows(reports); if (r) next.reports = r.length; else window.VeyaLive?.reportError?.(reports?.error, 'Overview');
      const changed = JSON.stringify(next) !== JSON.stringify(store.values);
      store.values = next; store.at = Date.now();
      if (changed && typeof state !== 'undefined' && state.page === 'admin-overview' && typeof renderApp === 'function') renderApp();
    } catch (err) {
      window.VeyaLive?.reportError?.({ code: 'CLIENT_ERROR', message: err?.message || 'Unexpected error' }, 'Overview');
    } finally { store.loading = false; }
  }

  function ensure() {
    if (!isLiveWarden()) return;
    if (Date.now() - store.at > MAX_AGE_MS && !store.loading) { store.at = Date.now(); load(); }
  }
  function get(key) { return store.values[key]; }
  function reset() { store.values = {}; store.at = 0; store.communityId = null; }

  window.VeyaAdminStats = { ensure, get, reset, load };
})();
