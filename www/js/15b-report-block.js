/* ===== Report and block tools =====
 * Local demo behaviour that mirrors the backend contract (schema.sql: reports, user_blocks).
 * Reason codes match reports.reason. When real sign-in exists, fileReport() should call
 * VeyaBackend.submitReport and blockPerson() should call VeyaBackend.blockUser; the UI stays the same.
 */
const REPORT_REASONS = [
  ['harassment', 'Harassment or bullying'],
  ['hate', 'Hate or discrimination'],
  ['sexual_content', 'Sexual content'],
  ['violence_or_threat', 'Violence or threats'],
  ['self_harm', 'Someone may be at risk'],
  ['spam', 'Spam'],
  ['scam', 'Scam or fake offer'],
  ['misinformation', 'Misleading information'],
  ['impersonation', 'Impersonation'],
  ['privacy', 'Shares private information'],
  ['unsafe', 'Unsafe event or situation'],
  ['other', 'Something else']
];
const REPORT_TYPE_LABEL = { post: 'Post', profile: 'Profile', opportunity: 'Listing', message: 'Message', media: 'Photo' };

function blockedList() { if (!Array.isArray(state.blocked)) state.blocked = []; return state.blocked; }
function hiddenPostIds() { if (!Array.isArray(state.hiddenPosts)) state.hiddenPosts = []; return state.hiddenPosts; }
function isBlocked(name) { return blockedList().includes(name); }
function canBlock(name) {
  if (!name || !state.user || name === state.user.alias || name === state.user.name) return false;
  return Boolean(entityOf(name).student);
}
/* Posts the current user should see: not hidden by them, not by someone they blocked, not removed by a moderator. */
function feedPosts(list = state.posts) {
  const hidden = hiddenPostIds();
  return list.filter(p => !hidden.includes(p.id) && !p.removed && !isBlocked(p.author));
}

function blockPerson(name) {
  if (!canBlock(name) || isBlocked(name)) return false;
  blockedList().push(name);
  const s = ensureSocial();
  s.friends = s.friends.filter(n => n !== name);
  s.requests = s.requests.filter(n => n !== name);
  s.incoming = s.incoming.filter(n => n !== name);
  delete s.unread[name];
  state.subscriptions = state.subscriptions.filter(n => n !== name);
  saveState();
  return true;
}
function unblockPerson(name) {
  state.blocked = blockedList().filter(n => n !== name);
  saveState();
}

function fileReport(t, reason, details) {
  const dupe = state.reports.find(r => r.mine && r.targetType === t.type && String(r.targetId) === String(t.targetId));
  if (dupe) return false;
  const label = REPORT_REASONS.find(r => r[0] === reason)?.[1] || 'Report';
  state.reports.unshift({
    id: Date.now(), mine: true, targetType: t.type, targetId: t.targetId, author: t.author || '',
    type: `${REPORT_TYPE_LABEL[t.type] || 'Content'} report`, reason, details: (details || '').trim().slice(0, 500),
    summary: `${label}: ${t.label}`, community: t.community || 'Kora House', status: 'Needs review', time: 'Just now'
  });
  if (t.type === 'post') hiddenPostIds().push(t.targetId); // hidden for the reporter straight away
  saveState();
  return true;
}

