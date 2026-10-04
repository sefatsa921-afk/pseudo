/* actions */
function handleNewAction(action, b) {
  const d = b.dataset;
  if (action === 'bk-tab') state.bookTab = d.tab;
  else if (action === 'opp-tab') state.oppTab = d.tab;
  else if (action === 'job-filter') state.jobFilter = d.f;
  else if (action === 'profile-tab') state.profileTab = d.tab;
  else if (action === 'book-class') { const t = TUTORS.find(x => x.id === d.id); return addBooking({ kind: 'class', key: d.id + '|' + d.slot, title: t.n, detail: `${d.slot} · ${t.p} · ${t.r}`, status: 'Confirmed' }), showToast('Slot confirmed.'), true; }
  else if (action === 'book-psych') return addBooking({ kind: 'psych', title: 'Counselling: ' + val('psService'), detail: val('psTime'), status: 'Requested' }), showToast('Request sent. Staff will confirm through a secure area.'), true;
  else if (action === 'book-facility') return openFacilityModal(d.id), true;
  else if (action === 'cancel-booking') { state.bookings = state.bookings.filter(x => String(x.id) !== d.id); showToast('Booking cancelled.'); }
  else if (action === 'opp-save') { const i = state.savedOpps.indexOf(d.id); i < 0 ? state.savedOpps.push(d.id) : state.savedOpps.splice(i, 1); showToast(i < 0 ? 'Saved to your list.' : 'Removed from saved.'); }
  else if (action === 'pf-tab') { if (state.page === 'profile') state.profileTab = d.tab; else state.vpTab = d.tab; }
  else if (action === 'back') { state.page = state.prevPage || 'home'; window.scrollTo(0, 0); }
  else if (action === 'message-open') return openMessage(d.name), true;
  else if (action === 'add-friend') return addFriend(d.name), true;
  else if (action === 'reel-open') return openReelViewer(button.dataset), true;
  else if (action === 'opp-apply') {
    const o = OPPS.find(x => x.id === d.id);
    return openSheet(`${sheetHead('Apply', esc(o.t))}<p class="muted" style="margin:0 0 10px;font-size:.82rem">${esc(o.pr)} · closes ${o.cl}</p><div class="notice"><strong>You will need:</strong> ${esc(o.docs)}.<br>Your student number is never shared. Your portfolio is shared only if you choose.</div><label class="check"><input type="checkbox" id="incPortfolio" checked /> Include my verified portfolio link</label><button class="btn full" style="margin-top:14px" data-do="ok">Submit application</button>`, root => root.querySelector('[data-do=ok]').addEventListener('click', () => { state.applied.push(o.id); saveState(); root.innerHTML = ''; showToast('Application submitted.'); renderApp(); })), true;
  }
  else if (action === 'profile-verification') return openProfileVerificationModal(), true;
  else if (action === 'toggle-setting') state.profile[d.key] = !state.profile[d.key];
  else if (action === 'save-profile') { const n = val('pfName').trim(); if (n.length < 2) return showToast('Enter your full name.'), true; state.user.name = n; state.user.initials = initials(n); state.profile.bio = val('pfBio').trim(); showToast('Profile saved.'); }
  else if (action === 'save-username') { const u = val('pfUser').trim().toLowerCase(); if (!/^[a-z0-9._]{3,20}$/.test(u)) return showToast('Use 3–20 letters, numbers, dots or underscores.'), true; state.profile.username = u; showToast('Username updated to @' + u); }
  else if (action === 'edit-profile') { state.page = 'settings'; saveState(); renderApp(); document.getElementById('editProfile')?.scrollIntoView({ behavior: 'smooth' }); return true; }
  else if (action === 'change-password') return openInfoModal('Change password', 'In production you would confirm your current password or a one-time code before choosing a new one. This demo has no real password.'), true;
  else if (action === 'delete-account') return openSheet(`${sheetHead('Delete account', 'Are you sure?')}<p class="muted" style="margin:0 0 6px;font-size:.84rem">This removes your profile, posts and bookings. Some moderation and audit records may be kept where safety or the law requires it. Type DELETE to confirm.</p><label class="field"><input id="delConfirm" placeholder="DELETE" autocapitalize="characters" /></label><button class="btn danger full" style="margin-top:14px" data-do="ok" disabled>Delete my account</button>`, root => { const ok = root.querySelector('[data-do=ok]'); root.querySelector('#delConfirm').addEventListener('input', e => { ok.disabled = e.target.value !== 'DELETE'; }); ok.addEventListener('click', () => { root.innerHTML = ''; localStorage.removeItem(STORAGE_KEY); state = cloneDefault(); showLogin(); showToast('Account deleted (demo data cleared).'); }); }), true;
  else return false;
  saveState(); renderApp(); return true;
}
function initChrome() {
  document.getElementById('searchIc').innerHTML = icon('search', 16);
  document.getElementById('chatFab').innerHTML = icon('bot', 22);
  const si = document.getElementById('searchInput'), pm = document.getElementById('profileMenu');
  si.addEventListener('focus', () => { closeNotifications(); pm.classList.remove('open'); renderSearch(si.value); });
  si.addEventListener('input', () => renderSearch(si.value));
  si.addEventListener('keydown', e => { if (e.key === 'Escape') { document.getElementById('searchPanel').classList.remove('open'); si.blur(); } });
  document.getElementById('profileBtn').addEventListener('click', () => { closeNotifications(); document.getElementById('searchPanel').classList.remove('open'); renderProfileMenu(); pm.classList.toggle('open'); });
  document.getElementById('notificationsBtn').addEventListener('click', () => { document.getElementById('searchPanel').classList.remove('open'); pm.classList.remove('open'); }, true);
  document.getElementById('chatFab').addEventListener('click', () => { const p = document.getElementById('chatPanel'), pop = document.getElementById('chatPop'); if (p.classList.contains('open')) return p.classList.remove('open'); if (pop.classList.contains('open')) return pop.classList.remove('open'); if (!sessionStorage.getItem('veya-pop-seen') && showChatPop()) return; openChat(); });
  document.addEventListener('click', e => {
    const pt = e.target.closest('[data-profile]'); if (pt && !e.target.closest('[data-follow],[data-action]')) openProfile(pt.dataset.profile);
    const path = e.composedPath();
    [['searchPanel', 'searchInput'], ['profileMenu', 'profileBtn']].forEach(([pid, tid]) => { const el = document.getElementById(pid); if (el.classList.contains('open') && !path.includes(el) && !path.includes(document.getElementById(tid))) el.classList.remove('open'); });
  });
}
