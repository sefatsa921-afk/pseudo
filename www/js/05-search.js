/* feed mixing: For you is ~50% course updates, with local businesses mixed in */
function forYouItems() {
  const acad = feedPosts().filter(p => p.kind === 'academic'), other = feedPosts().filter(p => p.kind !== 'academic'), promos = state.promotions.slice();
  const out = []; let a = 0, o = 0, k = 0;
  while (a < acad.length || o < other.length) {
    if (a < acad.length) out.push({ p: acad[a++] });
    if (o < other.length) out.push({ p: other[o++] });
    if (++k % 2 === 0 && promos.length) out.push({ promo: promos.shift() });
  }
  return out.concat(promos.map(promo => ({ promo })));
}
function followingItems() {
  const posts = feedPosts().filter(p => p.kind === 'academic' ? isSubscribed(subjectOf(p)) : isSubscribed(p.author));
  const promos = state.promotions.filter(x => isSubscribed(x.source));
  const out = [];
  posts.forEach((p, i) => { out.push({ p }); if ((i + 1) % 3 === 0 && promos.length) out.push({ promo: promos.shift() }); });
  return out.concat(promos.map(promo => ({ promo })));
}

/* search */
function backendSearchEntries() {
  if (backendPreview.status !== 'ready') return [];
  const entries = [];
  const seenModules = new Set();
  const kindLabel = { campus: 'Campus', residence: 'Residence', house: 'House', society: 'Society', company: 'Company', opportunity: 'Opportunity', module: 'Module' };
  (backendPreview.communities || []).forEach(row => {
    const kind = row.kind || 'campus';
    if (row.module_id) seenModules.add(row.module_id);
    entries.push([row.name, kindLabel[kind] || 'Reference', `${kindLabel[kind] || 'Reference'} page`, initials(row.name), { backend: true, sponsored: !!row.sponsored, verified: !!row.verified_source, profileName: kind === 'module' ? 'Accounting' : row.name }]);
  });
  (backendPreview.modules || []).filter(module => !seenModules.has(module.id)).forEach(module => entries.push([`${module.code} ${module.name}`, 'Module', 'Module reference page', initials(module.code), { backend: true, verified: true, profileName: 'Accounting' }]));
  return entries;
}
function searchableDirectory() {
  const entries = [...DIRECTORY, ...backendSearchEntries()];
  const seen = new Set();
  return entries.filter(entry => {
    const key = String(entry[0]).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function renderSearch(q = '') {
  const panel = document.getElementById('searchPanel'); q = q.trim().toLowerCase();
  const directory = searchableDirectory().filter(d => !isBlocked(d[0]));
  const label = { Profile: 'People', Society: 'Societies', Group: 'Groups', Module: 'Modules', Company: 'Companies', House: 'Houses', Residence: 'Residences', Campus: 'Campus pages', Opportunity: 'Opportunities' };
  const row = d => { const on = state.subscriptions.includes(d[0]); const meta = d[4] || {}; const profileName = meta.profileName || d[0]; const source = meta.backend ? `<em class="search-source">${meta.sponsored ? 'Sponsored · ' : ''}Reference</em>` : ''; return `<div class="sr-row"><span class="sr-ava ${['Profile', 'Group', 'Module'].includes(d[1]) ? '' : 'sq'}" data-profile="${esc(profileName)}">${esc(d[3])}</span><div class="sr-copy" data-profile="${esc(profileName)}"><strong>${esc(d[0])}</strong><span>${esc(d[1])} · ${esc(d[2])}${source}</span></div><button class="btn small ${on ? 'secondary' : ''}" data-follow="${esc(d[0])}">${on ? 'Following' : 'Follow'}</button></div>`; };
  let html = '';
  if (!q) {
    const preferred = ['Culture Circle', 'Study Hub', 'Silo Coffee Co.', 'Hilltop House', 'Drama Society', 'FutureFound'];
    const suggested = directory.filter(d => preferred.includes(d[0]) || d[4]?.backend).slice(0, 8);
    html = '<div class="sr-group">Suggested for you</div>' + suggested.map(row).join('');
  } else Object.keys(label).forEach(t => { const g = directory.filter(d => d[1] === t && (d[0] + ' ' + d[1] + ' ' + d[2]).toLowerCase().includes(q)); if (g.length) html += `<div class="sr-group">${label[t]}</div>` + g.map(row).join(''); });
  panel.innerHTML = html || `<div class="sr-empty">No results for “${esc(q)}”.<br>Try a module, society, house, company, opportunity or person.</div>`;
  panel.classList.add('open');
  panel.querySelectorAll('[data-follow]').forEach(b => b.addEventListener('click', () => { toggleSubscription(b.dataset.follow); renderSearch(document.getElementById('searchInput').value); }));
}
function renderProfileMenu() {
  const u = state.user, m = document.getElementById('profileMenu'); if (!u) return;
  m.innerHTML = `<div class="menu-head"><span class="avatar">${esc(u.initials)}</span><div><strong>${esc(u.name)}</strong><span>${esc(u.role)}</span></div></div><div class="menu-sep"></div><button class="menu-item" data-go="profile">${icon('user')}My Profile</button><button class="menu-item" data-go="portfolio">${icon('star')}Portfolio</button>${isAdmin() ? `<button class="menu-item" data-act="safety">${icon('alert')}Safety &amp; SOS</button>` : ''}<button class="menu-item" data-go="settings">${icon('settings')}Settings</button><div class="menu-sep"></div><button class="menu-item danger" data-go="logout">${icon('logout')}Exit demo</button>`;
  m.querySelector('[data-go=logout]')?.insertAdjacentHTML('beforebegin', `<button class="menu-item" data-act="theme">${icon(effectiveTheme() === 'dark' ? 'sun' : 'moon')}${effectiveTheme() === 'dark' ? 'Light mode' : 'Dark mode'}</button>`);
  m.querySelector('[data-act=theme]')?.addEventListener('click', () => { m.classList.remove('open'); toggleTheme(); });
  m.querySelector('[data-act=safety]')?.addEventListener('click', () => { m.classList.remove('open'); openSafety(); });
  m.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    m.classList.remove('open');
    if (b.dataset.go === 'logout') return logout();
    state.page = b.dataset.go; if (state.page === 'profile') state.profileTab = 'timeline';
    saveState(); renderApp(); window.scrollTo(0, 0);
  }));
}
