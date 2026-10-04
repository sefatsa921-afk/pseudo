// Stage 2 integration test: loads the real www/index.html in jsdom against an in-memory fake Supabase.
// Run:  cd tests && npm install && npm test        (or: node live-mode.test.mjs  with jsdom installed)
// This proves the app's own logic (sessions, mapping, optimistic updates, rollback, demo isolation).
// It does NOT prove your real Supabase project accepts the requests: that is what the manual checks are for.
import pkg from 'jsdom';
const { JSDOM, VirtualConsole } = pkg;
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(here, '..', 'www', 'index.html');
const UID = '11111111-1111-4111-8111-111111111111';
const KORA = '22222222-2222-4222-8222-222222222222';
const ACC = '33333333-3333-4333-8333-333333333333';
const PEER = '44444444-4444-4444-8444-444444444444';
const P1 = '55555555-5555-4555-8555-555555555551';
const P2 = '55555555-5555-4555-8555-555555555552';

// ---------- fake Supabase ----------
function makeServer(opts = {}) {
  const s = {
    log: [], tokenN: 0, goodRefresh: new Set(), refreshFails: false,
    profile: opts.noProfile ? null : { id: UID, display_name: 'Thandi Mokoena', username: null, role: 'student', residence: null, bio: null, avatar_url: null, discoverable: true, created_at: '2026-09-01T10:00:00Z' },
    memberships: [{ membership_state: 'verified_member', community: { id: KORA, name: 'Kora House', kind: 'house', module_id: null } }],
    reactions: [{ post_id: P1, user_id: PEER }],
    comments: [{ id: 'c1', post_id: P1, author_id: PEER, body: 'See you there', created_at: '2026-10-03T08:00:00Z', author: { display_name: 'Sipho Dube' } }],
    posts: [
      { id: P1, author_id: PEER, community_id: KORA, content_kind: 'post', label: 'community', body: 'Braai on Friday', visibility: 'verified_members', created_at: new Date(Date.now() - 12 * 60000).toISOString(), author: { display_name: 'Sipho Dube', username: 'sipho', role: 'student' }, community: { name: 'Kora House', kind: 'house' }, post_media: [] },
      { id: P2, author_id: PEER, community_id: ACC, content_kind: 'post', label: 'academic', body: 'Tutorial 4 is up', visibility: 'public', created_at: new Date(Date.now() - 3600000).toISOString(), author: null, community: { name: 'ACC201 Accounting', kind: 'module' }, post_media: [] }
    ]
  };
  const json = (status, body) => ({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  s.fetch = async (url, init = {}) => {
    const u = new URL(url); const method = (init.method || 'GET').toUpperCase();
    const h = init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : (init.headers || {});
    const body = init.body ? JSON.parse(init.body) : undefined;
    const path = u.pathname.replace(/^\/(rest|auth)\/v1\//, ''); const area = u.pathname.split('/')[1];
    s.log.push({ method, path, query: u.search, auth: h.authorization || h.Authorization, body });
    if (opts.offline) throw new TypeError('Failed to fetch');
    if (area === 'auth') {
      if (path === 'health') return json(200, { name: 'GoTrue' });
      if (opts.badKey && path === 'token') return json(401, { message: 'Invalid API key' });
      if (path === 'token' && u.searchParams.get('grant_type') === 'refresh_token' && s.refresh429) return json(429, { message: 'Too many requests' });
      if (path === 'token' && u.searchParams.get('grant_type') === 'password') {
        if (body.password !== 'demo123456') return json(400, { error_description: 'Invalid login credentials' });
        s.tokenN++; return json(200, { access_token: 'at' + s.tokenN, refresh_token: 'rt' + s.tokenN, expires_in: 3600, ...(opts.skewedExpiresAt ? { expires_at: 1000 } : {}), user: { id: UID, email: body.email } });
      }
      if (path === 'token') {
        if (s.refreshFails) return json(400, { error_description: 'Invalid Refresh Token' });
        s.tokenN++; return json(200, { access_token: 'at' + s.tokenN, refresh_token: 'rt' + s.tokenN, expires_in: 3600, user: { id: UID, email: 'student@demo.veya' } });
      }
      if (path === 'logout') return json(204);
    }
    if (path === 'communities') return json(200, [{ id: KORA, kind: 'house', name: 'Kora House' }, { id: ACC, kind: 'module', name: 'ACC201 Accounting' }]);
    if (path.startsWith('profiles')) {
      if (s.jwt401) return json(401, { message: 'JWT expired' });
      if (opts.noGrants) return json(403, { code: '42501', message: 'permission denied for table profiles' });
      if (method === 'GET') return json(200, s.profile ? [s.profile] : []);
      if (method === 'POST') { s.profile = { id: body.id, display_name: body.display_name, username: null, role: 'student', bio: null, discoverable: true, created_at: new Date().toISOString() }; return json(201, [s.profile]); }
      if (method === 'PATCH') { if (body.username === 'taken') return json(409, { code: '23505', message: 'duplicate key value' }); Object.assign(s.profile, body); return json(200, [s.profile]); }
    }
    if (path.startsWith('community_memberships')) {
      if (method === 'GET') return json(200, s.memberships);
      if (method === 'POST') { s.memberships.push({ membership_state: 'following', community: { id: body.community_id, name: body.community_id === ACC ? 'ACC201 Accounting' : 'X', kind: 'module' } }); return json(201); }
      if (method === 'DELETE') { s.memberships = s.memberships.filter(m => m.community.id !== u.searchParams.get('community_id').replace('eq.', '')); return json(204); }
    }
    if (path.startsWith('module_representatives')) return json(200, [{ module: { code: 'ACC202', name: 'Accounting' } }]);
    if (path.startsWith('verification_requests')) return json(200, []);
    if (path.startsWith('post_reactions')) {
      if (opts.failReactions) return json(403, { code: '42501', message: 'new row violates row-level security policy' });
      if (method === 'POST') { s.reactions.push({ post_id: body.post_id, user_id: body.user_id }); return json(201); }
      if (method === 'DELETE') { s.reactions = s.reactions.filter(r => !(r.user_id === UID && r.post_id === u.searchParams.get('post_id').replace('eq.', ''))); return json(204); }
    }
    if (path.startsWith('post_comments') && method === 'POST') { const c = { id: 'c' + (s.comments.length + 1), post_id: body.post_id, author_id: body.author_id, body: body.body, created_at: new Date().toISOString(), author: { display_name: s.profile.display_name } }; s.comments.push(c); return json(201, [c]); }
    if (path.startsWith('posts')) {
      if (method === 'POST') { const row = { id: '55555555-5555-4555-8555-5555555555' + (60 + s.posts.length), author_id: body.author_id, community_id: body.community_id, content_kind: 'post', label: body.label, body: body.body, visibility: body.visibility, created_at: new Date().toISOString() }; s.posts.unshift({ ...row, author: { display_name: s.profile.display_name }, community: { name: 'Kora House' }, post_media: [] }); return json(201, [row]); }
      if (opts.embedFails && u.searchParams.get('select').includes('author:')) return json(400, { code: 'PGRST200', message: 'embed failed' });
      if (u.searchParams.get('select').includes('author:')) {
        return json(200, s.posts.map(p => ({ ...p, post_comments: s.comments.filter(c => c.post_id === p.id), post_reactions: s.reactions.filter(r => r.post_id === p.id).map(r => ({ user_id: r.user_id })) })));
      }
      return json(200, s.posts.map(({ author, community, post_media, ...r }) => r));
    }
    return json(404, { message: 'unhandled ' + method + ' ' + path });
  };
  return s;
}

// ---------- app harness ----------
async function startApp(server, storage = {}, { disabled = false } = {}) {
  const vc = new VirtualConsole(); const errors = [];
  vc.on('jsdomError', e => errors.push(String(e.message || e))); vc.on('error', e => errors.push(String(e)));
  // Inline every local <script src> so the page runs from an http:// origin (localStorage needs one) with no loader.
  const www = resolve(here, '..', 'www');
  const html = readFileSync(indexPath, 'utf8')
    .replace(/<link rel="stylesheet"[^>]*>/g, '')
    .replace(/<script src="([^"]+)"><\/script>/g, (_, src) => disabled && src === 'supabase-config.js' ? '<script>window.VEYA_SUPABASE_CONFIG = { enabled: false, url: "", publishableKey: "" };</script>' : '<script>' + readFileSync(resolve(www, src), 'utf8').replace(/<\/script>/g, '<\\/script>') + '</script>');
  const dom = new JSDOM(html, {
    url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = server.fetch; w.Headers = Headers;
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
      Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, v));
    }
  });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window;
  const api = {
    w, errors, dom,
    S: () => w.eval('state'),
    eval: code => w.eval(code),
    wait: async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 15)); } throw new Error('timeout waiting for: ' + fn); },
    click: sel => { const el = w.document.querySelector(sel); assert.ok(el, 'missing ' + sel); el.click(); },
    storage: () => Object.fromEntries(Array.from({ length: w.localStorage.length }, (_, i) => [w.localStorage.key(i), w.localStorage.getItem(w.localStorage.key(i))])),
    signIn: async (email = 'student@demo.veya', pw = 'demo123456') => { w.document.getElementById('authEmail').value = email; w.document.getElementById('authPassword').value = pw; w.document.getElementById('authLoginBtn').click(); }
  };
  await new Promise(r => setTimeout(r, 80));
  return api;
}

let passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } }

console.log('Stage 2 live-mode tests');

await test('sign-in builds the user from the profile, loads the real feed, and fires exactly one login request', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  assert.equal(a.errors.length, 0, 'startup errors: ' + a.errors.join(' | '));
  await a.signIn();
  await a.wait(() => a.S().user?.live);
  const S = a.S();
  assert.equal(S.user.name, 'Thandi Mokoena'); assert.equal(S.user.alias, 'Thandi M.'); assert.equal(S.user.userType, 'student');
  assert.deepEqual(Array.from(S.user.repOf), ['ACC202']);
  assert.equal(S.verified, true, 'verified comes from memberships');
  assert.equal(srv.log.filter(r => r.path === 'token').length, 1, 'login button must not double-fire');
  await a.wait(() => S.posts.length === 2);
  const braai = S.posts.find(p => p.body === 'Braai on Friday');
  assert.equal(braai.author, 'Sipho Dube'); assert.equal(braai.likes, 1); assert.equal(braai.reacted, false); assert.equal(braai.comments.length, 1);
  const acad = S.posts.find(p => p.kind === 'academic'); assert.equal(acad.author, 'Campus member'); assert.equal(acad.module, 'ACC201 Accounting');
  assert.ok(!S.posts.some(p => p.body.includes('Golden hour')), 'no demo posts in live feed');
  await a.wait(() => a.w.document.querySelector('.post'));            // skeleton shows for ~450 ms after sign-in
  assert.match(a.w.document.getElementById('mainContent').textContent, /Braai on Friday/);
  assert.equal(a.errors.length, 0, 'runtime errors: ' + a.errors.join(' | '));
});

