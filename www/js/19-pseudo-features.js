/**
 * Pseudo implementations for features that are not production-connected yet.
 * All flows are fictional, local-first, and clearly labelled.
 */
(function () {
  const PHOTO_THEMES = [
    { theme: 'golden-hour', emoji: '📷', label: 'Campus photo', alt: 'A fictional campus photo awaiting approval' },
    { theme: 'study', emoji: '📚', label: 'Study moment', alt: 'A fictional study photo awaiting approval' },
    { theme: 'field', emoji: '🌿', label: 'Outdoor moment', alt: 'A fictional outdoor photo awaiting approval' },
    { theme: 'open-mic', emoji: '🎤', label: 'Event photo', alt: 'A fictional event photo awaiting approval' }
  ];

  const COUNSELLING_SLOTS = [
    { id: 'c1', day: 'Mon', time: '10:00 – 10:45', counsellor: 'Wellness team (demo)' },
    { id: 'c2', day: 'Tue', time: '14:00 – 14:45', counsellor: 'Wellness team (demo)' },
    { id: 'c3', day: 'Wed', time: '11:30 – 12:15', counsellor: 'Wellness team (demo)' },
    { id: 'c4', day: 'Thu', time: '15:00 – 15:45', counsellor: 'Wellness team (demo)' }
  ];

  function pushNotification(source, title, type, theme, initials) {
    state.notifications = state.notifications || [];
    state.notifications.unshift({
      id: Date.now(),
      source,
      initials: initials || source.slice(0, 2).toUpperCase(),
      title,
      time: 'Just now',
      type: type || 'Update',
      theme: theme || 'mint',
      read: false
    });
    if (!state.subscriptions.includes(source)) state.subscriptions.push(source);
    saveState();
    if (typeof updateNotificationBadge === 'function') updateNotificationBadge();
  }

  // ---------- Auth (Supabase password login when configured) ----------
  async function signInWithTestAccount() {
    const email = document.getElementById('authEmail')?.value.trim();
    const password = document.getElementById('authPassword')?.value || '';
    if (!email || password.length < 6) {
      return showToast('Enter a test email and password (min 6 characters).');
    }

    const cfg = window.VEYA_SUPABASE_CONFIG || {};
    if (!cfg.enabled || !cfg.url || !cfg.publishableKey) {
      showToast('Backend not configured — use a demo role card instead.');
      return;
    }

    if (!window.VeyaLive) { showToast('Live mode is not available in this build.'); return; }
    return window.VeyaLive.signIn(email, password);
  }

  function showUniversitySsoMessage() {
    openInfoModal(
      'University login is not connected',
      'A production build would use an official university identity provider only after written permission. This prototype does not collect student numbers, passwords for RU Connected/ROSS, or identity documents. Use a demo role or a Supabase test account instead.'
    );
  }

  // ---------- Inter-residence activity proposals ----------
  function openActivityProposalForm() {
    if (!state.user) return;
    const html = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><p class="eyebrow">Pseudo · Inter-residence</p><h2>Propose an activity</h2></div><button class="close-btn" data-action="close-modal" aria-label="Close">${icon('close', 16)}</button></div><div class="modal-body">
      <p class="muted" style="font-size:.8rem;">This creates a <strong>Pending</strong> proposal on this device. It is not an official event until a representative approves it.</p>
      <label class="field">Activity title<input id="propTitle" class="input" maxlength="60" placeholder="e.g. Friendly netball match" /></label>
      <label class="field">Type
        <select id="propType" class="input">
          <option>Sports</option><option>Cultural</option><option>Academic</option><option>Social</option><option>Community service</option>
        </select>
      </label>
      <label class="field">Suggested date / time<input id="propWhen" class="input" maxlength="40" placeholder="e.g. Sat 18 Oct · 15:00" /></label>
      <label class="field">Venue<input id="propVenue" class="input" maxlength="40" placeholder="e.g. North field" /></label>
      <label class="field">Residences involved<input id="propRes" class="input" maxlength="60" placeholder="e.g. Northbank + Oak Hall" /></label>
      <label class="field">Short description<textarea id="propDesc" class="textarea" maxlength="200" placeholder="What is the activity and who is responsible?"></textarea></label>
      <button class="btn full" style="margin-top:12px" data-do="submit-proposal">Submit for review</button>
      <button class="btn secondary full" style="margin-top:8px" data-action="close-modal">Cancel</button>
    </div></div></div>`;
    document.getElementById('modalRoot').innerHTML = html;
    wireModalEvents();
    document.querySelector('[data-do="submit-proposal"]')?.addEventListener('click', () => {
      const title = document.getElementById('propTitle')?.value.trim();
      const when = document.getElementById('propWhen')?.value.trim();
      const venue = document.getElementById('propVenue')?.value.trim();
      if (!title || !when || !venue) return showToast('Add a title, time, and venue.');
      const proposal = {
        id: 'prop-' + Date.now(),
        title,
        type: document.getElementById('propType')?.value || 'Social',
        when,
        venue,
        residences: document.getElementById('propRes')?.value.trim() || 'Northbank',
        description: document.getElementById('propDesc')?.value.trim() || '',
        status: 'Pending approval',
        proposer: state.user.alias,
        createdAt: new Date().toISOString()
      };
      state.activityProposals = state.activityProposals || [];
      state.activityProposals.unshift(proposal);
      // Also surface as a pending-looking event card
      state.events.unshift({
        day: '—',
        month: 'TBD',
        title: proposal.title,
        meta: `${proposal.venue} · ${proposal.when} · Pending inter-residence approval`,
        accent: 'blue',
        rsvp: false,
        proposalId: proposal.id,
        pending: true
      });
      pushNotification('Inter-residence', `New proposal: ${proposal.title}`, 'Proposal', 'blue', 'IR');
      saveState();
      document.getElementById('modalRoot').innerHTML = '';
      showToast('Proposal saved as Pending. A representative can approve it in the admin view.');
      renderApp();
    });
  }

  function reviewActivityProposal(proposalId, approve) {
    const list = state.activityProposals || [];
    const p = list.find(x => x.id === proposalId);
    if (!p) return showToast('Proposal not found.');
    p.status = approve ? 'Approved' : 'Declined';
    p.reviewedAt = new Date().toISOString();
    p.reviewedBy = state.user?.alias || 'Admin';
    const event = state.events.find(e => e.proposalId === proposalId);
    if (event) {
      if (approve) {
        event.pending = false;
        event.meta = `${p.venue} · ${p.when} · Approved inter-residence event`;
        event.accent = 'mint';
      } else {
        state.events = state.events.filter(e => e.proposalId !== proposalId);
      }
    }
    pushNotification('Inter-residence', `${p.title} was ${approve ? 'approved' : 'declined'}`, 'Proposal', approve ? 'mint' : 'coral', 'IR');
    saveState();
    showToast(approve ? 'Proposal approved (demo).' : 'Proposal declined (demo).');
    renderApp();
  }

  // ---------- Counselling booking (simulated) ----------
  function openCounsellingBooking() {
    const slots = COUNSELLING_SLOTS.map(s =>
      `<button class="list-item" style="width:100%;text-align:left;border:0;background:transparent;cursor:pointer;" data-slot="${s.id}">
        <div class="flex"><span class="icon-box">${icon('calendar', 18)}</span><div><strong>${esc(s.day)} · ${esc(s.time)}</strong><span>${esc(s.counsellor)} · fictional slot</span></div></div>
        <span class="btn secondary small">Request</span>
      </button>`
    ).join('');
    document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><p class="eyebrow">Pseudo · Wellness</p><h2>Request a counselling slot</h2></div><button class="close-btn" data-action="close-modal" aria-label="Close">${icon('close', 16)}</button></div><div class="modal-body">
      <div class="notice">This is a <strong>simulated</strong> booking. No counsellor is contacted, no real appointment is created, and Veya is not an emergency service.</div>
      <div class="list" style="margin-top:12px;">${slots}</div>
      <button class="btn secondary full" style="margin-top:12px" data-action="close-modal">Close</button>
    </div></div></div>`;
    wireModalEvents();
    document.querySelectorAll('[data-slot]').forEach(btn => btn.addEventListener('click', () => {
      const slot = COUNSELLING_SLOTS.find(s => s.id === btn.dataset.slot);
      if (!slot) return;
      state.counsellingBookings = state.counsellingBookings || [];
      if (state.counsellingBookings.some(b => b.slotId === slot.id && b.status !== 'Cancelled')) {
        return showToast('You already requested this demo slot.');
      }
      state.counsellingBookings.unshift({
        id: 'cb-' + Date.now(),
        slotId: slot.id,
        label: `${slot.day} · ${slot.time}`,
        status: 'Requested (demo)',
        createdAt: new Date().toISOString()
      });
      pushNotification('Wellness', `Counselling request saved for ${slot.day} ${slot.time}`, 'Booking', 'mint', 'WL');
      saveState();
      document.getElementById('modalRoot').innerHTML = '';
      showToast('Demo request saved locally. No counsellor was contacted.');
      renderApp();
    }));
  }

  // ---------- Media pending approval ----------
  function attachPendingPhoto() {
    if (!state.verified) return showToast('Verify your residence membership before adding photos.');
    const pick = PHOTO_THEMES[Math.floor(Math.random() * PHOTO_THEMES.length)];
    state.pendingPhoto = { ...pick, approval: 'pending' };
    saveState();
    showToast('Photo attached. It will need admin approval before others see it.');
    // Refresh compose hint if on home
    if (state.page === 'home') renderApp();
  }

  function approvePendingMedia(postId, approve) {
    const post = state.posts.find(p => String(p.id) === String(postId));
    if (!post?.media) return;
    if (approve) {
      post.media.approval = 'approved';
      post.label = post.label?.replace(' · Pending photo', '') || 'Photo post';
      pushNotification(post.author, 'Your photo was approved', 'Moderation', 'mint', post.initials);
      showToast('Photo approved — visible in the feed.');
    } else {
      post.media = null;
      post.label = 'Community';
      pushNotification(post.author, 'Your photo was not approved', 'Moderation', 'coral', post.initials);
      showToast('Photo removed from the post.');
    }
    saveState();
    renderApp();
  }

  // ---------- Payments stub ----------
  function showPaymentsUnavailable() {
    openInfoModal(
      'Payments are not enabled',
      'This prototype does not process payments, store card details, or connect to any payment provider. Opportunity listings may mention values for context only.'
    );
  }

  // ---------- Public API + action routing ----------
  window.VeyaPseudo = {
    signInWithTestAccount,
    showUniversitySsoMessage,
    openActivityProposalForm,
    reviewActivityProposal,
    openCounsellingBooking,
    attachPendingPhoto,
    approvePendingMedia,
    showPaymentsUnavailable,
    pushNotification
  };

  // Wire login buttons once DOM is ready
  // Each button is wired exactly once (this used to attach two click handlers, i.e. two sign-ins per tap).
  function wireLoginButtons() {
    const once = (id, fn) => { const el = document.getElementById(id); if (el && !el.dataset.wired) { el.dataset.wired = '1'; el.addEventListener('click', fn); } };
    once('authLoginBtn', () => signInWithTestAccount());
    once('uniSsoBtn', () => showUniversitySsoMessage());
  }
  document.addEventListener('DOMContentLoaded', wireLoginButtons);
  setTimeout(wireLoginButtons, 0);
})();
