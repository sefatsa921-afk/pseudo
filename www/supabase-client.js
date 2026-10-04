/*
 * Small provider adapter for the dependency-free Veya prototype.
 *
 * This file does not contain credentials. scripts/write-supabase-config.mjs
 * creates www/supabase-config.js locally when backend/.env is present.
 * The current app keeps using the fictional adapter until authenticated backend
 * flows are deliberately enabled.
 */
(function () {
  const defaultConfig = { enabled: false, url: '', publishableKey: '' };

  function config() {
    return window.VEYA_SUPABASE_CONFIG || defaultConfig;
  }

  // Lets the UI show a truthful Live / Offline badge: fired on every reply (ok) and every failed connection (!ok).
  function signalNetwork(ok) {
    try { window.dispatchEvent(new CustomEvent('veya:network', { detail: { ok } })); } catch (_) { /* non-browser */ }
  }

  function isConfigured() {
    const value = config();
    return Boolean(value.enabled && value.url && value.publishableKey);
  }

  function notConfigured() {
    return { data: null, error: { code: 'BACKEND_NOT_CONFIGURED', message: 'The Veya backend is not configured for this build.' } };
  }

  async function request(path, options = {}) {
    if (!isConfigured()) return notConfigured();
    const value = config();
    const headers = new Headers(options.headers || {});
    headers.set('apikey', value.publishableKey);
    headers.set('Authorization', `Bearer ${options.accessToken || value.publishableKey}`);
    headers.set('Accept', 'application/json');
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');

    try {
      const response = await fetch(`${value.url.replace(/\/$/, '')}/rest/v1/${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      signalNetwork(true);
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
      if (!response.ok) {
        return { data: null, error: { code: `HTTP_${response.status}`, message: data?.message || 'The backend request failed.', details: data } };
      }
      return { data, error: null };
    } catch (error) {
      signalNetwork(false);
      return { data: null, error: { code: 'NETWORK_ERROR', message: 'The Veya backend could not be reached.', details: error } };
    }
  }

  // Calls a server function (see "Server functions" in schema.sql). Parameters are p_-prefixed.
  function rpc(name, args, accessToken) {
    return request(`rpc/${encodeURIComponent(name)}`, { method: 'POST', body: args || {}, accessToken });
  }

  // ---------------------------------------------------------------------------
  // Session (Stage 2): persisted in localStorage so it survives app restarts, and
  // refreshed automatically. Only the user's own tokens are stored here. Never put
  // a secret / service-role key anywhere in this app.
  // ---------------------------------------------------------------------------
  const SESSION_KEY = 'veya-session-v1';
  const REFRESH_MARGIN_S = 90;
  let session = null;
  let refreshPromise = null;
  let refreshTimer = null;
  let lastAuthError = null;
  const listeners = [];

  function nowS() { return Math.floor(Date.now() / 1000); }
  function readStored() {
    try { const v = JSON.parse(localStorage.getItem(SESSION_KEY)); return v && v.access_token && v.refresh_token ? v : null; } catch (_) { return null; }
  }
  function publishToken() {
    // Older modules (18-verification-backend.js) read the token from these places.
    try {
      window.veyaAccessToken = session ? session.access_token : '';
      if (session) sessionStorage.setItem('veya-access-token', session.access_token); else sessionStorage.removeItem('veya-access-token');
    } catch (_) {}
  }
  function setSession(next) {
    session = next;
    try { if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next)); else localStorage.removeItem(SESSION_KEY); } catch (_) {}
    publishToken();
    scheduleRefresh();
  }
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (!session) return;
    const wait = Math.max(5, session.expires_at - nowS() - REFRESH_MARGIN_S - 30) * 1000;
    refreshTimer = setTimeout(() => { refresh().catch(() => {}); }, Math.min(wait, 2147483000));
  }
  function normalise(data) {
    // Expiry is measured from when WE received the token (expires_in), never from the server's absolute
    // expires_at: a phone whose clock is wrong would otherwise think every token is already expired and
    // refresh in a tight loop until the server rate-limits it.
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: nowS() + (Number(data.expires_in) > 0 ? Number(data.expires_in) : 3600),
      user: { id: data.user?.id, email: data.user?.email }
    };
  }
  async function authRequest(path, body, bearer) {
    if (!isConfigured()) return notConfigured();
    const value = config();
    try {
      const headers = { apikey: value.publishableKey, 'Content-Type': 'application/json' };
      if (bearer) headers.Authorization = `Bearer ${bearer}`;
      const response = await fetch(`${value.url.replace(/\/$/, '')}/auth/v1/${path}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
      signalNetwork(true);
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
      if (!response.ok) {
        return { data: null, error: { code: `HTTP_${response.status}`, status: response.status, serverCode: data?.error_code || data?.code || '', message: data?.error_description || data?.msg || data?.message || 'Sign-in failed.', details: data } };
      }
      return { data, error: null };
    } catch (error) {
      signalNetwork(false);
      return { data: null, error: { code: 'NETWORK_ERROR', message: 'The Veya backend could not be reached.', details: error } };
    }
  }
  async function signIn(email, password) {
    const res = await authRequest('token?grant_type=password', { email, password });
    if (res.error) return res;
    if (!res.data?.access_token || !res.data?.refresh_token) return { data: null, error: { code: 'BAD_RESPONSE', message: 'Sign-in did not return a session.' } };
    setSession(normalise(res.data));
    emit('signed-in');
    return { data: { user: session.user }, error: null };
  }
  // A refresh token the server says is dead (revoked / already used / unknown session) ends the session.
  // Everything else (offline, 429 rate limit, 5xx, a rejected app key) keeps it and retries later.
  function isDeadRefresh(error) {
    if (!error || (error.status !== 400 && error.status !== 401 && error.status !== 403)) return false;
    return /refresh.?token|session.?(not.?found|expired)|invalid.?grant|already.?used|revoked/i.test(`${error.serverCode} ${error.message}`);
  }
  let refreshBackoff = 30;
  // Single-flight refresh.
  function refresh() {
    if (!session) return Promise.resolve({ data: null, error: { code: 'NO_SESSION', message: 'Not signed in.' } });
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const res = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      if (res.error) {
        lastAuthError = res.error;
        if (isDeadRefresh(res.error)) { setSession(null); emit('signed-out', 'expired'); return res; }
        clearTimeout(refreshTimer);                                          // transient: back off, keep the session
        refreshTimer = setTimeout(() => refresh().catch(() => {}), refreshBackoff * 1000);
        refreshBackoff = Math.min(refreshBackoff * 2, 600);
        return res;
      }
      refreshBackoff = 30; lastAuthError = null;
      setSession(normalise(res.data));
      return { data: { user: session.user }, error: null };
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  async function getAccessToken() {
    if (!session) return '';
    if (session.expires_at - nowS() < REFRESH_MARGIN_S) await refresh();
    return session ? session.access_token : '';
  }
  async function signOut() {
    const token = session?.access_token;
    setSession(null);
    if (token) authRequest('logout', {}, token).catch(() => {});   // best effort; local session is already gone
    emit('signed-out', 'user');
  }
  // Restores a stored session at app start. Returns the user, or null.
  async function restoreSession() {
    const stored = readStored();
    if (!stored || !isConfigured()) { if (stored) publishToken(); return null; }
    session = stored; publishToken();
    if (session.expires_at - nowS() < REFRESH_MARGIN_S) {
      await refresh();                                  // session becomes null only if the server killed it
    } else scheduleRefresh();
    return session ? session.user : null;
  }
  function on(fn) { listeners.push(fn); }
  function emit(type, detail) { listeners.forEach(fn => { try { fn(type, detail); } catch (e) { console.error(e); } }); }

  // Authenticated REST call: attaches the current token and retries once after a 401 (expired JWT).
  async function authed(path, options = {}) {
    if (!session) return { data: null, error: { code: 'NOT_AUTHENTICATED', message: 'You are not signed in.' } };
    let res = await request(path, { ...options, accessToken: await getAccessToken() });
    if (res.error && res.error.code === 'HTTP_401' && session) {
      const r = await refresh();
      if (!r.error) {
        res = await request(path, { ...options, accessToken: await getAccessToken() });
        if (res.error && res.error.code === 'HTTP_401') res.error.afterRefresh = true;
      }
    }
    return res;
  }

  // Connection check for the login screen: tells us (and the user) exactly what the phone can and cannot reach.
  async function diagnose() {
    const lines = [];
    const c = config();
    lines.push(`Config: ${isConfigured() ? 'present' : 'MISSING / disabled'}`);
    if (!isConfigured()) return lines.join('\n');
    const base = c.url.replace(/\/$/, '');
    const key = c.publishableKey || '';
    lines.push(`Project: ${base.replace(/^https?:\/\//, '')}`);
    lines.push(`Key type: ${key.startsWith('sb_publishable_') ? 'publishable (new)' : key.startsWith('eyJ') ? 'legacy anon JWT' : key.startsWith('sb_secret_') ? 'SECRET KEY - WRONG, remove it' : 'unrecognised'} (${key.length} chars)`);
    const probe = async (label, path, headers) => {
      try {
        const r = await fetch(base + path, { headers: { apikey: key, ...(headers || {}) } });
        let msg = ''; try { const t = await r.text(); msg = (JSON.parse(t).message || JSON.parse(t).msg || '').toString().slice(0, 80); } catch (_) {}
        lines.push(`${label}: HTTP ${r.status}${msg ? ' - ' + msg : ''}`);
        return r;
      } catch (e) { lines.push(`${label}: could not connect (${e && e.message ? e.message : 'network error'})`); return null; }
    };
    const h = await probe('Auth service', '/auth/v1/health');
    await probe('Database (public list)', '/rest/v1/communities?select=id&limit=1');
    const date = h && h.headers && h.headers.get && h.headers.get('date');
    if (date) { const skew = Math.round((Date.now() - new Date(date).getTime()) / 1000); lines.push(`Phone clock vs server: ${skew >= 0 ? '+' : ''}${skew}s${Math.abs(skew) > 120 ? '  <- phone clock is wrong; turn on automatic date & time' : ''}`); }
    const st = readStored();
    lines.push(st ? `Saved login: yes (token ${st.expires_at - nowS() > 0 ? 'valid for ' + (st.expires_at - nowS()) + 's' : 'expired ' + (nowS() - st.expires_at) + 's ago'})` : 'Saved login: none');
    if (lastAuthError) lines.push(`Last auth error: HTTP ${lastAuthError.status || '?'} ${lastAuthError.message}`);
    return lines.join('\n');
  }
  const rep = { Prefer: 'return=representation' };
  const q = encodeURIComponent;
  const POST_SELECT = 'id,author_id,community_id,content_kind,label,body,visibility,created_at,'
    + 'author:profiles!author_id(display_name,username,role),'
    + 'community:communities!community_id(name,kind),'
    + 'post_media(id,storage_path,alt_text,approval_state),'
    + 'post_comments(id,author_id,body,created_at,author:profiles!author_id(display_name)),'
    + 'post_reactions(user_id)';

  const VeyaBackend = {
    isConfigured,
    request,
    rpc,
    listCommunities: () => request('communities?select=id,kind,name,description,verified_source,sponsored,sponsor_label,module_id&order=name'),
    listModules: () => request('modules?select=id,code,name&order=code'),
    listReferenceDirectory: async () => {
      const [communities, modules] = await Promise.all([
        VeyaBackend.listCommunities(),
        VeyaBackend.listModules(),
      ]);
      if (communities.error) return communities;
      if (modules.error) return modules;
      return { data: { communities: communities.data || [], modules: modules.data || [] }, error: null };
    }, 
    // Media is a separate table with its own approval state; only approved media is returned to other students.
    listFeed: (accessToken) => request('posts?select=id,author_id,community_id,content_kind,label,body,visibility,expires_at,created_at,post_media(id,storage_path,alt_text,approval_state)&order=created_at.desc', { accessToken }),
    getProfile: (userId, accessToken) => request(`profiles?id=eq.${encodeURIComponent(userId)}&select=id,display_name,username,role,residence,bio,avatar_url,discoverable`, { accessToken }),
    // A scan only creates a PENDING request, and only on the server: the QR token is validated there.
    submitVerificationRequest: (qrPayload, accessToken) => rpc('submit_verification_request', { p_token: qrPayload }, accessToken),
    createVerificationSession: (communityId, ttlMinutes, maxUses, accessToken) => rpc('create_verification_session', { p_community: communityId, p_ttl_minutes: ttlMinutes || 15, p_max_uses: maxUses || 1 }, accessToken),
    reviewVerificationRequest: (requestId, approve, accessToken) => rpc('review_verification_request', { p_request: requestId, p_approve: approve }, accessToken),
    // Safety tools
    submitReport: (targetType, targetId, reason, details, accessToken) => request('reports', { method: 'POST', accessToken, body: { target_type: targetType, target_id: targetId, reason, details: details || null } }),
    blockUser: (blockedId, accessToken) => request('user_blocks', { method: 'POST', accessToken, body: { blocked_id: blockedId } }),
    unblockUser: (blockerId, blockedId, accessToken) => request(`user_blocks?blocker_id=eq.${encodeURIComponent(blockerId)}&blocked_id=eq.${encodeURIComponent(blockedId)}`, { method: 'DELETE', accessToken }),
    // ---- Stage 2: session ----
    auth: { signIn, signOut, refresh, restoreSession, getAccessToken, on, diagnose, hasStoredSession: () => Boolean(readStored()), user: () => (session ? session.user : null), isSignedIn: () => Boolean(session) },
    authed,
    // ---- Stage 2: profile ----
    getMyProfile: () => authed(`profiles?id=eq.${q(session?.user?.id || '')}&select=id,display_name,username,role,residence,bio,avatar_url,discoverable,created_at`),
    createMyProfile: (displayName) => authed('profiles', { method: 'POST', headers: rep, body: { id: session?.user?.id, display_name: displayName } }),
    // Only these columns can be changed by the app (see column grants in schema.sql); role/residence never.
    updateMyProfile: (patch) => {
      const allowed = {}; ['display_name', 'username', 'bio', 'discoverable'].forEach(k => { if (patch[k] !== undefined) allowed[k] = patch[k]; });
      return authed(`profiles?id=eq.${q(session?.user?.id || '')}`, { method: 'PATCH', headers: rep, body: allowed });
    },
    listMyMemberships: () => authed(`community_memberships?user_id=eq.${q(session?.user?.id || '')}&select=membership_state,community:communities!community_id(id,name,kind,module_id)`),
    listMyRepModules: () => authed(`module_representatives?user_id=eq.${q(session?.user?.id || '')}&active=eq.true&select=module:modules!module_id(code,name)`),
    // ---- Stage 2: feed ----
    listPosts: (limit = 50) => authed(`posts?select=${POST_SELECT}&order=created_at.desc&limit=${limit}`),
    // Fallback used if the embedded select above is rejected: same result shape, built from flat queries.
    listPostsFlat: async (limit = 50) => {
      const posts = await authed(`posts?select=id,author_id,community_id,content_kind,label,body,visibility,created_at&order=created_at.desc&limit=${limit}`);
      if (posts.error || !posts.data?.length) return posts;
      const ids = posts.data.map(r => r.id).join(',');
      const [comments, reactions, media] = await Promise.all([
        authed(`post_comments?post_id=in.(${ids})&select=id,post_id,author_id,body,created_at&order=created_at.asc`),
        authed(`post_reactions?post_id=in.(${ids})&select=post_id,user_id`),
        authed(`post_media?post_id=in.(${ids})&select=id,post_id,storage_path,alt_text,approval_state&order=created_at.asc`)
      ]);
      const people = [...new Set([...posts.data.map(r => r.author_id), ...(comments.data || []).map(c => c.author_id)])].join(',');
      const profs = await authed(`profiles?id=in.(${people})&select=id,display_name,username,role`);
      const byId = Object.fromEntries((profs.data || []).map(r => [r.id, r]));
      const data = posts.data.map(r => ({
        ...r, author: byId[r.author_id] || null, community: null,
        post_media: (media.data || []).filter(m => m.post_id === r.id),
        post_comments: (comments.data || []).filter(c => c.post_id === r.id).map(c => ({ ...c, author: byId[c.author_id] || null })),
        post_reactions: (reactions.data || []).filter(x => x.post_id === r.id)
      }));
      return { data, error: null };
    },
    createPost: ({ body, communityId, label, visibility }) => authed('posts', { method: 'POST', headers: rep, body: { author_id: session?.user?.id, community_id: communityId || null, body, label: label || 'community', visibility: visibility || (communityId ? 'verified_members' : 'public') } }),
    addReaction: (postId) => authed('post_reactions', { method: 'POST', body: { post_id: postId, user_id: session?.user?.id, reaction: 'like' } }),
    removeReaction: (postId) => authed(`post_reactions?post_id=eq.${q(postId)}&user_id=eq.${q(session?.user?.id || '')}&reaction=eq.like`, { method: 'DELETE' }),
    addComment: (postId, body) => authed('post_comments', { method: 'POST', headers: rep, body: { post_id: postId, author_id: session?.user?.id, body } }),

    // ---- Stage 3: social graph, messaging and safety ----
    getProfileById: (userId) => authed(`profiles?id=eq.${q(userId)}&select=id,display_name,username,role,residence,bio,avatar_url,discoverable,created_at`),
    findProfile: async (name) => {
      const exact = String(name || '').trim();
      if (!exact) return { data: [], error: null };
      const encoded = q(exact);
      return authed(`profiles?display_name=eq.${encoded}&select=id,display_name,username,role,residence,bio,avatar_url,discoverable,created_at&limit=1`);
    },
    listMyFriendships: () => authed(`friendships?or=(user_a.eq.${q(session?.user?.id || '')},user_b.eq.${q(session?.user?.id || '')})&select=user_a,user_b,requested_by,status,created_at,updated_at&order=updated_at.desc`),
    createFriendRequest: (otherId) => {
      const me = session?.user?.id || '';
      const a = me < otherId ? me : otherId, b = me < otherId ? otherId : me;
      return authed('friendships', { method: 'POST', headers: rep, body: { user_a: a, user_b: b, requested_by: me, status: 'pending' } });
    },
    respondFriendship: (otherId, status) => {
      const me = session?.user?.id || '';
      const a = me < otherId ? me : otherId, b = me < otherId ? otherId : me;
      return authed(`friendships?user_a=eq.${q(a)}&user_b=eq.${q(b)}`, { method: 'PATCH', headers: rep, body: { status } });
    },
    cancelFriendRequest: (otherId) => {
      const me = session?.user?.id || '';
      const a = me < otherId ? me : otherId, b = me < otherId ? otherId : me;
      return authed(`friendships?user_a=eq.${q(a)}&user_b=eq.${q(b)}&requested_by=eq.${q(me)}&status=eq.pending`, { method: 'DELETE' });
    },
    listMyBlocks: () => authed(`user_blocks?blocker_id=eq.${q(session?.user?.id || '')}&select=blocked_id,created_at&order=created_at.desc`),
    listMessages: (otherId, limit = 100) => {
      const me = session?.user?.id || '';
      return authed(`direct_messages?or=(and(sender_id.eq.${q(me)},recipient_id.eq.${q(otherId)}),and(sender_id.eq.${q(otherId)},recipient_id.eq.${q(me)}))&select=id,sender_id,recipient_id,body,created_at&order=created_at.asc&limit=${limit}`);
    },
    sendMessage: (recipientId, body) => authed('direct_messages', { method: 'POST', headers: rep, body: { recipient_id: recipientId, body } }),
    listMyReports: () => authed(`reports?select=id,reporter_id,target_type,target_id,target_user_id,community_id,reason,details,snapshot,status,resolved_by,resolved_at,created_at&order=created_at.desc&limit=100`),
    resolveReport: (reportId, outcome, note) => rpc('resolve_report', { p_report: reportId, p_outcome: outcome, p_note: note || null }),
    moderateContent: (targetType, targetId, newState, note) => rpc('moderate_content', { p_target_type: targetType, p_target: targetId, p_new_state: newState, p_note: note || null }),
    followCommunity: (communityId) => authed('community_memberships', { method: 'POST', body: { user_id: session?.user?.id, community_id: communityId, membership_state: 'following' } }),
    unfollowCommunity: (communityId) => authed(`community_memberships?user_id=eq.${q(session?.user?.id || '')}&community_id=eq.${q(communityId)}&membership_state=eq.following`, { method: 'DELETE' }),

    // ---- Stage 4: events / RSVPs ----
    listEvents: (limit = 100) => authed(`events?select=id,community_id,kind,title,description,location,starts_at,ends_at,capacity,status,trust_label,proposed_by,created_at,community:communities!community_id(id,name,kind)&status=in.(approved,proposed)&starts_at=gte.${encodeURIComponent(new Date().toISOString())}&order=starts_at.asc&limit=${limit}`),
    createEvent: (payload) => authed('events', { method: 'POST', headers: rep, body: payload }),
    reviewEvent: (eventId, approve) => rpc('review_event', { p_event: eventId, p_approve: approve }),
    listMyEventRsvps: () => authed(`event_rsvps?user_id=eq.${q(session?.user?.id || '')}&select=event_id,status,created_at`),
    saveEventRsvp: (eventId, status = 'going') => authed('event_rsvps', { method: 'POST', headers: rep, body: { event_id: eventId, user_id: session?.user?.id, status } }),
    updateEventRsvp: (eventId, status) => authed(`event_rsvps?event_id=eq.${q(eventId)}&user_id=eq.${q(session?.user?.id || '')}`, { method: 'PATCH', headers: rep, body: { status } }),
    removeEventRsvp: (eventId) => authed(`event_rsvps?event_id=eq.${q(eventId)}&user_id=eq.${q(session?.user?.id || '')}`, { method: 'DELETE' }),
    eventGoingCount: (eventId) => rpc('event_going_count', { p_event: eventId }),

    // ---- Stage 4: opportunities / applications ----
    listOpportunities: (limit = 100) => authed(`opportunities?select=id,provider_community_id,kind,title,summary,value_label,eligibility,required_documents,location_type,apply_url,closes_at,review_state,trust_label,created_by,created_at,provider:communities!provider_community_id(id,name,kind)&review_state=eq.published&order=closes_at.asc.nullslast,created_at.desc&limit=${limit}`),
    listMyOpportunitySaves: () => authed(`opportunity_saves?user_id=eq.${q(session?.user?.id || '')}&select=opportunity_id,created_at`),
    saveOpportunity: (opportunityId) => authed('opportunity_saves', { method: 'POST', headers: rep, body: { opportunity_id: opportunityId, user_id: session?.user?.id } }),
    unsaveOpportunity: (opportunityId) => authed(`opportunity_saves?opportunity_id=eq.${q(opportunityId)}&user_id=eq.${q(session?.user?.id || '')}`, { method: 'DELETE' }),
    listMyApplications: () => authed(`opportunity_applications?applicant_id=eq.${q(session?.user?.id || '')}&select=id,opportunity_id,portfolio_share_id,status,created_at&order=created_at.desc`),
    applyOpportunity: (opportunityId, portfolioShareId = null) => authed('opportunity_applications', { method: 'POST', headers: rep, body: { opportunity_id: opportunityId, applicant_id: session?.user?.id, portfolio_share_id: portfolioShareId, status: 'submitted' } }),
    withdrawApplication: (applicationId) => authed(`opportunity_applications?id=eq.${q(applicationId)}&applicant_id=eq.${q(session?.user?.id || '')}&status=eq.submitted`, { method: 'PATCH', headers: rep, body: { status: 'withdrawn' } }),
    submitOpportunity: (payload) => authed('opportunities', { method: 'POST', headers: rep, body: payload }),
    reviewOpportunity: (opportunityId, approve, trustLabel = 'verified') => rpc('review_opportunity', { p_opportunity: opportunityId, p_approve: approve, p_trust_label: trustLabel }),

    // ---- Stage 4: bookings ----
    listBookableResources: (kind = null) => authed(`bookable_resources?select=id,community_id,kind,name,description,host_id,capacity,auto_confirm,active,created_at${kind ? `&kind=eq.${q(kind)}` : ''}&order=name.asc`),
    listMyBookings: () => authed(`bookings?user_id=eq.${q(session?.user?.id || '')}&select=id,resource_id,starts_at,ends_at,purpose,status,decided_by,decided_at,created_at,resource:bookable_resources!resource_id(id,kind,name,description,capacity,auto_confirm)&order=starts_at.asc`),
    createBooking: (payload) => authed('bookings', { method: 'POST', headers: rep, body: { ...payload, user_id: session?.user?.id } }),
    cancelBooking: (bookingId) => authed(`bookings?id=eq.${q(bookingId)}&user_id=eq.${q(session?.user?.id || '')}&status=in.(requested,confirmed)`, { method: 'PATCH', headers: rep, body: { status: 'cancelled' } }),
    decideBooking: (bookingId, approve) => rpc('decide_booking', { p_booking: bookingId, p_approve: approve }),

    // ---- Stage 4: portfolio / credentials ----
    listMyCredentials: () => authed(`credentials?holder_id=eq.${q(session?.user?.id || '')}&state=eq.active&select=id,kind,title,issuer_community_id,issued_at,expires_at,issuer:communities!issuer_community_id(id,name,kind)&order=issued_at.desc`),
    listMyPortfolioItems: () => authed(`portfolio_items?owner_id=eq.${q(session?.user?.id || '')}&select=id,item_kind,title,description,credential_id,visibility,created_at,credential:credentials!credential_id(id,title,state,issued_at)&order=created_at.desc`),
    createPortfolioItem: (payload) => authed('portfolio_items', { method: 'POST', headers: rep, body: { ...payload, owner_id: session?.user?.id } }),
    updatePortfolioItem: (id, payload) => authed(`portfolio_items?id=eq.${q(id)}&owner_id=eq.${q(session?.user?.id || '')}`, { method: 'PATCH', headers: rep, body: payload }),
    deletePortfolioItem: (id) => authed(`portfolio_items?id=eq.${q(id)}&owner_id=eq.${q(session?.user?.id || '')}`, { method: 'DELETE' }),
    listMyPortfolioShares: () => authed(`portfolio_shares?owner_id=eq.${q(session?.user?.id || '')}&select=id,audience_label,include_identity,expires_at,revoked_at,created_at&order=created_at.desc`),
    createPortfolioShare: (itemIds, audience = null, ttlHours = 72, includeIdentity = false) => rpc('create_portfolio_share', { p_item_ids: itemIds, p_audience: audience, p_ttl_hours: ttlHours, p_include_identity: includeIdentity }),
    revokePortfolioShare: (shareId) => authed(`portfolio_shares?id=eq.${q(shareId)}&owner_id=eq.${q(session?.user?.id || '')}&revoked_at=is.null`, { method: 'PATCH', headers: rep, body: { revoked_at: new Date().toISOString() } }),

    // ---- Stage 4: notifications ----
    listMyNotifications: (limit = 80) => authed(`notifications?recipient_id=eq.${q(session?.user?.id || '')}&select=id,source_community_id,notification_type,title,body,entity_type,entity_id,read_at,created_at&order=created_at.desc&limit=${limit}`),
    markNotificationRead: (id) => authed(`notifications?id=eq.${q(id)}&recipient_id=eq.${q(session?.user?.id || '')}`, { method: 'PATCH', headers: rep, body: { read_at: new Date().toISOString() } }),
    markAllNotificationsRead: async () => {
      const uid = session?.user?.id || '';
      if (!uid) return { data: null, error: { code: 'NOT_AUTHENTICATED', message: 'You are not signed in.' } };
      return authed(`notifications?recipient_id=eq.${q(uid)}&read_at=is.null`, { method: 'PATCH', headers: rep, body: { read_at: new Date().toISOString() } });
    },

    // ---- Stage 4: private media storage ----
    uploadPrivateMedia: async (bucket, path, file) => {
      if (!session) return { data: null, error: { code: 'NOT_AUTHENTICATED', message: 'You are not signed in.' } };
      const token = await getAccessToken();
      const value = config();
      try {
        const response = await fetch(`${value.url.replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { apikey: value.publishableKey, Authorization: `Bearer ${token}`, 'x-upsert': 'false', 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        const text = await response.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) {}
        if (!response.ok) return { data: null, error: { code: `HTTP_${response.status}`, status: response.status, message: data?.message || data?.error || 'Media upload failed.' } };
        return { data, error: null };
      } catch (error) { return { data: null, error: { code: 'NETWORK_ERROR', message: 'The Veya media service could not be reached.', details: error } }; }
    },
    createPostMedia: (payload) => authed('post_media', { method: 'POST', headers: rep, body: payload }),
    reviewPostMedia: (mediaId, approve, note = null) => rpc('review_post_media', { p_media: mediaId, p_approve: approve, p_note: note }),
    deletePost: (postId) => authed(`posts?id=eq.${q(postId)}&author_id=eq.${q(session?.user?.id || '')}`, { method: 'DELETE' }),
    deletePrivateMedia: async (bucket, path) => {
      if (!session) return { data: null, error: { code: 'NOT_AUTHENTICATED', message: 'You are not signed in.' } };
      const token = await getAccessToken(); const value = config();
      try {
        const response = await fetch(`${value.url.replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE', headers: { apikey: value.publishableKey, Authorization: `Bearer ${token}` } });
        const text = await response.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) {}
        if (!response.ok) return { data: null, error: { code: `HTTP_${response.status}`, status: response.status, message: data?.message || data?.error || 'Media delete failed.' } };
        return { data, error: null };
      } catch (error) { return { data: null, error: { code: 'NETWORK_ERROR', message: 'The Veya media service could not be reached.', details: error } }; }
    },
    signedMediaUrl: async (bucket, path, expiresIn = 3600) => {
      if (!session) return { data: null, error: { code: 'NOT_AUTHENTICATED', message: 'You are not signed in.' } };
      const token = await getAccessToken(); const value = config();
      try {
        const response = await fetch(`${value.url.replace(/\/$/, '')}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { apikey: value.publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn }) });
        const text = await response.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) {}
        if (!response.ok) return { data: null, error: { code: `HTTP_${response.status}`, status: response.status, message: data?.message || data?.error || 'Could not sign media URL.' } };
        const signedPath = data?.signedURL || data?.signedUrl || data?.path;
        let signedUrl = null;
        if (signedPath) {
          if (String(signedPath).startsWith('http')) signedUrl = signedPath;
          else if (String(signedPath).startsWith('/storage/v1/')) signedUrl = `${value.url.replace(/\/$/, '')}${signedPath}`;
          else signedUrl = `${value.url.replace(/\/$/, '')}/storage/v1/${String(signedPath).replace(/^\//, '')}`;
        }
        return { data: signedUrl ? { url: signedUrl } : data, error: null };
      } catch (error) { return { data: null, error: { code: 'NETWORK_ERROR', message: 'The Veya media service could not be reached.', details: error } }; }
    }
  };

  window.VeyaBackend = VeyaBackend;
})();