await test('wrong password shows an error and stays signed out', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  await a.signIn('student@demo.veya', 'wrongpass1');
  await a.wait(() => /Wrong email or password/.test(a.w.document.getElementById('toastRoot').textContent));
  assert.equal(a.S().user, null);
});

await test('first sign-in with no profile row creates one', async () => {
  const srv = makeServer({ noProfile: true }); const a = await startApp(srv);
  await a.signIn('new.student@demo.veya');
  await a.wait(() => a.S().user?.live);
  assert.equal(srv.profile.display_name, 'New Student');
  assert.ok(srv.log.some(r => r.method === 'POST' && r.path === 'profiles'));
});

await test('like / unlike goes to the backend with the user token and the count updates', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().posts.length === 2);
  const lid = a.S().posts.find(p => p.body === 'Braai on Friday').id;
  await a.eval(`reactToPost(${lid})`);
  assert.equal(a.S().posts.find(p => p.id === lid).likes, 2);
  const post = srv.log.find(r => r.method === 'POST' && r.path === 'post_reactions');
  assert.equal(post.body.user_id, UID); assert.equal(post.body.post_id, P1); assert.equal(post.auth, 'Bearer at1');
  await a.eval(`reactToPost(${lid})`);
  assert.equal(a.S().posts.find(p => p.id === lid).likes, 1);
  assert.ok(srv.log.some(r => r.method === 'DELETE' && r.path === 'post_reactions'));
});

