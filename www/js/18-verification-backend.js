/**
 * Adapter between the Veya UI and the Supabase verification functions.
 *
 * - Not configured, or no signed-in token  -> exact localStorage demo behaviour.
 * - Configured + token                     -> real RPCs. Errors are now REPORTED
 *   (source: 'backend') instead of silently falling back to local mode.
 * - While signed in, polls Supabase so the warden sees real pending requests
 *   and the student sees the warden's decision.
 */
(function () {
  const B = window.VeyaBackend;
  const TOKEN_KEY = 'veya-access-token';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const FRIENDLY = {
    NOT_AUTHORISED: 'This account is not an administrator of Kora House.',
    NOT_AUTHENTICATED: 'You are not signed in to the backend. Sign in with the test account again.',
    VERIFICATION_TOKEN_INVALID: 'That code is not valid. Ask the administrator to show a fresh one.',
    VERIFICATION_SESSION_EXPIRED: 'That code has expired. Ask the administrator for a new one.',
    VERIFICATION_SESSION_USED: 'That code has already been used. Ask for a new one.',
    VERIFICATION_SESSION_REVOKED: 'That code was cancelled by the administrator.',
    CANNOT_VERIFY_SELF: 'An administrator cannot verify their own account.',
    ALREADY_VERIFIED: 'This account is already verified for that community.',
    VERIFICATION_ALREADY_REQUESTED: 'You already have a request for this community.',
    REQUEST_ALREADY_REVIEWED: 'This request was already decided.',
    CANNOT_REVIEW_OWN_REQUEST: 'You cannot review your own request.'
  };

  function token() {
    if (window.veyaAccessToken) return window.veyaAccessToken;
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }
  function live() { return Boolean(B && B.isConfigured() && token()); }
  // The client refreshes a token that is about to expire; the saved copy can be stale after ~1 hour.
  async function freshToken() {
    try { return (await B.auth?.getAccessToken?.()) || token(); } catch (_) { return token(); }
  }
  function report(error, area) { try { window.VeyaLive?.reportError?.(error, area); } catch (_) { /* never let reporting break polling */ } }
  function tidy(error) {
    if (!error) return null;
    const text = `${error.message || ''} ${error.details?.message || ''}`;
    const code = Object.keys(FRIENDLY).find(key => text.includes(key));
    return { ...error, message: code ? FRIENDLY[code] : (error.message || 'The backend request failed.') };
  }

  let communityCache = null;
  async function resolveCommunity(hint) {
    if (UUID_RE.test(hint || '')) return hint;
    if (communityCache) return communityCache;
    const res = await B.listCommunities();
    const row = (res.data || []).find(c => c.name === 'Kora House');
    if (row) communityCache = row.id;
    return communityCache;
  }

  async function createSession(communityHint, ttl = 15, maxUses = 1) {
    if (!live()) {
      return {
        data: { token: 'veya:v1:demo-' + Date.now(), expiresAt: new Date(Date.now() + ttl * 60 * 1000).toISOString() },
        error: null, source: 'local'
      };
    }
    const communityId = await resolveCommunity(communityHint);
    if (!communityId) {
      return { data: null, error: { message: 'Could not find the Kora House community in Supabase.' }, source: 'backend' };
    }
    const res = await B.createVerificationSession(communityId, ttl, maxUses, await freshToken());
    if (res.error) return { data: null, error: tidy(res.error), source: 'backend' };
    const d = res.data || {};
    return {
      data: { token: d.qr_payload || ('veya:v1:' + d.token), sessionId: d.session_id, expiresAt: d.expires_at, communityId },
      error: null, source: 'backend'
    };
  }

  async function submitRequest(qrPayload) {
    if (!live()) return { data: { id: 'local-' + Date.now() }, error: null, source: 'local' };
    const res = await B.submitVerificationRequest(String(qrPayload || '').trim(), await freshToken());
    if (res.error) return { data: null, error: tidy(res.error), source: 'backend' };
    return { data: { id: typeof res.data === 'string' ? res.data : res.data?.id }, error: null, source: 'backend' };
  }

  async function reviewRequest(requestId, approve) {
    if (!live() || !UUID_RE.test(requestId || '')) return { data: null, error: null, source: 'local' };
    const res = await B.reviewVerificationRequest(requestId, approve, await freshToken());
    if (res.error) return { data: null, error: tidy(res.error), source: 'backend' };
    return { data: null, error: null, source: 'backend' };
  }

  async function listPending() {
    if (!live()) return { data: [], error: null, source: 'local' };
    const res = await B.request(
      'verification_requests?status=eq.pending&select=id,student_id,community_id,created_at&order=created_at.asc&limit=20',
      { accessToken: await freshToken() }
    );
    return res.error ? { data: [], error: tidy(res.error), source: 'backend' } : { data: res.data || [], error: null, source: 'backend' };
  }

  async function requestStatus(id) {
    const res = await B.request(`verification_requests?id=eq.${encodeURIComponent(id)}&select=status`, { accessToken: await freshToken() });
    if (res.error) { report(tidy(res.error), 'Verification status'); return null; }
    return res.data?.[0]?.status || null;
  }

  async function studentName(studentId) {
    try {
      const res = await B.getProfile(studentId, await freshToken());
      return res.data?.[0]?.display_name || '';
    } catch (_) { return ''; }
  }

  // ---- polling -------------------------------------------------------------
  let busy = false;

  async function syncQueue() {
    const { data, error } = await listPending();
    if (error) { report(error, 'Verification queue'); return; }
    const first = data[0];
    const current = state.pendingRequest;
    if (first) {
      if (current?.id === first.id) return;
      const name = (await studentName(first.student_id)) || 'Student';
      state.pendingRequest = {
        id: first.id, name, alias: name,
        initials: typeof initials === 'function' ? initials(name) : 'ST',
        scope: { ...DEFAULT_VERIFICATION_SCOPE }, scanSource: 'backend',
        requestedAt: first.created_at, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        administratorLabel: 'Northbank Residence administration', qrPreview: 'live'
      };
      saveState(); renderApp();
    } else if (current && UUID_RE.test(current.id)) {
      state.pendingRequest = null;
      saveState(); renderApp();
    }
  }

  async function syncOwnRequest() {
    const req = state.pendingRequest;
    if (!state.pendingVerification || !req || !UUID_RE.test(req.id || '')) return;
    const status = await requestStatus(req.id);
    if (status === 'approved') applyApproval(true);
    else if (status === 'rejected') applyRejection(true);
  }

  async function syncNow() {
    if (busy || !live() || typeof state === 'undefined' || !state.user) return;
    busy = true;
    try {
      if (typeof isAdmin === 'function' && isAdmin()) await syncQueue();
      else await syncOwnRequest();
    } catch (err) { console.warn('Verification sync failed', err); report({ code: 'CLIENT_ERROR', message: err?.message || 'Unexpected error' }, 'Verification'); }
    finally { busy = false; }
  }

  setInterval(syncNow, 4000);
  window.addEventListener('focus', syncNow);

  window.VeyaVerification = { createSession, submitRequest, reviewRequest, listPending, syncNow, isLive: live, uuid: UUID_RE };
})();
