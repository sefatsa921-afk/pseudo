function navItems() {
  if (isAdmin()) return [
    ['admin-overview', 'dash', 'Overview'],
    ['admin-verification', 'shield', 'Verification'],
    ['admin-moderation', 'flag', 'Moderation'],
    ['admin-posts', 'megaphone', 'Posts']
  ];
  // Five tabs: the feed, the places you belong to, what is on, your conversations, and a Campus hub
  // that holds everything else (opportunities, bookings, portfolio, map, services, links).
  return [
    ['home', 'home', 'Home'],
    ['communities', 'users', 'Communities'],
    ['events', 'calendar', 'Events'],
    ['messages', 'comment', 'Messages'],
    ['campus', 'grid', 'Campus']
  ];
}
const CAMPUS_PAGES = ['campus', 'opportunities', 'bookings', 'portfolio', 'map', 'lostfound', 'services'];
function navIsActive(page) { return state.page === page || (page === 'campus' && CAMPUS_PAGES.includes(state.page)); }
function refreshMessageBadge() {
  const n = isAdmin() ? 0 : msgBadgeCount();
  document.querySelectorAll('[data-nav="messages"] .nav-icon').forEach(ic => {
    let badge = ic.querySelector('.nav-badge');
    if (!n) { badge?.remove(); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; ic.appendChild(badge); }
    badge.textContent = n > 9 ? '9+' : String(n);
    badge.setAttribute('aria-hidden', 'true');
  });
  document.querySelectorAll('button[data-nav="messages"]').forEach(btn => btn.setAttribute('aria-label', n ? `Messages, ${n} unread` : 'Messages'));
}
function renderSidebar() {
  const items = navItems();
  const context = isAdmin() ? `
    <div class="sidebar-context">
      <p class="eyebrow">Admin space</p>
      <strong>Northbank Residence</strong>
      <span>${state.user.userType === 'warden' ? 'Residence administration' : 'Kora House · House committee'}</span>
    </div>` : `
    <div class="sidebar-context">
      <p class="eyebrow">Your campus context</p>
      <strong>${state.verified ? 'Verified resident' : 'Verification pending'}</strong>
      <span>${state.verified ? 'Northbank Residence · Kora House' : 'Scan an admin QR to unlock communities'}</span>
    </div>`;
  document.getElementById('sidebar').innerHTML = `${context}<div class="nav-section-title">Navigate</div><div class="nav-list">${items.map(item => navButton(item)).join('')}</div><div class="sidebar-bottom"><div class="sandbox-card"><strong>Prototype mode</strong><br>Fictional data only. No external accounts or university systems connected.</div></div>`;
  document.getElementById('mobileNav').innerHTML = items.slice(0,5).map(item => navButton(item, true)).join('');
  refreshMessageBadge();
  document.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => { state.page = button.dataset.nav; saveState(); renderApp(); }));
}
function navButton(item, mobile = false) {
  const [page, name, label] = item;
  const on = navIsActive(page);
  return `<button class="nav-btn ${on ? 'active on' : ''}" data-nav="${page}" title="${label}" aria-label="${label}"><span class="nav-icon">${icon(name, 25)}</span><span>${label}</span></button>`;
}
function renderTopbar() {
  const user = state.user;
  document.getElementById('topAvatar').textContent = user.initials;
  document.getElementById('topAvatar').className = `avatar ${user.tone || ''}`;
  document.getElementById('topName').textContent = user.name;
  document.getElementById('topRole').textContent = user.role;
  const unread = state.notifications.filter(item => !item.read && state.subscriptions.includes(item.source)).length;
  const badge = document.getElementById('notificationBadge');
  if (badge) { badge.textContent = unread > 9 ? '9+' : String(unread); badge.classList.toggle('hidden', unread === 0); }
  const dot = document.getElementById('profileDot');
  if (dot) dot.classList.add('hidden'); // unread messages now show on the Messages tab instead
  document.getElementById('sosBtn')?.classList.toggle('hidden', isAdmin());
  refreshMessageBadge();
}
function backendReferenceDirectory() {
  const backend = window.VeyaBackend;
  if (!backend?.isConfigured?.()) return '';
  if (backendPreview.status === 'loading') return `<section class="card card-pad backend-directory" aria-live="polite"><div class="flex between"><div><p class="eyebrow">Campus directory</p><h2>Reference pages</h2></div><span class="tag pending">Syncing</span></div><p class="muted" style="font-size:.78rem;margin:10px 0 0">Checking for updates. Saved pages are available below.</p></section>`;
  if (backendPreview.status === 'error') return `<section class="card card-pad backend-directory" aria-live="polite"><div class="flex between"><div><p class="eyebrow">Campus directory</p><h2>Showing saved pages</h2></div><span class="tag neutral">Offline</span></div><p class="muted" style="font-size:.78rem;margin:10px 0 0">We couldn\u2019t refresh the directory just now, so you\u2019re seeing saved pages. They\u2019ll update when you\u2019re back online.</p></section>`;
  const communities = backendPreview.communities || [];
  const modules = backendPreview.modules || [];
  const rows = [
    ...communities.map(row => ({ ...row, sourceKind: row.kind === 'module' ? 'Module reference' : `${row.kind || 'Community'} reference` })),
    ...modules.filter(module => !communities.some(row => row.module_id === module.id)).map(module => ({ id: module.id, name: `${module.code} ${module.name}`, kind: 'module', description: 'Fictional module reference page.', verified_source: true, sourceKind: 'Module reference' }))
  ];
  if (!rows.length) return `<section class="card card-pad backend-directory" aria-live="polite"><div class="flex between"><div><p class="eyebrow">Campus directory</p><h2>No public reference pages yet</h2></div><span class="tag neutral">Connected</span></div><p class="muted" style="font-size:.78rem;margin:10px 0 0">Supabase is configured, but its public reference rows are not visible yet. The fictional directory below is still available.</p></section>`;
  const iconFor = row => row.kind === 'module' ? 'book' : row.kind === 'company' ? 'tag' : row.kind === 'residence' || row.kind === 'house' ? 'building' : 'users';
  const targetFor = row => row.kind === 'module' ? 'Accounting' : row.name;
  return `<section class="card card-pad backend-directory" aria-label="Campus directory pages"><div class="flex between"><div><p class="eyebrow">Campus directory</p><h2>Reference pages</h2><p class="muted" style="font-size:.76rem;margin:4px 0 0">Fictional communities and modules available from Supabase.</p></div><span class="tag official">${rows.length} rows</span></div><div class="list" style="margin-top:12px">${rows.map(row => `<div class="list-item backend-ref-item"><div class="flex"><span class="icon-box">${icon(iconFor(row), 18)}</span><div><strong>${esc(row.name)}</strong><span>${esc(row.description || row.sourceKind)}${row.sponsored ? ` · ${esc(row.sponsor_label || 'Sponsored · Verified')}` : ''}</span></div></div><div class="flex" style="gap:6px;flex-shrink:0"><span class="tag ${row.sponsored ? 'sponsored' : row.verified_source ? 'official' : 'neutral'}">${row.sponsored ? 'Sponsored' : row.verified_source ? 'Verified' : 'Reference'}</span><button class="btn secondary small" data-action="backend-reference-open" data-reference-name="${esc(targetFor(row))}">View</button></div></div>`).join('')}</div><p class="muted" style="font-size:.7rem;margin:12px 0 0">Read only. Demo follows, posts and verification stay local to this prototype.</p></section>`;
}
function loadBackendPreview() {
  const backend = window.VeyaBackend;
  if (!backend?.isConfigured?.() || backendPreview.status !== 'idle') return;
  backendPreview.status = 'loading';
  const request = backend.listReferenceDirectory ? backend.listReferenceDirectory() : backend.listCommunities().then(result => ({ data: { communities: Array.isArray(result.data) ? result.data : [], modules: [] }, error: result.error }));
  request.then(result => {
    if (result.error) {
      backendPreview.status = 'error';
      backendPreview.error = result.error.message;
    } else {
      backendPreview.status = 'ready';
      backendPreview.communities = Array.isArray(result.data?.communities) ? result.data.communities : [];
      backendPreview.modules = Array.isArray(result.data?.modules) ? result.data.modules : [];
    }
    if (state.user) renderApp();
  }).catch(error => {
    backendPreview.status = 'error';
    backendPreview.error = 'The directory could not be reached.';
    console.error(error);
    if (state.user) renderApp();
  });
}
function renderApp() {
  if (!state.user) return showLogin();
  loadBackendPreview();
  document.getElementById('loginScreen').style.display = 'none';
  const appShell = document.getElementById('appShell');
  appShell.classList.add('active');
  appShell.classList.toggle('student-shell', !isAdmin());
  appShell.classList.toggle('admin-shell', isAdmin());
  renderTopbar();
  renderSidebar();
  renderMain();
  renderProfileMenu();
  maybeShowChatPop();
}
function pageHead(title, description, actions = '') {
  return `<div class="page-head compact"><div class="ph-row"><h1>${title}</h1>${actions ? `<div class="head-actions">${actions}</div>` : ''}</div>${description ? `<p>${description}</p>` : ''}</div>`;
}
let lastPageKey = '';
function renderMain() {
  const main = document.getElementById('mainContent');
  const pages = {
    home: renderHome,
    communities: renderCommunities,
    campus: renderCampus,
    services: renderServices,
    events: renderEvents,
    opportunities: renderOpportunities,
    portfolio: renderPortfolio,
    profile: renderProfile,
    viewprofile: () => { const n = state.viewProfile; return (n === state.user.alias || n === state.user.name) ? renderProfile() : renderProfileView(entityOf(n), false); },
    settings: renderSettings,
    bookings: renderBookings,
    messages: renderMessages,
    map: renderMap,
    lostfound: renderLostFound,
    'admin-overview': renderAdminOverview,
    'admin-verification': renderAdminVerification,
    'admin-moderation': renderAdminModeration,
    'admin-posts': renderAdminPosts
  };
  const pageKey = state.page + '|' + (state.page === 'home' ? (state.feedTab || '') : '');
  main.classList.toggle('page-enter', pageKey !== lastPageKey);
  if (pageKey !== lastPageKey) document.getElementById('appShell').classList.remove('fabs-hidden');
  lastPageKey = pageKey;
  main.innerHTML = (pages[state.page] || renderHome)();
  updateDemoStrip();
  wirePageEvents();
}

/* One line per screen replaces the repeated "demo only" notes on cards. */
const DEMO_STRIP_TEXT = {
  bookings: 'Demo mode · nothing is booked or sent to anyone.',
  opportunities: 'Demo mode · fictional listings, nothing is sent to providers.',
  events: 'Demo mode · RSVPs stay on this phone.',
  services: 'Demo mode · no university systems are connected.',
  home: 'Demo mode · fictional people, places and posts.'
};
function updateDemoStrip() {
  const strip = document.getElementById('demoStrip'); if (!strip) return;
  const text = DEMO_STRIP_TEXT[state.page];
  strip.hidden = !text || (window.VeyaBackend?.isConfigured?.() && state.user?.live);
  strip.textContent = text || '';
  window.VeyaMode?.update?.();
}
