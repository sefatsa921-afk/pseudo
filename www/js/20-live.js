/**
 * Stage 2 - live mode.
 *
 * When the backend is configured AND the user has a real Supabase session:
 *   - the signed-in person comes from profiles (name, role, username, bio), not a demo card
 *   - the feed, reactions, comments, posting and follows go to Supabase
 *   - the session is stored on the device and refreshed automatically
 * Otherwise nothing here runs and the fictional localStorage demo behaves exactly as before.
 *
 * Plain script (no strict mode): it deliberately re-assigns a few global functions from the
 * earlier scripts (reactToPost, addComment, createPost, ...) so the demo code stays untouched.
 */
(function () {
  const B = window.VeyaBackend;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const HOME_COMMUNITY = 'Kora House';
  const REFRESH_MS = 30000;
  // Demo-only fields swapped out while saving, so live data never leaks into the offline demo copy.
  const SWAP_FIELDS = ['posts', 'subscriptions', 'verified', 'verifiedScope', 'verificationNotice', 'pendingVerification', 'pendingRequest', 'profile',
    'social', 'blocked', 'reports', 'hiddenPosts'];

  const live = {
    active: false, myId: null, snapshot: null, timer: null, busy: false,
    communities: [], followed: new Set(), idToLocal: new Map(), localToId: new Map(), nextLocal: 1000000, warnedFeed: false
  };

  const ROLE_TYPE = { student: 'student', lecturer: 'student', warden: 'warden', committee: 'committee', moderator: 'committee', admin: 'committee' };
  const ROLE_LABEL = { student: 'Student', lecturer: 'Lecturer', warden: 'Residence Warden', committee: 'House Committee', moderator: 'Moderator', admin: 'Administrator' };
  const ROLE_TONE = { warden: 'blue', committee: 'coral', moderator: 'coral', admin: 'coral' };

  function isLive() { return live.active && Boolean(B?.isConfigured?.() && B.auth.isSignedIn()); }

  // ---------- small helpers ----------
  function friendly(error) {
    if (!error) return 'Something went wrong.';
    const text = `${error.message || ''} ${error.details?.message || ''} ${error.details?.code || ''}`;
    if (error.code === 'NETWORK_ERROR') return 'You appear to be offline. Try again when you have a connection.';
    if (error.code === 'NOT_AUTHENTICATED') return 'Your session ended. Please sign in again.';
    if (error.code === 'HTTP_401') {
      const why = String(error.details?.message || error.message || '').slice(0, 90);
      return error.afterRefresh
        ? `The server rejected your login token${why ? ' (' + why + ')' : ''}. Tap Connection check on the sign-in screen.`
        : `The server did not accept this request${why ? ' (' + why + ')' : ''}.`;
    }
    if (error.code === 'HTTP_404') return 'Backend setup is incomplete (a table or function is missing). Run the latest SQL migration in Supabase.';
    if (error.code === 'HTTP_429') return 'Too many attempts. Wait a minute and try again.';
    if (/^HTTP_5\d\d$/.test(error.code || '')) return 'The server had a problem. Try again in a moment.';
    if (/23505|duplicate key|already exists/i.test(text)) return 'That is already taken.';
    // "permission denied for table X" = a missing GRANT (backend setup), not a row-level-security refusal.
    const grantGap = /permission denied for (table|schema|function) ([\w.]+)/i.exec(text);
    if (grantGap) return `Backend setup is incomplete (no access to ${grantGap[2]}). Run backend/grants.sql in Supabase.`;
    if (error.code === 'HTTP_403' || /42501|row-level security|permission denied/i.test(text)) return 'Your account is not allowed to do that yet.';
    return error.message || 'The backend request failed.';
  }
  // Background loads must not fail silently. Each distinct problem is shown at most once a minute.
  // Plain connectivity failures are skipped: the Live/Offline badge already says so.
  const reportedAt = new Map();
  function reportError(error, area, { force = false } = {}) {
    if (!error || error.code === 'NETWORK_ERROR' || error.code === 'NOT_AUTHENTICATED') return false;
    const key = `${area}|${error.code || error.message}`;
    const now = Date.now();
    if (!force && now - (reportedAt.get(key) || 0) < 60000) return false;
    reportedAt.set(key, now);
    showToast(`${area}: ${friendly(error)}`);
    return true;
  }
  function localIdFor(uuid) {
    if (!live.idToLocal.has(uuid)) { const n = live.nextLocal++; live.idToLocal.set(uuid, n); live.localToId.set(n, uuid); }
    return live.idToLocal.get(uuid);
  }
  function relTime(iso) {
    const t = new Date(iso).getTime();
    if (!t) return '';
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'} ago`;
    const days = Math.round(hrs / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  }
  function aliasOf(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
    return parts[0] ? `${parts[0]} V.` : 'Student V.';
  }
  function nameFromEmail(email) {
    const base = String(email || 'student').split('@')[0].replace(/[^a-zA-Z0-9]+/g, ' ').trim() || 'Student';
    const name = base.replace(/\b\w/g, c => c.toUpperCase());
    return name.length >= 2 ? name.slice(0, 80) : 'Student';
  }
  function communityByName(name) { return live.communities.find(c => c.name === name) || null; }
  function repaint() {
    if (!state.user) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.id !== 'authEmail' && a.id !== 'authPassword') return; // never wipe what someone is typing
    renderApp();
  }

  // ---------- snapshot: keep demo data separate from live data ----------
  function takeSnapshot() {
    if (live.snapshot) return;
    live.snapshot = JSON.parse(JSON.stringify(Object.fromEntries(SWAP_FIELDS.map(k => [k, state[k]]))));
  }
  function restoreSnapshot() {
    if (live.snapshot) Object.assign(state, JSON.parse(JSON.stringify(live.snapshot)));
    live.snapshot = null;
  }
  const baseSave = saveState;
  saveState = function () {
    if (!live.active || !live.snapshot) return baseSave();
    const keep = Object.fromEntries(SWAP_FIELDS.map(k => [k, state[k]]));
    Object.assign(state, live.snapshot);
    try { baseSave(); } finally { Object.assign(state, keep); }
  };

  // ---------- mapping ----------
  function buildUser(profile, repModules) {
    const role = profile.role || 'student';
    return {
      name: profile.display_name, alias: aliasOf(profile.display_name), initials: initials(profile.display_name),
      role: ROLE_LABEL[role] || 'Student', userType: ROLE_TYPE[role] || 'student', tone: ROLE_TONE[role] || 'mint',
      repOf: repModules, live: true, id: profile.id, backendRole: role
    };
  }
  function mapPost(row) {
    const mine = row.author_id === live.myId;
    const authorName = mine ? state.user.alias : (row.author?.display_name || 'Campus member');
    const kind = row.label === 'academic' ? 'academic' : row.label === 'official' ? 'official' : 'community';
    const communityName = row.community?.name || (communityNameById(row.community_id) || '');
    const comments = (row.post_comments || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map(c => ({ author: c.author_id === live.myId ? state.user.alias : (c.author?.display_name || 'Campus member'), text: c.body }));
    const reactions = row.post_reactions || [];
    return {
      id: localIdFor(row.id), liveId: row.id, communityId: row.community_id || null, communityName, mine,
      author: authorName, initials: initials(authorName), kind,
      label: kind === 'academic' ? `${communityName || 'Module'} update` : kind === 'official' ? 'Official update' : (communityName || 'Campus post'),
      module: kind === 'academic' ? communityName : undefined,
      time: relTime(row.created_at), createdAt: row.created_at, body: row.body,
      likes: reactions.length, reacted: reactions.some(r => r.user_id === live.myId),
      saved: (state.liveSaved || []).includes(row.id), comments,
      media: (row.post_media || []).filter(m => ['approved', 'pending'].includes(m.approval_state)).map(m => ({
        id: m.id, storagePath: m.storage_path, approval: m.approval_state, alt: m.alt_text || 'Veya community photo'
      }))
    };
  }
  function communityNameById(id) { return live.communities.find(c => c.id === id)?.name || ''; }

  // ---------- loading ----------
  async function loadCommunities() {
    const res = await B.listCommunities();
    if (!res.error && Array.isArray(res.data)) live.communities = res.data;
  }
  async function loadMemberships() {
    const res = await B.listMyMemberships();
    if (res.error) { reportError(res.error, 'Your memberships'); return false; }
    const rows = res.data || [];
    live.followed = new Set(rows.map(r => r.community?.name).filter(Boolean));
    state.subscriptions = [...live.followed];
    const home = rows.find(r => r.community?.name === HOME_COMMUNITY);
    const verified = Boolean(home && ['verified_member', 'admin'].includes(home.membership_state));
    if (verified) {
      if (!state.verified) { state.verified = true; state.verifiedScope = { ...DEFAULT_VERIFICATION_SCOPE }; }
      state.pendingVerification = false;
    } else if (state.verified) { state.verified = false; state.verifiedScope = null; }
    return true;
  }
  async function loadOwnPendingRequest() {
    if (isAdmin() || state.verified) return;
    const res = await B.authed(`verification_requests?student_id=eq.${encodeURIComponent(live.myId)}&select=id,status,created_at&order=created_at.desc&limit=1`);
    const row = res.data?.[0];
    if (row && row.status === 'pending') {
      state.pendingVerification = true;
      state.pendingRequest = { id: row.id, scope: { ...DEFAULT_VERIFICATION_SCOPE }, requestedAt: row.created_at, scanSource: 'backend' };
    } else if (!row || row.status !== 'pending') { if (state.pendingRequest && UUID_RE.test(state.pendingRequest.id || '')) { state.pendingVerification = false; state.pendingRequest = null; } }
  }
  async function loadFeed() {
    let res = await B.listPosts();
    if (res.error && /HTTP_400|HTTP_404/.test(res.error.code)) res = await B.listPostsFlat();   // embed not accepted: flat fallback
    if (res.error) {
      if (!live.warnedFeed) { live.warnedFeed = true; showToast(`Could not load the live feed. ${friendly(res.error)}`); }
      return false;
    }
    live.warnedFeed = false;
    const mapped = (res.data || []).map(mapPost);
    // Keep any local-only (unsent) posts out; the live feed is the truth.
    state.posts = mapped;
    return true;
  }
  async function refreshAll({ quiet } = {}) {
    if (!isLive() || live.busy) return;
    live.busy = true;
    try {
      const before = JSON.stringify([state.posts.map(p => [p.id, p.likes, p.comments.length]), state.verified, state.subscriptions]);
      await loadMemberships();
      await loadFeed();
      if (window.VeyaStage3?.refresh) await window.VeyaStage3.refresh();
      const after = JSON.stringify([state.posts.map(p => [p.id, p.likes, p.comments.length]), state.verified, state.subscriptions]);
      if (!quiet || before !== after) { saveState(); repaint(); }
    } finally { live.busy = false; }
  }

  // ---------- enter / leave ----------
  async function enterLive() {
    const me = B.auth.user();
    if (!me?.id) return false;
    live.myId = me.id;
    takeSnapshot();
    live.active = true;
    await loadCommunities();

    let prof = await B.getMyProfile();
    if (prof.error?.code === 'NETWORK_ERROR') { live.active = false; restoreSnapshot(); return 'offline'; }
    if (prof.error) { showToast(`Signed in, but your profile could not be loaded. ${friendly(prof.error)}`); }
    let profile = prof.data?.[0];
    if (!profile && !prof.error) {                                   // first sign-in for this account: create the row
      const made = await B.createMyProfile(nameFromEmail(me.email));
      if (made.error) { showToast(`Could not create your profile. ${friendly(made.error)}`); live.active = false; restoreSnapshot(); return false; }
      profile = Array.isArray(made.data) ? made.data[0] : made.data;
    }
    if (!profile) { live.active = false; restoreSnapshot(); return false; }

    const reps = await B.listMyRepModules();
    const repModules = (reps.data || []).map(r => r.module?.code).filter(Boolean);
    state.user = buildUser(profile, repModules);
    state.profile = { ...state.profile, username: profile.username || '', bio: profile.bio || '', discoverable: profile.discoverable !== false };
    if (profile.created_at) state.profile.joined = new Date(profile.created_at).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
    await loadMemberships();
    await loadOwnPendingRequest();
    await loadFeed();
    if (window.VeyaStage3?.refresh) await window.VeyaStage3.refresh();
    saveState();
    startPolling();
    return true;
  }
  function leaveLive() {
    clearInterval(live.timer); live.timer = null;
    const wasActive = live.active;
    live.active = false; live.myId = null; live.communities = []; live.followed = new Set();
    if (wasActive) restoreSnapshot();
  }
  function startPolling() {
    clearInterval(live.timer);
    live.timer = setInterval(() => { if (!document.hidden) refreshAll({ quiet: true }); }, REFRESH_MS);
  }
  window.addEventListener('focus', () => refreshAll({ quiet: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAll({ quiet: true }); });

  function signInMessage(error) {
    const msg = String(error.message || '');
    if (error.code === 'NETWORK_ERROR') return friendly(error);
    if (error.code === 'HTTP_400') return /confirm/i.test(msg) ? 'This email is not confirmed in Supabase yet (Authentication > Users > confirm it).' : /invalid login|credentials/i.test(msg) ? 'Wrong email or password.' : `Sign-in refused: ${msg.slice(0, 100)}`;
    if (error.code === 'HTTP_401' || error.code === 'HTTP_403') return `Supabase rejected this app's key (${msg.slice(0, 60)}). Tap Connection check below.`;
    return friendly(error);
  }
  async function signIn(email, password) {
    if (!B?.isConfigured?.()) return showToast('Backend not configured. Use a demo role card instead.');
    const btn = document.getElementById('authLoginBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
    try {
      const res = await B.auth.signIn(email, password);
      if (res.error) return showToast(signInMessage(res.error));
      const ok = await enterLive();
      if (ok !== true) { await B.auth.signOut(); if (ok === 'offline') showToast('You appear to be offline. Try again with a connection.'); return; }
      state.page = isAdmin() ? 'admin-overview' : 'home';
      state.authEmail = email;
      window.scrollTo(0, 0);
      startSkeleton(450);
      saveState(); renderApp();
      showToast(`Signed in as ${state.user.name}.`);
    } finally { if (btn) { btn.disabled = false; btn.textContent = 'Sign in with test account'; } }
  }

  async function boot() {
    if (!B?.isConfigured?.()) { if (state.user?.live) { state.user = null; saveState(); showLogin(); } return; }
    B.auth.on((type, detail) => {
      if (type === 'signed-out' && detail === 'expired' && live.active) {
        leaveLive();
        state.user = null; baseSave(); showLogin();
        showToast('Your session ended. Please sign in again.');
      }
    });
    const user = await B.auth.restoreSession();
    if (user) {
      const ok = await enterLive();
      if (ok === true) { renderApp(); return; }
      if (ok === 'offline') {            // keep the stored session; just don't pretend demo data is live
        state.user = null; baseSave(); showLogin();
        return showToast('You appear to be offline. Connect and reopen the app to continue.');
      }
    }
    if (state.user?.live) { state.user = null; baseSave(); showLogin(); showToast('Please sign in again.'); }
  }

  // ---------- overrides: posts, reactions, comments, follows ----------
  const baseReact = reactToPost;
  reactToPost = async function (id) {
    if (!isLive()) return baseReact(id);
    const post = state.posts.find(p => p.id === id);
    if (!post?.liveId) return;
    post.reacted = !post.reacted; post.likes += post.reacted ? 1 : -1;
    renderApp();
    if (post.reacted) document.querySelector('.act.like[data-id="' + id + '"]')?.classList.add('pop');
    const res = post.reacted ? await B.addReaction(post.liveId) : await B.removeReaction(post.liveId);
    if (res.error && !/23505|duplicate/i.test(JSON.stringify(res.error.details || ''))) {
      post.reacted = !post.reacted; post.likes += post.reacted ? 1 : -1;
      showToast(friendly(res.error)); renderApp();
    }
  };
  const baseComment = addComment;
  addComment = async function (id) {
    if (!isLive()) return baseComment(id);
    if (!state.verified) return showToast('Residence verification is required to comment.');
    const input = document.getElementById('comment-input-' + id);
    const text = input?.value.trim();
    if (!text) return showToast('Write a comment first.');
    const post = state.posts.find(p => p.id === id);
    if (!post?.liveId) return;
    if (input) input.disabled = true;
    const res = await B.addComment(post.liveId, text);
    if (res.error) { if (input) input.disabled = false; return showToast(friendly(res.error)); }
    post.comments.push({ author: state.user.alias, text });
    renderApp();
    setTimeout(() => document.getElementById('comments-' + id)?.classList.remove('hidden'), 0);
  };
  const baseCreate = createPost;
  createPost = async function () {
    if (!isLive()) return baseCreate();
    if (!state.verified) return showToast('Verify your residence membership first.');
    const input = document.getElementById('newPostText');
    const body = input?.value.trim();
    if (!body) return showToast('Write something before publishing.');
    const home = communityByName(HOME_COMMUNITY);
    if (!home) return showToast('Could not find the Kora House page. Try again in a moment.');
    if (input) input.disabled = true;
    const res = await B.createPost({ body, communityId: home.id, label: 'community', visibility: 'verified_members' });
    if (res.error) { if (input) input.disabled = false; return showToast(friendly(res.error)); }
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    if (row) state.posts.unshift(mapPost({ ...row, community: { name: HOME_COMMUNITY }, post_comments: [], post_reactions: [] }));
    saveState(); showToast('Post published to Kora House.'); renderApp();
  };
  const baseToggleSub = toggleSubscription;
  toggleSubscription = async function (source) {
    const community = isLive() ? communityByName(source) : null;
    if (!community) return baseToggleSub(source);                    // demo-only pages stay local
    const following = state.subscriptions.includes(source);
    if (following) state.subscriptions = state.subscriptions.filter(s => s !== source); else state.subscriptions.push(source);
    renderApp();
    const res = following ? await B.unfollowCommunity(community.id) : await B.followCommunity(community.id);
    if (res.error && !/23505|duplicate/i.test(JSON.stringify(res.error.details || ''))) {
      if (following) state.subscriptions.push(source); else state.subscriptions = state.subscriptions.filter(s => s !== source);
      showToast(friendly(res.error)); return renderApp();
    }
    saveState(); showToast(following ? `Unfollowed ${source}.` : `Following ${source}.`); renderApp();
  };

  // Feed mixes: no fictional promotions next to real posts.
  const baseForYou = forYouItems;
  forYouItems = function () {
    if (!isLive()) return baseForYou();
    const acad = feedPosts().filter(p => p.kind === 'academic'), other = feedPosts().filter(p => p.kind !== 'academic');
    const out = []; let a = 0, o = 0;
    while (a < acad.length || o < other.length) { if (a < acad.length) out.push({ p: acad[a++] }); if (o < other.length) out.push({ p: other[o++] }); }
    return out;
  };
  const baseFollowing = followingItems;
  followingItems = function () {
    if (!isLive()) return baseFollowing();
    return feedPosts().filter(p => p.mine || (p.communityName && isSubscribed(p.communityName))).map(p => ({ p }));
  };
  const baseHandleAction = handleAction;
  handleAction = function (action, button) {
    if (isLive() && action === 'save') {                              // bookmarks are per-device for now
      const p = state.posts.find(i => i.id === Number(button.dataset.id));
      if (p) {
        p.saved = !p.saved;
        const set = new Set(state.liveSaved || []); p.saved ? set.add(p.liveId) : set.delete(p.liveId); state.liveSaved = [...set];
        saveState(); showToast(p.saved ? 'Saved to your bookmarks.' : 'Removed from bookmarks.'); renderApp();
      }
      return;
    }
    return baseHandleAction(action, button);
  };

  // ---------- profile editing ----------
  const baseNewAction = handleNewAction;
  handleNewAction = function (action, b) {
    if (isLive()) {
      if (action === 'save-profile') { liveSaveProfile(); return true; }
      if (action === 'save-username') { liveSaveUsername(); return true; }
      if (action === 'toggle-setting' && b.dataset.key === 'discoverable') { liveToggleDiscoverable(); return true; }
    }
    return baseNewAction(action, b);
  };
  async function liveSaveProfile() {
    const name = val('pfName').trim(), bio = val('pfBio').trim();
    if (name.length < 2) return showToast('Enter your full name.');
    if (bio.length > 500) return showToast('Keep your bio under 500 characters.');
    const res = await B.updateMyProfile({ display_name: name, bio });
    if (res.error) return showToast(friendly(res.error));
    state.user.name = name; state.user.alias = aliasOf(name); state.user.initials = initials(name); state.profile.bio = bio;
    saveState(); showToast('Profile saved.'); renderApp();
  }
  async function liveSaveUsername() {
    const u = val('pfUser').trim().toLowerCase();
    if (!/^[a-z0-9._]{3,20}$/.test(u)) return showToast('Use 3-20 letters, numbers, dots or underscores.');
    const res = await B.updateMyProfile({ username: u });
    if (res.error) return showToast(/taken/i.test(friendly(res.error)) ? 'That username is taken.' : friendly(res.error));
    state.profile.username = u; saveState(); showToast('Username updated to @' + u); renderApp();
  }
  async function liveToggleDiscoverable() {
    const next = !state.profile.discoverable;
    state.profile.discoverable = next; renderApp();
    const res = await B.updateMyProfile({ discoverable: next });
    if (res.error) { state.profile.discoverable = !next; showToast(friendly(res.error)); renderApp(); } else saveState();
  }

  // ---------- sign out ----------
  const baseLogout = logout;
  logout = function () {
    if (live.active) { B.auth.signOut(); leaveLive(); }
    return baseLogout();
  };

  // Background refreshes must not spam the same warning every 30 s.
  const baseToast = showToast, toastSeen = new Map();
  showToast = function (message) {
    const text = String(message || '');
    if (/session|offline|reconnect|Backend setup|could not load|rejected|not accept/i.test(text)) {
      const last = toastSeen.get(text) || 0;
      if (Date.now() - last < 60000) return;
      toastSeen.set(text, Date.now());
    }
    return baseToast(text);
  };

  async function connectionCheck() {
    const out = document.getElementById('authDiagOut'), btn = document.getElementById('authDiagBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Checking...'; }
    try { const text = await B.auth.diagnose(); if (out) { out.textContent = text; out.style.display = 'block'; } }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Connection check'; } }
  }
  document.addEventListener('click', event => { if (event.target?.id === 'authDiagBtn') connectionCheck(); });

  window.VeyaLive = { signIn, boot, refresh: refreshAll, isLive, enter: enterLive, reportError, _state: live, _friendly: friendly };
})();