await test('a rejected like rolls back and tells the user', async () => {
  const srv = makeServer({ failReactions: true }); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().posts.length === 2);
  const lid = a.S().posts.find(p => p.body === 'Braai on Friday').id;
  await a.eval(`reactToPost(${lid})`);
  const p = a.S().posts.find(x => x.id === lid);
  assert.equal(p.likes, 1); assert.equal(p.reacted, false);
  assert.match(a.w.document.getElementById('toastRoot').textContent, /not allowed/i);
});

await test('comment and new post are saved to the backend and appear in the feed', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().posts.length === 2);
  const lid = a.S().posts.find(p => p.body === 'Braai on Friday').id;
  await a.wait(() => a.w.document.getElementById('comment-input-' + lid));
  const input = a.w.document.getElementById('comment-input-' + lid); assert.ok(input, 'comment box shown for verified user');
  input.value = 'Count me in'; await a.eval(`addComment(${lid})`);
  assert.equal(srv.comments.at(-1).body, 'Count me in'); assert.equal(srv.comments.at(-1).author_id, UID);
  assert.equal(a.S().posts.find(p => p.id === lid).comments.at(-1).author, 'Thandi M.');
  a.w.document.getElementById('newPostText').value = 'Study group at 7'; await a.eval('createPost()');
  const created = srv.log.find(r => r.method === 'POST' && r.path === 'posts');
  assert.equal(created.body.community_id, KORA); assert.equal(created.body.visibility, 'verified_members'); assert.equal(created.body.label, 'community'); assert.equal(created.body.author_id, UID);
  assert.equal(a.S().posts[0].body, 'Study group at 7'); assert.equal(a.S().posts[0].author, 'Thandi M.');
});

await test('follow / unfollow a real community hits the backend; demo-only pages stay local', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().posts.length === 2);
  await a.eval(`toggleSubscription('ACC201 Accounting')`);
  assert.ok(a.S().subscriptions.includes('ACC201 Accounting'));
  assert.ok(srv.log.some(r => r.method === 'POST' && r.path === 'community_memberships' && r.body.community_id === ACC && r.body.membership_state === 'following'));
  await a.eval(`toggleSubscription('ACC201 Accounting')`);
  assert.ok(!a.S().subscriptions.includes('ACC201 Accounting'));
  const before = srv.log.length; await a.eval(`toggleSubscription('Study Hub')`);
  assert.equal(srv.log.length, before, 'Study Hub is not a backend community');
});

await test('profile edits: name, username (and a taken username is refused), discoverable', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().user?.live);
  a.w.eval(`state.page = 'settings'; renderApp();`);
  a.w.document.getElementById('pfName').value = 'Thandi Dube'; a.w.document.getElementById('pfBio').value = 'Accounting, Kora House';
  a.click('[data-action="save-profile"]');
  await a.wait(() => srv.profile.display_name === 'Thandi Dube');
  assert.equal(srv.profile.bio, 'Accounting, Kora House'); assert.equal(a.S().user.alias, 'Thandi D.');
  a.w.document.getElementById('pfUser').value = 'thandi.m'; a.click('[data-action="save-username"]');
  await a.wait(() => srv.profile.username === 'thandi.m');
  a.w.document.getElementById('pfUser').value = 'taken'; a.click('[data-action="save-username"]');
  await a.wait(() => /taken/i.test(a.w.document.getElementById('toastRoot').textContent));
  assert.equal(srv.profile.username, 'thandi.m');
  const patch = srv.log.filter(r => r.method === 'PATCH');
  assert.ok(patch.every(r => Object.keys(r.body).every(k => ['display_name', 'username', 'bio', 'discoverable'].includes(k))), 'never sends role/residence');
});

