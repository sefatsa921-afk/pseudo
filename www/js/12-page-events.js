function wirePageEvents() {
  document.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', event => { event.preventDefault(); closeNotifications(); state.page = button.dataset.nav; saveState(); renderApp(); window.scrollTo(0, 0); }));
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => handleAction(button.dataset.action, button)));
}
function handleAction(action, button) {
  if (action === 'logout') return logout();
  if (handleSafetyAction(action, button)) return;
  if (handleExtraAction(action, button)) return;
  if (handleNewAction(action, button)) return;
  if (action === 'feed-tab') { state.feedTab = button.dataset.tab; saveState(); return renderApp(); }
  if (action === 'add-shortcut') { showToast('Student-selected favourites are coming next.'); return; }
  if (action === 'add-photo') { showToast('Photo uploads are coming next.'); return; }
  if (action === 'save') { const p = state.posts.find(i => i.id === Number(button.dataset.id)); if (p) { p.saved = !p.saved; saveState(); showToast(p.saved ? 'Saved to your bookmarks.' : 'Removed from bookmarks.'); renderApp(); } return; }
  if (action === 'reset-demo') return resetDemo();
  if (action === 'scan-qr') return openScanModal();
  if (action === 'show-admin-qr') return openAdminQrModal();
  if (action === 'approve-request') return approveRequest();
  if (action === 'reject-request') return rejectRequest();
  if (action === 'react') return reactToPost(Number(button.dataset.id));
  if (action === 'toggle-comments') { const el = document.getElementById('comments-' + button.dataset.id); if (el) el.classList.toggle('hidden'); return; }
  if (action === 'add-comment') return addComment(Number(button.dataset.id));
  if (action === 'create-post') return createPost();
  if (action === 'repost') { showToast('Reposted to your timeline.'); return; }
  if (action === 'share-post') { showToast('Share link copied.'); return; }
  if (action === 'open-house') { openProfile('Kora House'); return; }
  if (action === 'open-accounting') { openProfile('Accounting'); return; }
  if (action === 'backend-reference-open') { openProfile(button.dataset.referenceName || 'Study Hub'); return; }
  if (action === 'rsvp') return rsvpEvent(button.dataset.title);
  if (action === 'event-request') return openInfoModal('Inter-residence activity request', 'In the next phase, any verified student will be able to submit a proposal. It will show as Pending until the relevant inter-residence representatives approve it.');
  if (action === 'community-request') return openInfoModal('Community request', 'This prototype reserves cross-residence communities for Phase 2. Your request would include the residences involved, activity type, date, venue, and responsible organiser.');
  if (action === 'service-info') return openInfoModal('Official counselling integration', 'The production workflow would show approved services and send only minimal appointment information to an authorised counselling dashboard. This demo sends nothing.');
  if (action === 'listing-request') return openInfoModal('Listing review', 'In production, a verified provider or sponsor would submit the opportunity. An authorised reviewer would check the source before publishing it to students.');
  if (action === 'share-portfolio') return openInfoModal('Controlled portfolio link', 'A production version would let you choose credentials and create a time-limited share link. This demo keeps all data fictional.');
  if (action === 'policy') return openInfoModal('House rules', 'Be respectful. Do not post private student information. Media requires consent. Report threats, harassment, scams, or unsafe events.');
  if (action === 'new-announcement') return openInfoModal('New announcement', 'The production form will include audience, source label, expiry date, and approval history.');
  if (action === 'story') return showToast(`${button.dataset.story} story preview is coming next.`);
  if (action === 'toggle-subscription') return toggleSubscription(button.dataset.source);
  if (action === 'promo-open') return openInfoModal(button.dataset.source, 'This is a fictional sponsored student offer. In production, a verified business page would provide the official offer details and terms.');
}
function toggleSubscription(source) {
  if (state.subscriptions.includes(source)) {
    state.subscriptions = state.subscriptions.filter(item => item !== source);
    showToast(`Unfollowed ${source}.`);
  } else {
    state.subscriptions.push(source);
    showToast(`Following ${source}. Notifications enabled.`);
  }
  saveState();
  renderApp();
}
function renderNotificationsPanel() {
  const panel = document.getElementById('notificationsPanel');
  const followed = state.notifications.filter(item => state.subscriptions.includes(item.source));
  const fresh = followed.filter(item => !item.read), earlier = followed.filter(item => item.read);
  const typeIcon = t => /lecturer|module/i.test(t) ? 'book' : t === 'Official' ? 'megaphone' : t === 'Opportunity' ? 'briefcase' : t === 'Promotion' ? 'tag' : 'users';
  const row = item => `<button class="np-item ${item.read ? '' : 'unread'}" data-notification-id="${item.id}"><span class="np-ava th-${esc(item.theme)}">${esc(item.initials)}<span class="np-type">${icon(typeIcon(item.type), 11)}</span></span><span class="np-copy"><strong>${esc(item.source)}</strong> ${esc(item.title)}<small>${esc(item.time)} · ${esc(item.type)}</small></span>${item.read ? '' : '<span class="np-dot"></span>'}</button>`;
  panel.innerHTML = `<div class="np-head"><h2>Notifications</h2><button class="np-link" data-notification-action="mark-read" ${fresh.length ? '' : 'disabled'}>Mark all read</button></div>
    ${followed.length ? `${fresh.length ? `<div class="np-group">New</div>${fresh.map(row).join('')}` : ''}${earlier.length ? `<div class="np-group">Earlier</div>${earlier.map(row).join('')}` : ''}` : `<div class="np-empty">${icon('bell', 28)}<p>Follow a community or page to see its updates here.</p></div>`}
    <div class="np-foot"><button class="btn secondary small full" data-nav="communities">${icon('users', 16)}Manage followed pages</button></div>`;
  panel.querySelector('[data-notification-action="mark-read"]')?.addEventListener('click', () => {
    state.notifications.forEach(item => { if (state.subscriptions.includes(item.source)) item.read = true; });
    saveState();
    renderTopbar();
    renderNotificationsPanel();
  });
  panel.querySelectorAll('[data-notification-id]').forEach(item => item.addEventListener('click', () => {
    const notification = state.notifications.find(entry => String(entry.id) === item.dataset.notificationId);
    if (notification) notification.read = true;
    saveState();
    renderTopbar();
    renderNotificationsPanel();
    if (notification) openProfile(notification.source);
  }));
  panel.querySelector('[data-nav="communities"]')?.addEventListener('click', () => {
    closeNotifications();
    state.page = 'communities';
    saveState();
    renderApp();
  });
}
function toggleNotifications() {
  const panel = document.getElementById('notificationsPanel');
  const open = panel.classList.toggle('open');
  if (open) renderNotificationsPanel();
}
function closeNotifications() {
  document.getElementById('notificationsPanel').classList.remove('open');
}
function formatVerificationTime(value) {
  if (!value) return 'Just now';
  try { return new Date(value).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { return 'Just now'; }
}
function verificationTimeline(currentOverride = null) {
  const current = currentOverride || (state.verified ? 4 : state.pendingVerification ? 3 : 1);
  const steps = [
    ['Meet an authorised admin', 'Choose a residence/community scope in person.'],
    ['Scan the temporary QR', 'The scan creates a request; it does not verify you.'],
    ['Administrator reviews', 'An authorised person approves or rejects the request.']
  ];
  return `<div class="verification-timeline">${steps.map((step, index) => { const number = index + 1; const done = number < current || state.verified; const active = number === current && !state.verified; return `<div class="verification-step ${done ? 'done' : active ? 'current' : ''}"><span class="step-no">${done ? icon('check', 13) : number}</span><div><strong>${step[0]}</strong><span>${step[1]}</span></div></div>`; }).join('')}</div>`;
}
function openProfileVerificationModal() {
  const scope = activeVerificationScope();
  const status = state.verified ? `<span class="status verified">Verified profile</span>` : state.pendingVerification ? `<span class="status pending">Awaiting admin review</span>` : `<span class="status neutral">Not verified</span>`;
  const title = state.verified ? 'Your scoped badge is active' : state.pendingVerification ? 'Your request is in the queue' : 'Verify your campus profile';
  const copy = state.verified
    ? 'You are verified only for the residence/community shown below. This badge does not prove identity outside that scope.'
    : state.pendingVerification
      ? `Scanned ${formatVerificationTime(state.pendingRequest?.requestedAt)}. Wait for an authorised administrator to review this request.`
      : 'Verification is deliberately in-person. Veya does not ask for a password, student number, or identity document in this prototype.';
  const scopePicker = state.verified || state.pendingVerification ? `<div class="verification-state"><span class="muted" style="font-size:.76rem;">Requested scope</span><span class="tag official">${esc(scope.residence)} · ${esc(scope.community)}</span></div>` : `<label class="field">Residence community<select id="verificationScope">${VERIFICATION_SCOPES.map(item => `<option value="${esc(item.id)}" ${item.id === scope.id ? 'selected' : ''}>${esc(item.residence)} · ${esc(item.community)}</option>`).join('')}</select></label>`;
  const pendingMeta = state.pendingVerification ? `<div class="verification-meta"><span class="tag community">${state.pendingRequest?.scanSource === 'native-camera' ? 'Camera scan' : 'Demo scan'}</span><span class="tag neutral">${formatVerificationTime(state.pendingRequest?.requestedAt)}</span></div>` : '';
  const rejectedNotice = !state.verified && !state.pendingVerification && state.verificationNotice?.status === 'rejected' ? `<div class="notice verification-rejected" style="margin-top:12px">The last request was not approved. You can start a new in-person request with an authorised administrator.</div>` : '';
  const action = state.verified ? `<button class="btn full secondary" data-do="ok">Close</button>` : state.pendingVerification ? `<button class="btn full secondary" data-do="ok">Close</button>` : `<button class="btn full" data-do="start">Start with admin QR</button>`;
  openSheet(`${sheetHead('Profile verification', title)}<p class="muted" style="margin:0;font-size:.8rem">${copy}</p><div class="verification-state">${status}<span class="tag official">Residence-scoped</span></div>${pendingMeta}${rejectedNotice}${scopePicker}${verificationTimeline()}<div class="notice" style="margin-top:14px">Production safeguard: QR codes should expire, be single-use, be tied to the residence and administrator, and leave an auditable approval record.</div>${action}`, root => {  root.querySelector('#verificationScope')?.addEventListener('change', event => { state.verificationDraftScope = event.target.value; }); root.querySelector('[data-do="start"]')?.addEventListener('click', () => { root.innerHTML = ''; openScanModal(); }); root.querySelector('[data-do="ok"]')?.addEventListener('click', () => { root.innerHTML = ''; }); });
}
// A real, fictional QR payload for testing the native camera path. Production QR values must be server-issued, expiring and single-use.
const DEMO_ADMIN_QR_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnwAAAJ8CAIAAADrj+sBAAAPq0lEQVR4nO3cPXIjyRlFUUHBnYyp/S9F5iwCJizKJg0qpzv71peFc2wGUX/AjXLe4/P1/BcA8Of9++oDAIB3IboAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4AREQXACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAEREFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4AREQXACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAEREFwAiogsAEdEFgMjH1Qfw3X/++uvqQ7jMf//++//+zcr1Wfk/K3bdi13nVZp2zCc+G7s+a8W049ll13lN+36Vpt13b7oAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4ARMZtL6+YtqW5Ytr2abmrXLrrtvAuJ973d74X5Xnd9RpO400XACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAEREFwAiogsAEdEFgMiR28sryk3OaZul5aZrueW767N2XZ8Tz71UHvO06zPtN2GXd/5d3cWbLgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4AREQXACKiCwCR224v31W5mTxt+3TX8ezaOi6vz133mVeU92vafZ92PPw+b7oAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4ARGwvH6bcYt215XviNuw7bx2vuOsmsPvOn+ZNFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIiILgBERBcAIqILABHRBYDIbbeXT9x9XbFrG3baPnO587zr+ky7FyvK3eBd5z7t/9z1t2XFO5/7Lt50ASAiugAQEV0AiIguAEREFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIgcub1c7sdOM22HtnTiTu8u5fGceJ39n9/3zr+rJW+6ABARXQCIiC4AREQXACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAETGbS9P2/udZtpe667jKU3bVV7heBrTdpV3uev9OpE3XQCIiC4AREQXACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAEREFwAij8/X8+pj+KLcxZ22CXyictN12v2atq+7y7T94fL7Pu2zdj0/dz2vFdN2p73pAkBEdAEgIroAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABAZt728Ytr+57Qt6BO3c08899K03eDStC3faaY98yd+v0redAEgIroAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCI3HZ7ecW0bWEbqj+btpW9y4n71Sve+Xju+n1fMW0re9r33ZsuAEREFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIiILgBERBcAIqILAJGPqw/gTyn3P6ftrN51Q3Waabu40zZ4V0y7Piv/Z9r1eeeN9BN/f7zpAkBEdAEgIroAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABAZt708bUf0xD3bXabdixXT9rR3mbbBW+4Yr3zWtOdw2v0qnXjMJW+6ABARXQCIiC4AREQXACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAETGbS/vMm2D98Q90nJ3etomcPl/dn3WLuXxnPiM7VJe5/L6nHgvSt50ASAiugAQEV0AiIguAEREFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIjcdnt5xa7t03KHdtpnldvCJ27VTtuhLTecp5m2Fz3NifvMJ94Lb7oAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4ARI7cXp62H1vuf951n3nFXXeMp13Dd3bilu+Jx7zLtN+EFd50ASAiugAQEV0AiIguAEREFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIgcub08bUtzxa6N0HLvd8WJ92LFtI3iaXvauz5rl2n73u7XnM+axpsuAEREFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIiILgBERBcAIqILAJFx28vlhuqKXdunJ+6arpzXrnN/5/t+4t7vimn3wmcxgTddAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4AREQXACLjtpd3bY2Wpu0zT9trnXZPp+3Q3nWfedfxTDv3FdN+E5jDmy4AREQXACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAEREFwAiogsAkcfn63n1Mfxjd90sves+84nntWLa1vGKaTvYpRM3rlfc9XhO/A1f4U0XACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAEREFwAiogsAEdEFgMjH1Qfw3V13eneZtpl84jU88dxP3M6l8c734sQNZ2+6ABARXQCIiC4AREQXACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAEQen6/n1cfwxYk7ouW257St0XILepoTz/3E79cu054xz8/Ppt2vXbzpAkBEdAEgIroAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABD5uPoAvlvZ2yz3h3dtjZ64mbxyPLvu1y4n7tmumPb8nPisvvNucPn8lPdi2vdihTddAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4AREQXACLjtpdXTNvSXDHtmMuN62nnvqLc6V0x7RpO27wt95mn7TyvmPb8rJj2jO3iTRcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4AREQXACKiCwAR0QWAyOPz9bz6GL7YtVl64j7qLtM2Zqfto971vpd23dO73gu/P7+vbEHJmy4AREQXACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAEREFwAiogsAkY+rD+C7aTuZu0zbI931WdPu1103paft9E47nhXvvIe8YtrzPO23ZRdvugAQEV0AiIguAEREFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIiILgBEHp+v59XH8MWu7dNyX3faMe8ybYt1lxN3sFe88/2a9h2c9n92uesecsmbLgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4AREQXACKiCwCRI7eXT9yYLfd+T7w+K+zQ/mzauU/77pROvBfT/s+KE58Nb7oAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4ARD6uPoBfceKOaLnFWn7Wimn7qOUO9opp12eXadf5ROXvWGna8ZS86QJARHQBICK6ABARXQCIiC4AREQXACKiCwAR0QWAiOgCQER0ASAiugAQGbe9PG2vddq+brkXPc20ze0V5cbsifd92vFMU/6OvfMecsmbLgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4AREQXACKiCwCRcdvLJ24dl//nROXu64nXedou7rR7ceKmdHm/pp37imnPfMmbLgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4AREQXACKiCwCRx+frefUx/GN33e3cdV7T/s+Kd/6sFdPO/cS932n3tPTOW9DTWuBNFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIiILgBERBcAIqILABHRBYDIbbeXV0zbMd5l2tbotK3ju37WivJZ9b2YY9rv2LTt95I3XQCIiC4AREQXACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAEREFwAi47aXp22E7nLiRmjpxJ3V8lmdtuG8y7S93xXT9odL057nE3nTBYCI6AJARHQBICK6ABARXQCIiC4AREQXACKiCwAR0QWAiOgCQER0ASAybnt5mmlb0OX26bT/U5p231dMu4YrTtydnvZ9X3Hiue8y7XvhTRcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4AREQXACKiCwAR0QWAyMfVB/Arpm17rij3P6ftIZfnPm3Ld9q9mHbM03ZxV9x1V5mGN10AiIguAEREFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIiILgBERBcAIo/P1/PqY/hi2g7tihP3dVfsOq9dpl2fu5q2lb2i/A56fn427RpO2/f2pgsAEdEFgIjoAkBEdAEgIroAEBFdAIiILgBERBcAIqILABHRBYCI6AJAZNz2Mj8rt2pXlHu25abrtM/aZdp1PtG063Pi8zPts0redAEgIroAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIfFx9AN/ZdG3+z7Td4GnHPG2j+K47tCvKLd/y/5SmbSavuOvz7E0XACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAEREFwAiogsAEdEFgMi47eUVJ25ylnut03Z6p23VTttVXjHtfpX71btM+9246/PDz7zpAkBEdAEgIroAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABB5fL6eVx/DF3fdxX3n89r1WbuUxzxtd7q0655Ou4YnPqvTlM/GtN1pb7oAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4ARD6uPgD2m7Y1eqJyT3vFtO3u8vpM2zY/cW982l70iddwF2+6ABARXQCIiC4AREQXACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAERsLx/mxK3Rcn94l12f9c4bsyumbUHvMu14pm13r5i2f76LN10AiIguAEREFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIiILgBERBcAIo/P1/PqY/jixC3NFdPOqzyeu+7rrph2zOXxlNu5057naZ81bQN82jNf8qYLABHRBYCI6AJARHQBICK6ABARXQCIiC4AREQXACKiCwAR0QWAiOgCQOTj6gP4FdP2dUvTzv3End5dTtyzLZ+fabvBu5z4rK44ccP5RN50ASAiugAQEV0AiIguAEREFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIg8Pl/Pq48BAN6CN10AiIguAEREFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4AREQXACKiCwAR0QWAiOgCQER0ASAiugAQEV0AiIguAEREFwAiogsAEdEFgIjoAkBEdAEgIroAEBFdAIiILgBERBcAIqILABHRBYCI6AJARHQBICK6ABARXQCIiC4AREQXACKiCwAR0QWAiOgCQER0ASDyPxwEkhGX0DIWAAAAAElFTkSuQmCC';

function getNativeBarcodeScanner() {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.BarcodeScanner || cap.registerPlugin?.('BarcodeScanner') || null;
}
async function completeVerificationScan(source = 'demo', rawValue = '') {
  const user = state.user;
  const scope = activeVerificationScope();
  const requestedAt = new Date().toISOString();

  if (source === 'demo-simulation' && window.VeyaVerification.isLive()) {
    showToast('Connected to Supabase: paste the administrator\u2019s code below (or use the camera). The demo scan only works offline.');
    return;
  }

  // Call the real backend (or fall back to local)
  const { data, error, source: backendSource } = await window.VeyaVerification.submitRequest(
    rawValue || 'veya:v1:demo-scan'
  );

  if (error && backendSource === 'backend') {
    showToast(error.message || 'Scan was rejected by the server');
    return;
  }

  state.pendingVerification = true;
  state.verificationNotice = null;
  state.pendingRequest = {
    id: data?.id || ('local-' + Date.now()),   // real UUID when backend works
    name: user.name,
    alias: user.alias,
    initials: user.initials,
    scope: { ...scope },
    scanSource: source,
    requestedAt,
    expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    administratorLabel: 'Northbank Residence administration',
    qrPreview: rawValue ? String(rawValue).slice(0, 80) : 'demo-scan'
  };
  state.page = 'home';
  saveState();
  document.getElementById('modalRoot').innerHTML = '';
  showToast(backendSource === 'backend'
    ? 'Request sent. Waiting for an authorised administrator.'
    : 'Profile verification request sent to Northbank Residence administration.');
  renderApp();
}
async function startNativeQrScan() {
  const scanner = getNativeBarcodeScanner();
  if (!scanner?.scan) {
    return showToast('The camera scanner is not available in this build. Use the demo scan instead.');
  }
  try {
    const supported = await scanner.isSupported?.();
    if (supported && supported.supported === false) throw new Error('This phone does not support the native scanner.');
    const result = await scanner.scan({ formats: ['QR_CODE'] });
    const barcode = result?.barcodes?.find(item => item?.rawValue || item?.displayValue);
    const rawValue = barcode?.rawValue || barcode?.displayValue || '';
    if (!rawValue) return showToast('No QR code was captured. Try again when the administrator is ready.');
    completeVerificationScan('native-camera', rawValue);
  } catch (error) {
    console.error('Native QR scan did not complete', error);
    showToast('Camera scan cancelled or unavailable. You can use the demo scan while testing.');
  }
}
function openScanModal() {
  const scope = activeVerificationScope();
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><p class="eyebrow">Step 2 of 3 · Profile verification</p><h2>Scan the admin QR</h2></div><button class="close-btn" data-action="close-modal" aria-label="Close">${icon('close', 16)}</button></div><div class="modal-body"><div class="qr-stage"><div class="qr-preview"><div class="qr-pattern"></div></div></div><p class="muted" style="font-size:.8rem;margin:16px 0;">Stand with the authorised residence administrator and scan their temporary QR. The scan creates a pending request; it does not verify you by itself.</p><div class="notice">This request is scoped to <strong>${esc(scope.community)}</strong> at ${esc(scope.residence)}. No password, student number, or identity document is collected.</div>${verificationTimeline(2)}<button class="btn full" style="margin-top:16px;" data-action="native-scan">${icon('camera', 16)}Open camera scanner</button><button class="btn full secondary" style="margin-top:8px;" data-action="submit-verification">Use demo scan (no camera)</button>${window.VeyaVerification.isLive() ? `<label class="field" style="display:block;margin-top:16px;">Or paste the administrator\u2019s code<input id="verifyCodeInput" class="input" type="text" placeholder="veya:v1:\u2026" autocomplete="off" /></label><button class="btn full" style="margin-top:8px;" data-action="submit-pasted-code">Submit code</button>` : ''}</div></div></div>`;
  wireModalEvents();
}
async function openAdminQrModal() {
  const { data, error, source } = await window.VeyaVerification.createSession('Kora House');

  if (error) {
    showToast(error.message || 'Could not create verification session');
    return;
  }

  const live = source === 'backend';
  const expiry = data?.expiresAt ? new Date(data.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const stage = live
    ? `<div class="qr-stage"><div class="qr-preview real-qr" style="padding:16px;"><p class="eyebrow" style="margin:0 0 8px;">One-time code</p><code id="adminCodeText" style="display:block;word-break:break-all;font-size:.78rem;user-select:all;">${esc(data.token)}</code></div></div><button class="btn full secondary" style="margin-top:12px;" data-action="copy-code">Copy code</button><p class="muted" style="font-size:.8rem;margin:16px 0;">This is a real, single-use session stored in Supabase. The student pastes this code (or scans it once a QR renderer is added). It expires at ${esc(expiry)}.</p>`
    : `<div class="qr-stage"><div class="qr-preview real-qr"><img class="qr-image" src="${DEMO_ADMIN_QR_DATA_URI}" alt="Fictional Kora House verification QR" /></div></div><p class="muted" style="font-size:.8rem;margin:16px 0;">Show this on the administrator\u2019s phone while standing with the student. This fictional QR is scannable for testing; a production QR would expire and be tied to an approval session.</p>`;

  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><p class="eyebrow">Step 1 of 3 \u00b7 Administrator</p><h2>Temporary residence QR</h2></div><button class="close-btn" data-action="close-modal" aria-label="Close">${icon('close', 16)}</button></div><div class="modal-body">${stage}<div class="flex between"><span class="status pending">${live ? 'Expires ' + esc(expiry) : 'Expires in 00:42'}</span><span class="tag official">Kora House \u00b7 Northbank</span></div>${verificationTimeline(1)}<button class="btn full secondary" style="margin-top:16px;" data-action="close-modal">Close</button></div></div></div>`;
  wireModalEvents();
}
function openInfoModal(title, body) {
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><p class="eyebrow">Prototype note</p><h2>${esc(title)}</h2></div><button class="close-btn" data-action="close-modal" aria-label="Close">${icon('close', 16)}</button></div><div class="modal-body"><p class="muted" style="font-size:.86rem;">${esc(body)}</p><button class="btn full" style="margin-top:12px;" data-action="close-modal">Got it</button></div></div></div>`;
  wireModalEvents();
}
function wireModalEvents() { document.querySelectorAll('#modalRoot [data-action]').forEach(button => button.addEventListener('click', () => handleModalAction(button.dataset.action))); }
function handleModalAction(action) {
  if (action === 'close-modal') { document.getElementById('modalRoot').innerHTML = ''; return; }
  if (action === 'native-scan') return startNativeQrScan();
  if (action === 'submit-verification') return completeVerificationScan('demo-simulation');
  if (action === 'submit-pasted-code') {
    const value = document.getElementById('verifyCodeInput')?.value.trim();
    if (!value) return showToast('Paste the administrator\u2019s code first.');
    return completeVerificationScan('manual-code', value);
  }
  if (action === 'copy-code') {
    const text = document.getElementById('adminCodeText')?.textContent || '';
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => showToast('Code copied.'), () => showToast('Select the code and copy it manually.'));
    else showToast('Select the code and copy it manually.');
    return;
  }
}
async function approveRequest() {
  if (!state.pendingRequest) return;
  const res = await window.VeyaVerification.reviewRequest(state.pendingRequest.id, true);
  if (res.error) return showToast(res.error.message || 'Could not approve the request.');
  applyApproval(res.source === 'backend');
}
function applyApproval() {
  if (!state.pendingRequest) return;
  const scope = { ...(state.pendingRequest.scope || DEFAULT_VERIFICATION_SCOPE) };
  state.verified = true;
  state.verifiedScope = scope;
  state.verificationNotice = { status: 'approved', scope, decidedAt: new Date().toISOString() };
  state.verificationDraftScope = null;
  state.pendingVerification = false;
  state.pendingRequest = null;
  saveState();
  showToast(`Approved: ${scope.community} member badge is active.`);
  renderApp();
}
async function rejectRequest() {
  if (!state.pendingRequest) return;
  const res = await window.VeyaVerification.reviewRequest(state.pendingRequest.id, false);
  if (res.error) return showToast(res.error.message || 'Could not reject the request.');
  applyRejection(res.source === 'backend');
}
function applyRejection() {
  const request = state.pendingRequest;
  state.pendingVerification = false;
  state.verificationNotice = { status: 'rejected', scope: request?.scope || DEFAULT_VERIFICATION_SCOPE, decidedAt: new Date().toISOString() };
  state.pendingRequest = null;
  state.verificationDraftScope = null;
  saveState();
  showToast('Request rejected. No member badge was added.');
  renderApp();
}
function reactToPost(id) {
  const post = state.posts.find(item => item.id === id);
  if (!post) return;
  post.reacted = !post.reacted;
  post.likes += post.reacted ? 1 : -1;
  saveState(); renderApp();
  if (post.reacted) document.querySelector('.act.like[data-id="' + id + '"]')?.classList.add('pop');
}
function addComment(id) {
  if (!state.verified) return showToast('Residence verification is required to comment.');
  const input = document.getElementById('comment-input-' + id);
  const text = input?.value.trim();
  if (!text) return showToast('Write a comment first.');
  const post = state.posts.find(item => item.id === id);
  post.comments.push({ author: state.user.alias, text });
  saveState(); renderApp();
  setTimeout(() => document.getElementById('comments-' + id)?.classList.remove('hidden'), 0);
}
function createPost() {
  if (!state.verified) return showToast('Verify your residence membership first.');
  const input = document.getElementById('newPostText');
  const body = input?.value.trim();
  if (!body) return showToast('Write something before publishing.');
  state.posts.unshift({ id: Date.now(), author: state.user.alias, initials: state.user.initials, kind: 'community', label: 'Community', time: 'Just now', body, likes: 0, reacted: false, comments: [] });
  saveState(); showToast('Post published to Kora House.'); renderApp();
}
function rsvpEvent(title) {
  const event = state.events.find(item => item.title === title);
  if (event) event.rsvp = !event.rsvp;
  saveState(); showToast(event?.rsvp ? `RSVP saved for ${title}.` : `RSVP removed for ${title}.`); renderApp();
}