function openReportSheet(t) {
  const alsoBlock = t.author && canBlock(t.author) && !isBlocked(t.author);
  openSheet(`${sheetHead('Report', esc(t.label))}
    <p class="muted rp-lead">Pick the closest reason. A moderator reviews it. The person is not told who reported them.</p>
    <div class="report-reasons" role="radiogroup" aria-label="Reason">${REPORT_REASONS.map(([k, l], i) => `<label class="report-reason"><input type="radio" name="rpReason" value="${k}" ${i === 0 ? 'checked' : ''} /><span>${l}</span></label>`).join('')}</div>
    <label class="field">Details (optional)<textarea id="rpDetails" rows="2" maxlength="500" placeholder="Anything that helps a moderator"></textarea></label>
    ${alsoBlock ? `<label class="check"><input type="checkbox" id="rpBlock" /> Also block ${esc(t.author)}</label>` : ''}
    <button class="btn full" style="margin-top:14px" data-do="send">Send report</button>
    <button class="link-btn rp-sos" data-do="sos">Someone in danger? Open Safety &amp; SOS</button>`, root => {
    root.querySelector('[data-do=send]').addEventListener('click', () => {
      const reason = root.querySelector('input[name=rpReason]:checked')?.value || 'other';
      const fresh = fileReport(t, reason, root.querySelector('#rpDetails').value);
      if (fresh && root.querySelector('#rpBlock')?.checked) blockPerson(t.author);
      root.innerHTML = '';
      renderApp();
      showToast(fresh ? 'Report sent. A moderator will review it.' : 'You already reported this. A moderator will review it.');
    });
    root.querySelector('[data-do=sos]').addEventListener('click', () => { root.innerHTML = ''; openSafety(); });
  });
}

function openBlockSheet(name) {
  openSheet(`${sheetHead('Block', esc(name))}
    <p class="muted rp-lead">${esc(name)} will not be able to message you or send friend requests, and their posts disappear from your feed. They are not told. You can unblock anyone in Settings.</p>
    <button class="btn danger full" data-do="block">Block ${esc(name)}</button>
    <button class="btn secondary full" style="margin-top:8px" data-close>Cancel</button>`, root => {
    root.querySelector('[data-do=block]').addEventListener('click', () => {
      blockPerson(name); root.innerHTML = '';
      if (state.page === 'viewprofile' && state.viewProfile === name) state.page = state.prevPage || 'home';
      saveState(); renderApp(); showToast(`${name} is blocked.`);
    });
  });
}

function openPostMenu(id) {
  const p = state.posts.find(x => x.id === id); if (!p) return;
  const block = canBlock(p.author) && !isBlocked(p.author);
  const own = state.user && (p.author === state.user.alias || p.author === state.user.name);
  openSheet(`${sheetHead('Post options', esc(p.author))}
    <div class="menu-list">
      ${own ? '' : `<button class="menu-item" data-do="report">${icon('flag')}Report post</button>`}
      ${block ? `<button class="menu-item danger" data-do="block">${icon('shield')}Block ${esc(p.author)}</button>` : ''}
      <button class="menu-item" data-do="hide">${icon('eye')}Hide this post</button>
      <button class="menu-item" data-close>${icon('close')}Cancel</button>
    </div>`, root => {
    root.querySelector('[data-do=report]')?.addEventListener('click', () => openReportSheet({ type: 'post', targetId: p.id, author: p.author, label: `${p.author}'s post`, community: p.kind === 'academic' ? p.module : 'Kora House' }));
    root.querySelector('[data-do=block]')?.addEventListener('click', () => openBlockSheet(p.author));
    root.querySelector('[data-do=hide]').addEventListener('click', () => { hiddenPostIds().push(p.id); saveState(); root.innerHTML = ''; renderApp(); showToast('Post hidden from your feed.'); });
  });
}

function openProfileMenu(name) {
  const e = entityOf(name);
  const block = canBlock(name);
  const blocked = isBlocked(name);
  openSheet(`${sheetHead('Options', esc(name))}
    <div class="menu-list">
      <button class="menu-item" data-do="report">${icon('flag')}Report ${e.student ? 'person' : 'page'}</button>
      ${block ? (blocked ? `<button class="menu-item" data-do="unblock">${icon('shield')}Unblock ${esc(name)}</button>` : `<button class="menu-item danger" data-do="block">${icon('shield')}Block ${esc(name)}</button>`) : ''}
      <button class="menu-item" data-close>${icon('close')}Cancel</button>
    </div>`, root => {
    root.querySelector('[data-do=report]').addEventListener('click', () => openReportSheet({ type: 'profile', targetId: name, author: name, label: name, community: 'Kora House' }));
    root.querySelector('[data-do=block]')?.addEventListener('click', () => openBlockSheet(name));
    root.querySelector('[data-do=unblock]')?.addEventListener('click', () => { unblockPerson(name); root.innerHTML = ''; renderApp(); showToast(`${name} is unblocked.`); });
  });
}