await test('the access token is refreshed before it expires and the new token is used', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().user?.live);
  const stored = JSON.parse(a.storage()['veya-session-v1']); stored.expires_at = Math.floor(Date.now() / 1000) + 10;
  a.w.localStorage.setItem('veya-session-v1', JSON.stringify(stored));
  await a.w.eval(`VeyaBackend.auth.restoreSession()`);            // re-reads storage like an app restart would
  await a.wait(() => srv.log.some(r => r.path === 'token' && r.query.includes('refresh_token')));
  await a.wait(() => a.w.veyaAccessToken === 'at2');
  await a.eval(`VeyaBackend.getMyProfile()`);
  assert.equal(srv.log.filter(r => r.path.startsWith('profiles')).at(-1).auth, 'Bearer at2');
});

await test('restart restores the session and the live data without asking for a password', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().posts.length === 2);
  const saved = a.storage();
  const logins = srv.log.filter(r => r.path === 'token' && r.query.includes('password')).length;
  const b = await startApp(srv, saved);
  await b.wait(() => b.S().user?.live && b.S().posts.length === 2);
  assert.equal(b.S().user.name, 'Thandi Mokoena');
  assert.equal(srv.log.filter(r => r.path === 'token' && r.query.includes('password')).length, logins, 'no second password login');
  assert.ok(!JSON.stringify(JSON.parse(saved['veya-campus-prototype-v6']).posts).includes('Braai'), 'live posts are never written into the demo copy');
});

await test('an expired / revoked session sends you back to sign-in', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().user?.live);
  const saved = a.storage(); const s = JSON.parse(saved['veya-session-v1']); s.expires_at = 1; saved['veya-session-v1'] = JSON.stringify(s);
  srv.refreshFails = true;
  const b = await startApp(srv, saved);
  await b.wait(() => b.S().user === null && b.w.document.getElementById('loginScreen').style.display !== 'none');
  assert.equal(b.storage()['veya-session-v1'], undefined);
});

await test('offline at start: keeps the stored session, shows sign-in with a message, no fake live data', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().user?.live);
  const saved = a.storage();
  const b = await startApp(makeServer({ offline: true }), saved);
  await b.wait(() => /offline/i.test(b.w.document.getElementById('toastRoot').textContent));
  assert.equal(b.S().user, null); assert.ok(b.storage()['veya-session-v1'], 'session kept');
});

await test('sign-out clears the session and brings the fictional demo back untouched', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().posts.length === 2);
  await a.eval('logout()');
  await a.wait(() => a.S().user === null);
  assert.equal(a.storage()['veya-session-v1'], undefined); assert.equal(a.w.veyaAccessToken, '');
  assert.ok(srv.log.some(r => r.path === 'logout'));
  assert.ok(a.S().posts.some(p => /Golden hour/.test(p.body)), 'demo posts restored');
  a.click('[data-demo-role="student"]'); assert.equal(a.S().user.name, 'Amara Ndlovu');
  assert.ok(a.S().posts.some(p => /Golden hour/.test(p.body)));
});

await test('if the embedded feed query is rejected, the flat fallback still loads the feed', async () => {
  const srv = makeServer({ embedFails: true }); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().posts.length === 2);
  assert.ok(a.S().posts.some(p => p.body === 'Braai on Friday'));
});

await test('a warden account gets the admin view, with the role read from the profile (not guessed from the email)', async () => {
  const srv = makeServer(); srv.profile.role = 'warden'; srv.profile.display_name = 'Maya Khumalo';
  const a = await startApp(srv);
  await a.signIn('someone.else@demo.veya');                          // email contains no "warden": role must come from profiles.role
  await a.wait(() => a.S().user?.live);
  assert.equal(a.S().user.userType, 'warden'); assert.equal(a.S().user.role, 'Residence Warden'); assert.equal(a.S().page, 'admin-overview');
  await a.wait(() => /admin|overview|Verification|queue/i.test(a.w.document.getElementById('mainContent').textContent));
  assert.equal(a.errors.length, 0, a.errors.join(' | '));
});

