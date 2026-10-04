/* ===== Profiles (Twitter layout, Instagram actions and highlights) ===== */
const hash = x => [...x].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const fmtN = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'K' : String(n);
const THEMES = ['golden-hour', 'field', 'study', 'open-mic', 'coffee', 'tickets', 'data'];
function entityOf(name) {
  const d = DIRECTORY.find(x => x[0] === name) || [name, 'Group', 'Campus community', initials(name)];
  const [n, type, sub, ini] = d, h = hash(n), student = type === 'Profile' && /^Student/.test(sub);
  const joined = ['January 2026', 'February 2026', 'March 2026', 'April 2026', 'August 2026', 'September 2026'][h % 6];
  const scale = { Residence: 900, House: 260, Society: 180, Group: 340, Company: 520, Profile: student ? 90 : 240 }[type] || 200;
  const hl = { House: ['Welcome social', 'Match days', 'House rules', 'Gallery'], Residence: ['Welcome', 'Houses', 'Safety', 'Events'], Society: ['Events', 'Open mic', 'Members', 'Gallery'], Group: ['Study tips', 'Sessions', 'Resources', 'FAQ'], Company: ['Student deals', 'New in', 'Behind the scenes'], Profile: student ? ['Residence', 'Study', 'Friends'] : ['Office hours', 'Resources', 'Notices'] }[type] || ['Highlights'];
  const bio = { House: `${sub}. Official updates, events and good company.`, Residence: `Official residence page. ${sub}.`, Society: `${sub}. Everyone is welcome, so bring a friend.`, Group: `${sub}. Updates, reminders and resources for students.`, Company: `${sub}. Verified local business with student-friendly offers.`, Profile: student ? `${sub}.` : `${sub}. Verified account. Posts are one-way; questions go through your class representative.` }[type];
  return { name: n, type, sub, ini, student, joined, followers: Math.round(scale * (0.7 + (h % 7) / 10)), following: type === 'Profile' ? 20 + h % 80 : 3 + h % 12, hideFollowing: student && h % 2 === 0, theme: THEMES[h % 7], highlights: hl, bio, handle: n.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') };
}
function postsOf(e) {
  const all = feedPosts();
  if (e.own) return all.filter(p => p.author === state.user.alias);
  if (e.type === 'Group' && /[A-Z]{3}\d{3}/.test(e.sub)) return all.filter(p => p.kind === 'academic' && subjectOf(p) === e.name);
  if (e.type === 'Residence') return all.filter(p => p.kind === 'official');
  return all.filter(p => p.author === e.name);
}
function repliesOf(e) {
  const short = e.name.replace(/^(Dr|Prof|Ms)\.\s/, ''), out = [];
  state.posts.forEach(p => {
    if (p.author === e.name && p.replyTo) out.push({ ctx: p.replyTo.author, text: p.body, time: p.time });
    (p.comments || []).forEach(c => { if (c.author === e.name || c.author === short) out.push({ ctx: p.author, text: c.text, time: p.time }); });
  });
  return out;
}
function renderReels(e) {
  const h = hash(e.name), n = 3 + h % 4;
  return `<div class="reels">${Array.from({ length: n }, (_, i) => { const theme = THEMES[(h + i) % 7]; return `<button class="reel" data-action="reel-open" data-reel-name="${esc(e.name)}" data-reel-theme="${theme}" data-reel-index="${i}" aria-label="Open ${esc(e.name)} reel ${i + 1}">${scene(theme)}<span class="reel-meta">${icon('play', 13)}${fmtN(300 + (hash(e.name + i) % 90) * 37)}</span></button>`; }).join('')}</div>`;
}
function openReelViewer(data = {}) {
  const name = data.reelName || state.viewProfile || state.user.alias;
  const theme = data.reelTheme || 'golden-hour';
  const index = Number(data.reelIndex || 0);
  const captions = ['A small campus moment, shared with the community.', 'The kind of afternoon that makes a long week feel lighter.', 'A fictional Veya reel from the Honey Campus pilot.'];
  const caption = captions[index % captions.length];
  openSheet(`${sheetHead('Reels', esc(name))}<div class="reel-viewer-media">${scene(theme)}<span class="reel-viewer-stamp">${icon('play', 13)} Demo reel</span><div class="reel-viewer-copy"><strong>${esc(name)}</strong><span>${esc(caption)}</span></div></div><div class="reel-viewer-actions"><button class="btn secondary small" data-do="share-reel">${icon('send', 15)}Share preview</button><button class="btn small" data-close>Close</button></div><p class="muted" style="font-size:.72rem;margin:10px 0 0">Fictional media only. Playback and uploads are not connected to a live service.</p>`, root => root.querySelector('[data-do="share-reel"]')?.addEventListener('click', () => showToast('Reel preview link copied.')));
}
function renderProfileView(e, own) {
  const pr = ensureUsername();
  const tabs = [['posts', 'Posts'], ['replies', 'Replies'], ['reels', 'Reels']];
  let tab = (own ? state.profileTab : state.vpTab) || 'posts'; if (tab === 'timeline') tab = 'posts';
  if (!tabs.some(t => t[0] === tab)) tab = 'posts';
  const following = isSubscribed(e.name), posts = postsOf(e);
  const fVisible = own ? pr.showFollowing !== false : !e.hideFollowing;
  const stat = fVisible ? `<span><b>${fmtN(e.following)}</b> Following</span>` : own ? `<span><b>${e.following}</b> Following · only you</span>` : `<span class="pf-private">${icon('lock', 13)}Following hidden</span>`;
  const hl = `<div class="stories pf-hl">${own ? `<button class="story" data-action="story" data-story="New highlight"><span class="story-ring plus"><span>${icon('plus', 24)}</span></span><span>New</span></button>` : ''}${e.highlights.map((t, i) => `<button class="story" data-action="story" data-story="${esc(t)}"><span class="story-ring plus"><span>${scene(THEMES[(hash(e.name) + i + 1) % 7])}</span></span><span>${esc(t)}</span></button>`).join('')}</div>`;
  let body = '';
  if (tab === 'posts') {
    const promos = e.type === 'Company' ? state.promotions.filter(x => x.source === e.name) : [];
    body = `${own && state.verified ? renderCompose() : ''}<div class="feed">${posts.length || promos.length ? renderPosts(state.verified, posts).replace(/^<div class="empty-feed">.*<\/div>$/, '') + renderPromotions(promos) : emptyState('edit', own ? 'No posts yet' : 'No posts yet', own ? 'Your posts will appear here.' : 'Follow to see updates here.')}</div>`;
  } else if (tab === 'replies') {
    const r = repliesOf(e);
    body = r.length ? r.map(x => `<article class="reply-row"><div class="reply-row-head"><span class="avatar" style="width:34px;height:34px;border-radius:12px;font-size:.68rem;">${esc(e.ini)}</span><div><strong>${esc(e.name)}</strong><small>Replying to <button class="plink-t" data-profile="${esc(x.ctx)}">${esc(x.ctx)}</button> · ${esc(x.time)}</small></div></div><p>${esc(x.text)}</p><button class="link-btn" data-profile="${esc(x.ctx)}">View source</button></article>`).join('') : emptyState('comment', 'No replies yet', 'Replies will show up here.');
  } else if (tab === 'reels') body = renderReels(e);
  else body = own ? renderPortfolio(true) : `<div class="card card-pad" style="margin-top:12px"><p class="eyebrow">Shared by ${esc(e.name)}</p><div class="badge-card"><span class="badge-icon">${icon('shield', 22)}</span><div><strong>Verified Residence Member</strong><span class="muted" style="display:block;font-size:.76rem">${esc(e.sub.replace(/^Student · /, ''))}</span></div></div><p class="muted" style="font-size:.74rem;margin:12px 0 0">Students choose which credentials appear here. Real names and student numbers are never shown.</p></div>`;
  const btns = own
    ? `<button class="btn secondary small" data-action="edit-profile">${icon('edit', 15)}Edit profile</button><button class="btn secondary small" data-action="share-portfolio">Share portfolio</button>`
    : `<button class="btn small ${following ? 'secondary' : 'mint'}" data-action="toggle-subscription" data-source="${esc(e.name)}">${following ? 'Following' : 'Follow'}</button>${messageButtons(e)}<button class="btn secondary small pf-more" data-action="profile-menu" data-name="${esc(e.name)}" aria-label="More options for ${esc(e.name)}">${icon('more', 18)}</button>`;
  return `<div class="pf-banner">${scene(e.theme)}${own ? '' : `<button class="pf-back" data-action="back" aria-label="Back">${icon('chevron', 18)}</button>`}</div>
    <div class="pf2"><span class="avatar pf-ava2">${esc(e.ini)}</span>
      <h1>${esc(e.name)}${e.student ? (state.verified ? `<span class="vbadge">${icon('verified', 18)}</span>` : '') : `<span class="vbadge">${icon('verified', 18)}</span>`}</h1>
      <p class="pf-user">@${esc(e.handle)} · ${esc(e.type === 'Profile' ? e.sub : e.type)}</p>
      ${repBadge(e)}
      <p class="pf-bio">${esc(e.bio)}</p>
      <p class="pf-meta">${icon('calendar', 14)}Joined ${esc(e.joined)}</p>
      <div class="pf-stats">${stat}<span><b>${fmtN(e.followers + (following && !own ? 1 : 0))}</b> Followers</span></div>
      <div class="pf-btns">${btns}</div></div>
    ${hl}
    <div class="feed-tabs static" role="tablist">${tabs.map(([k, l]) => `<button class="feed-tab ${tab === k ? 'active' : ''}" data-action="pf-tab" data-tab="${k}">${l}</button>`).join('')}</div>
    ${body}`;
}
function openProfile(name) {
  if (!name || !state.user) return;
  ['searchPanel', 'profileMenu'].forEach(id => document.getElementById(id).classList.remove('open')); closeNotifications();
  if (name === state.user.alias || name === state.user.name) { state.page = 'profile'; state.profileTab = 'posts'; }
  else { if (state.page !== 'viewprofile') state.prevPage = state.page; state.viewProfile = name; state.vpTab = 'posts'; state.page = 'viewprofile'; }
  saveState(); renderApp(); window.scrollTo(0, 0);
}