function renderBlockedSettings() {
  const list = blockedList();
  const rows = list.length
    ? list.map(n => `<div class="set-row"><div><strong>${esc(n)}</strong><span>Cannot message you or send requests</span></div><button class="btn secondary small" data-action="unblock" data-name="${esc(n)}">Unblock</button></div>`).join('')
    : `<div class="set-row"><div><strong>No one blocked</strong><span>Block someone from their profile or a post menu.</span></div></div>`;
  return `<div class="set-group"><p class="eyebrow">${icon('shield')} Blocked people</p><div class="card set-card">${rows}</div></div>`;
}

/* Moderator queue for the admin demo */
function renderReportQueue() {
  const open = state.reports.filter(r => r.status === 'Needs review');
  const done = state.reports.filter(r => r.status !== 'Needs review').slice(0, 5);
  const card = r => `<div class="list-item rp-item"><div><div class="flex"><span class="tag ${r.mine ? 'community' : 'official'}">${esc(r.type)}</span><span class="muted" style="font-size:.7rem">${esc(r.community)} · ${esc(r.time || '')}</span></div><strong style="margin-top:6px;display:block">${esc(r.summary)}</strong>${r.details ? `<span class="muted" style="display:block;margin-top:4px">“${esc(r.details)}”</span>` : ''}</div>
    <div class="rp-actions"><button class="btn mint small" data-action="report-resolve" data-id="${r.id}">Keep</button><button class="btn coral small" data-action="report-remove" data-id="${r.id}">Remove</button><button class="link-btn" data-action="report-dismiss" data-id="${r.id}">Dismiss</button></div></div>`;
  const doneRow = r => `<div class="list-item"><div><strong>${esc(r.summary)}</strong><span>${esc(r.status)}</span></div></div>`;
  return `<div class="card card-pad"><p class="eyebrow">Open reports · ${open.length}</p><h2>${open.length ? 'Needs a decision' : 'All clear'}</h2><div class="list">${open.length ? open.map(card).join('') : '<p class="muted" style="margin:0">No open reports.</p>'}</div>${done.length ? `<p class="eyebrow" style="margin-top:18px">Recently closed</p><div class="list">${done.map(doneRow).join('')}</div>` : ''}</div>`;
}

function handleSafetyAction(action, b) {
  const d = b.dataset;
  switch (action) {
    case 'post-menu': openPostMenu(Number(d.id)); return true;
    case 'profile-menu': openProfileMenu(d.name); return true;
    case 'opp-report': {
      const o = OPPS.find(x => x.id === d.id) || OPPS.find(x => String(x.id) === String(d.id));
      openReportSheet({ type: 'opportunity', targetId: d.id, label: o ? o.t : 'this listing', community: 'Opportunities' }); return true;
    }
    case 'dm-menu': openProfileMenu(d.name); return true;
    case 'unblock': unblockPerson(d.name); renderApp(); showToast(`${d.name} is unblocked.`); return true;
    case 'report-resolve': case 'report-remove': case 'report-dismiss': {
      const r = state.reports.find(x => String(x.id) === String(d.id)); if (!r) return true;
      r.status = action === 'report-resolve' ? 'Kept after review' : action === 'report-remove' ? 'Content removed' : 'Dismissed';
      if (action === 'report-remove' && r.targetType === 'post') { const p = state.posts.find(x => x.id === r.targetId); if (p) p.removed = true; }
      saveState(); renderApp();
      showToast(action === 'report-remove' ? 'Content removed.' : action === 'report-resolve' ? 'Marked as reviewed.' : 'Report dismissed.');
      return true;
    }
  }
  return false;
}