await test('with no backend configured the fictional demo works exactly as before', async () => {
  const srv = makeServer(); const a = await startApp(srv, {}, { disabled: true });
  assert.equal(a.errors.length, 0, a.errors.join(' | '));
  a.click('[data-demo-role="student"]');
  assert.equal(a.S().user.name, 'Amara Ndlovu'); assert.ok(!a.S().user.live);
  await a.eval('reactToPost(1)'); assert.equal(a.S().posts.find(p => p.id === 1).reacted, true);
  await a.signIn(); await new Promise(r => setTimeout(r, 100));
  assert.match(a.w.document.getElementById('toastRoot').textContent, /not configured/i);
  assert.equal(srv.log.length, 0, 'no network calls in demo mode');
});

await test('a missing table GRANT is reported as a setup problem (pointing at grants.sql), and nothing half-signs-in', async () => {
  const srv = makeServer({ noGrants: true }); const a = await startApp(srv);
  await a.signIn();
  await a.wait(() => /grants\.sql/.test(a.w.document.getElementById('toastRoot').textContent));
  assert.match(a.w.document.getElementById('toastRoot').textContent, /profiles/);
  await a.wait(() => !a.S().user);
  assert.equal(a.S().user, null);
});

await test('a rejected app key says so (and offers the connection check) instead of claiming the session ended', async () => {
  const srv = makeServer({ badKey: true }); const a = await startApp(srv);
  await a.signIn();
  await a.wait(() => /rejected this app's key/i.test(a.w.document.getElementById('toastRoot').textContent));
  assert.doesNotMatch(a.w.document.getElementById('toastRoot').textContent, /session ended/i);
  assert.equal(a.S().user, null);
});

await test('a phone clock that is wrong (server expires_at far in the past) does NOT cause a refresh storm', async () => {
  const srv = makeServer({ skewedExpiresAt: true }); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().posts.length === 2);
  await a.eval('VeyaBackend.getMyProfile()'); await a.eval('VeyaBackend.getMyProfile()');
  assert.equal(srv.log.filter(r => r.path === 'token' && r.query.includes('refresh_token')).length, 0, 'no refresh calls');
  assert.ok(a.S().user?.live);
});

await test('a rate-limited (429) refresh keeps the saved login instead of signing you out', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().user?.live);
  const saved = a.storage(); const sess = JSON.parse(saved['veya-session-v1']); sess.expires_at = 1; saved['veya-session-v1'] = JSON.stringify(sess);
  srv.refresh429 = true;
  const b = await startApp(srv, saved);
  await new Promise(r => setTimeout(r, 400));
  assert.ok(b.storage()['veya-session-v1'], 'saved login must survive a 429');
  assert.doesNotMatch(b.w.document.getElementById('toastRoot').textContent, /session ended/i);
});

await test('a 401 that survives a refresh is described as a rejected token, and does not log you out', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  await a.signIn(); await a.wait(() => a.S().user?.live);
  srv.jwt401 = true;
  const text = await a.w.eval(`VeyaBackend.getMyProfile().then(r => VeyaLive._friendly(r.error))`);
  assert.match(text, /rejected your login token \(JWT expired\)/);
  assert.doesNotMatch(text, /session ended/i);
  assert.ok(a.storage()['veya-session-v1'], 'still signed in locally');
});

await test('the same warning is not toasted again within a minute (no 30-second nagging)', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  await a.eval(`showToast('You appear to be offline. Try again.'); showToast('You appear to be offline. Try again.'); showToast('You appear to be offline. Try again.')`);
  const count = (a.w.document.getElementById('toastRoot').textContent.match(/You appear to be offline/g) || []).length;
  assert.equal(count, 1);
});

await test('the Connection check button reports config, key type and what the phone can reach', async () => {
  const srv = makeServer(); const a = await startApp(srv);
  a.click('#authDiagBtn');
  await a.wait(() => /Auth service/.test(a.w.document.getElementById('authDiagOut').textContent));
  const out = a.w.document.getElementById('authDiagOut').textContent;
  assert.match(out, /Config: present/); assert.match(out, /Key type:/); assert.match(out, /Database \(public list\)/);
  assert.ok(!/sb_publishable_/.test(out), 'never prints the key itself');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
process.exit(process.exitCode || 0);
