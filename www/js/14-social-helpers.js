/* ===== Helpers: empty states + skeleton ===== */
function emptyState(ic, title, text, action = '') { return `<div class="empty-state"><span class="es-ic">${icon(ic, 24)}</span><strong>${title}</strong><p>${text}</p>${action}</div>`; }
let skeletonUntil = 0, skeletonTimer = null;
function startSkeleton(ms = 450) {
  skeletonUntil = Date.now() + ms; clearTimeout(skeletonTimer);
  skeletonTimer = setTimeout(() => { if (state.user && state.page === 'home') renderApp(); }, ms + 20);
}
function skeletonFeed() {
  return Array.from({ length: 2 }, () => `<div class="skel-card"><div class="skel-row"><span class="skel skel-av"></span><div style="flex:1"><div class="skel skel-line" style="width:45%"></div><div class="skel skel-line" style="width:30%;margin:0"></div></div></div><div class="skel skel-line" style="width:94%"></div><div class="skel skel-line" style="width:76%"></div><div class="skel skel-block"></div></div>`).join('');
}

/* ===== Social: friends, requests, reps ===== */
// Friend requests never auto-accept; the recipient must explicitly accept them.
DIRECTORY.push(['Naomi P.', 'Profile', 'Student · Hilltop House', 'NP'], ['Kabelo S.', 'Profile', 'Student · Northbank', 'KS'], ['Lwazi M.', 'Profile', 'Student · Kora House', 'LM']);
const REPS = { 'Sipho D.': 'ECO101', 'Thandi M.': 'CSC101', 'Kabelo S.': 'ACC201', 'Naomi P.': 'MAN101' };
function ensureSocial() {
  const s = state.social = state.social || {};
  s.friends = s.friends || []; s.requests = s.requests || []; s.threads = s.threads || {}; s.unread = s.unread || {};
  if (!s.incoming) s.incoming = ['Thandi M.'].filter(n => !s.friends.includes(n));
  return s;
}
function msgBadgeCount() { const s = ensureSocial(); return s.incoming.length + Object.values(s.unread).reduce((a, b) => a + b, 0); }
function repModuleOf(name) {
  if (state.user && (name === state.user.alias || name === state.user.name)) return myRepModules()[0] || null;
  return REPS[name] || null;
}
function repOfModule(mod) {
  if (!mod) return null;
  if (state.user && myRepModules().includes(mod)) return state.user.alias;
  return Object.keys(REPS).find(k => REPS[k] === mod) || null;
}
function repBadge(e) {
  if (!(e.student || e.own)) return '';
  const m = repModuleOf(e.own ? state.user.alias : e.name);
  return m ? `<span class="rep-badge">${icon('verified', 14)}Module rep · ${esc(m)}</span>` : '';
}
function lecturersOf(mods) { return DIRECTORY.filter(d => d[1] === 'Profile' && /^Lecturer/.test(d[2]) && mods.includes(lecturerModule({ sub: d[2] }))); }
function threadPreview(name) { const t = state.social.threads[name] || []; const m = t[t.length - 1]; return m ? (m.me ? 'You: ' : '') + m.t : 'Say hello'; }
function personRow(name, extraHtml = '') {
  const e = entityOf(name);
  return `<div class="req-row"><span class="avatar">${esc(e.ini)}</span><div class="msg-main" data-profile="${esc(name)}"><strong>${esc(name)}</strong><span>${esc(e.sub)}${repModuleOf(name) ? ' · Rep ' + esc(repModuleOf(name)) : ''}</span></div>${extraHtml}</div>`;
}
function renderMessages() {
  const s = ensureSocial(), tab = state.msgTab || 'chats';
  const mine = myRepModules();
  const names = [...new Set([...Object.keys(s.threads), ...s.friends])];
  names.sort((a, b) => (s.unread[b] ? 1 : 0) - (s.unread[a] ? 1 : 0) || (s.threads[b] || []).length - (s.threads[a] || []).length);
  let body = '';
  if (tab === 'chats') {
    const repCard = mine.length
      ? `<div class="rep-card"><strong>${icon('verified', 14)} You are the ${esc(mine.join(', '))} module rep</strong>You can message ${esc(mine.join(', '))} lecturers directly.${lecturersOf(mine).map(d => ` <button class="chip" data-action="open-chat" data-name="${esc(d[0])}">${esc(d[0])}</button>`).join('')}</div>`
      : `<div class="rep-card"><strong>Need a lecturer?</strong>Students message lecturers through their module rep. Find your rep under Module reps below.</div>`;
    const rows = names.map(n => { const e = entityOf(n), un = s.unread[n]; return `<button class="msg-row" data-action="open-chat" data-name="${esc(n)}"><span class="avatar">${esc(e.ini)}</span><div class="msg-main"><strong>${esc(n)}${un ? '<i class="udot"></i>' : ''}</strong><span class="${un ? 'unread' : ''}">${esc(threadPreview(n))}</span></div>${icon('chevron', 16)}</button>`; }).join('');
    const reps = Object.keys(REPS).map(n => { const st = friendStatus(n); return `<div class="req-row"><span class="avatar">${esc(entityOf(n).ini)}</span><div class="msg-main" data-profile="${esc(n)}"><strong>${esc(n)}</strong><span>${esc(REPS[n])} module rep</span></div>${st === 'friends' ? `<button class="btn secondary small" data-action="open-chat" data-name="${esc(n)}">Message</button>` : st === 'pending' ? '<button class="btn ghost small" disabled>Sent</button>' : `<button class="btn mint small" data-action="add-friend" data-name="${esc(n)}">Add</button>`}</div>`; }).join('');
    body = `${repCard}${rows || emptyState('comment', 'No conversations yet', 'Add friends or open a module rep to start chatting.')}<p class="msg-sec">Module reps</p>${reps}`;
  } else {
    const inc = s.incoming.map(n => personRow(n, `<div class="req-actions"><button class="btn small" data-action="req-accept" data-name="${esc(n)}">Accept</button><button class="btn ghost small" data-action="req-decline" data-name="${esc(n)}">Decline</button></div>`)).join('');
    const out = s.requests.map(n => personRow(n, `<button class="btn ghost small" data-action="req-cancel" data-name="${esc(n)}">Cancel</button>`)).join('');
    body = (inc || emptyState('users', 'No new requests', 'When someone adds you, their request shows up here.')) + (out ? `<p class="msg-sec">Sent</p>${out}` : '');
  }
  const tabs = [['chats', 'Chats'], ['requests', 'Requests' + (s.incoming.length ? ' (' + s.incoming.length + ')' : '')]];
  return `${pageHead('Messages', 'Chat with friends and your module reps.')}<div class="seg">${tabs.map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-action="msg-tab" data-tab="${k}">${l}</button>`).join('')}</div>${body}`;
}
