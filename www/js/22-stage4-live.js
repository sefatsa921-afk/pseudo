/**
 * Veya Stage 4 - live campus workflows.
 *
 * Connected to the existing Supabase schema/security model:
 *   events + RSVPs, opportunities + applications, bookings,
 *   portfolio items/shares, private approved post media, notifications.
 *
 * This file never contains or requests a service-role/secret key.
 */
(function () {
  const B = window.VeyaBackend;
  if (!B) return;

  const BUCKET = 'veya-media';
  const S4 = {
    events: [], rsvps: new Map(), opportunities: [], saves: new Set(), applications: [],
    resources: [], bookings: [], credentials: [], portfolio: [], shares: [], notifications: [],
    communities: [], loading: false, ready: false, file: null, photoPreviewUrl: ''
  };
  window.VeyaStage4 = S4;

  const base = {
    renderBookings: window.renderBookings,
    renderOpportunities: window.renderOpportunities,
    renderEvents: window.renderEvents,
    renderPortfolio: window.renderPortfolio,
    renderNotificationsPanel: window.renderNotificationsPanel,
    renderTopbar: window.renderTopbar,
    handleAction: window.handleAction,
    createPost: window.createPost,
    renderPostMedia: window.renderPostMedia,
    renderCompose: window.renderCompose,
    services: window.renderServices
  };

  const live = () => Boolean(window.VeyaLive?.isLive?.());
  const me = () => B.auth?.user?.()?.id || '';
  const q = encodeURIComponent;
  const friendly = error => {
    if (typeof window.VeyaLive?._friendly === 'function') return window.VeyaLive._friendly(error);
    const text = `${error?.message || ''} ${error?.details?.message || ''}`;
    if (error?.code === 'NETWORK_ERROR') return 'You appear to be offline. Try again when you have a connection.';
    if (/EVENT_FULL/i.test(text)) return 'That event is full.';
    if (/BOOKING_SLOT_TAKEN/i.test(text)) return 'That time is already occupied.';
    if (/BOOKING_IN_PAST/i.test(text)) return 'Choose a future time.';
    if (/duplicate key|23505/i.test(text)) return 'That item already exists.';
    if (/42501|row-level security|permission denied/i.test(text)) return 'Your account is not allowed to do that yet.';
    return error?.message || 'The backend request failed.';
  };
  const esc0 = s => esc(String(s ?? ''));
  const now = () => new Date();
  const isoLocal = d => new Date(d).toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const dateParts = d => {
    const x = new Date(d);
    return { day: String(x.getDate()).padStart(2, '0'), month: x.toLocaleString('en-ZA', { month: 'short' }).toUpperCase() };
  };
  const uuidish = v => /^[0-9a-f-]{36}$/i.test(String(v || ''));

  function eventMeta(e) {
    return [e.location || 'Location TBC', new Date(e.starts_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
      e.community?.name || 'Campus', e.capacity ? `${e.capacity} places` : 'No capacity limit'].filter(Boolean).join(' · ');
  }
  function mapEvent(e) {
    const d = dateParts(e.starts_at);
    return { ...e, day: d.day, month: d.month, meta: eventMeta(e), rsvp: S4.rsvps.get(e.id)?.status === 'going' };
  }
  function mapOpp(o) {
    return {
      ...o, providerName: o.provider?.name || 'Verified provider',
      cl: o.closes_at ? new Date(o.closes_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' }) : 'Open until filled',
      trust: o.trust_label === 'sponsored' ? 'Sponsored listing' : 'Verified listing'
    };
  }

  async function loadAll({ quiet = true } = {}) {
    if (!live() || S4.loading) return;
    S4.loading = true;
    try {
      const [events, rsvps, opps, saves, apps, resources, bookings, creds, portfolio, shares, notifications, communities] = await Promise.all([
        B.listEvents?.(), B.listMyEventRsvps?.(), B.listOpportunities?.(), B.listMyOpportunitySaves?.(), B.listMyApplications?.(),
        B.listBookableResources?.(), B.listMyBookings?.(), B.listMyCredentials?.(), B.listMyPortfolioItems?.(), B.listMyPortfolioShares?.(),
        B.listMyNotifications?.(), B.listCommunities?.()
      ]);
      const failed = [events, rsvps, opps, saves, apps, resources, bookings, creds, portfolio, shares, notifications, communities].find(x => x?.error);
      if (failed?.error) window.VeyaLive?.reportError?.(failed.error, 'Events, bookings and opportunities', { force: !quiet });

      if (!events?.error) {
        S4.events = (events.data || []).map(mapEvent);
        S4.rsvps = new Map((rsvps?.data || []).map(r => [r.event_id, r]));
        S4.events = S4.events.map(mapEvent);
        state.events = S4.events.slice();
      }
      if (!opps?.error) S4.opportunities = (opps.data || []).map(mapOpp);
      if (!saves?.error) S4.saves = new Set((saves.data || []).map(r => r.opportunity_id));
      if (!apps?.error) S4.applications = apps.data || [];
      if (!resources?.error) S4.resources = resources.data || [];
      if (!bookings?.error) S4.bookings = bookings.data || [];
      if (!creds?.error) S4.credentials = creds.data || [];
      if (!portfolio?.error) S4.portfolio = portfolio.data || [];
      if (!shares?.error) S4.shares = shares.data || [];
      if (!notifications?.error) S4.notifications = notifications.data || [];
      if (!communities?.error) S4.communities = communities.data || [];
      mapNotifications();
      await signPostMediaUrls();
      S4.ready = true;
    } finally { S4.loading = false; }
    if (!quiet && state.user) renderApp();
  }

  function mapNotifications() {
    const nameById = new Map(S4.communities.map(c => [c.id, c.name]));
    state.notifications = S4.notifications.map(n => ({
      id: n.id, live: true, source: nameById.get(n.source_community_id) || 'Veya',
      sourceCommunityId: n.source_community_id, title: n.title, body: n.body || '',
      time: relTime(n.created_at), type: n.notification_type, theme: 'notice', initials: 'V',
      read: Boolean(n.read_at), entityType: n.entity_type, entityId: n.entity_id
    }));
  }

  async function signPostMediaUrls() {
    const posts = state.posts || [];
    await Promise.all(posts.map(async p => {
      if (!Array.isArray(p.media) || !p.media.length) return;
      for (const media of p.media) {
        if (!media.storagePath || media.approval !== 'approved') continue;
        const signed = await B.signedMediaUrl?.(BUCKET, media.storagePath, 1800);
        if (!signed?.error && signed?.data?.url) media.url = signed.data.url;
      }
    }));
  }

  function roleCanSubmitOpp() { return isAdmin() || ['warden', 'committee', 'moderator', 'admin'].includes(state.user?.backendRole); }
  function roleCanReview() { return isAdmin(); }
  function currentApplication(opportunityId) { return S4.applications.find(a => a.opportunity_id === opportunityId); }
  function savedOpp(id) { return S4.saves.has(id); }
  function resourceIcon(kind) { return kind === 'counselling' ? 'heart' : kind === 'facility' ? 'building' : 'cap'; }
  function bookingLabel(b) { return b.resource?.name || 'Booking'; }
  function statusTag(s) { return `<span class="tag ${s === 'confirmed' ? 'official' : s === 'declined' || s === 'cancelled' ? 'community' : 'neutral'}">${esc0(s)}</span>`; }

  // ---------- real events ----------
  window.renderEvents = function () {
    if (!live()) return base.renderEvents();
    const pending = S4.events.filter(e => e.status === 'proposed');
    const adminReview = roleCanReview() && pending.length ? `<div class="card card-pad" style="margin-bottom:16px"><p class="eyebrow">Admin · Pending events</p><h3 style="margin:0 0 8px">Review proposals</h3>${pending.map(e => `<div class="list-item"><div><strong>${esc0(e.title)}</strong><span>${esc0(e.meta)}</span><small>${esc0(e.description || 'No description')}</small></div><div class="flex" style="gap:6px"><button class="btn mint small" data-action="stage4-event-approve" data-id="${esc0(e.id)}">Approve</button><button class="btn secondary small" data-action="stage4-event-reject" data-id="${esc0(e.id)}">Decline</button></div></div>`).join('')}</div>` : '';
    const cards = S4.events.filter(e => e.status === 'approved' || e.proposed_by === me()).map(e => `<article class="card event-card"><div class="event-accent ${e.kind === 'academic' ? 'blue' : e.kind === 'opportunity_session' ? 'coral' : ''}"></div><div class="event-body"><div class="flex" style="align-items:flex-start"><span class="event-date"><strong>${e.day}</strong><span>${e.month}</span></span><div><h3 class="event-title">${esc0(e.title)}</h3><p class="event-meta">${esc0(e.meta)}</p></div></div><p class="muted" style="font-size:.78rem;margin:14px 0 0">${esc0(e.description || '')}</p><div style="margin-top:14px;display:flex;justify-content:space-between;gap:8px;align-items:center"><span class="tag ${e.status === 'approved' ? 'official' : 'community'}">${e.status === 'approved' ? 'Approved event' : 'Pending approval'}</span><button class="btn ${e.rsvp ? 'secondary' : 'small'}" data-action="stage4-rsvp" data-id="${esc0(e.id)}">${e.rsvp ? 'Going' : 'RSVP'}</button></div></div></article>`).join('');
    const proposeButton = `<button class="btn mint small" data-action="stage4-event-propose">Propose activity</button>`;
    return `${pageHead('Events', 'Live campus events and residence activities.', proposeButton)}${adminReview}<div class="grid three">${cards || '<div class="card empty" style="grid-column:1/-1">No approved events are listed yet.</div>'}</div><div class="card card-pad" style="margin-top:16px"><div class="flex between"><div><p class="eyebrow">Community ideas</p><h3 style="margin:0 0 4px">Create an activity</h3><p class="muted" style="font-size:.78rem;margin:0">Your proposal is stored on the backend and stays pending until an authorised reviewer approves it.</p></div>${proposeButton}</div></div>`;
  };

  async function openEventProposal() {
    const comms = S4.communities.filter(c => ['residence', 'house', 'society', 'campus', 'module'].includes(c.kind));
    if (!comms.length) return showToast('No communities are available for event proposals yet.');
    openSheet(`${sheetHead('Live event', 'Propose an activity')}<label class="field">Community<select id="s4EventCommunity" class="input">${comms.map(c => `<option value="${esc0(c.id)}">${esc0(c.name)}</option>`).join('')}</select></label><label class="field">Title<input id="s4EventTitle" class="input" maxlength="140" placeholder="e.g. Kora House study social" /></label><label class="field">Date and time<input id="s4EventStart" class="input" type="datetime-local" /></label><label class="field">End time (optional)<input id="s4EventEnd" class="input" type="datetime-local" /></label><label class="field">Location<input id="s4EventLocation" class="input" maxlength="200" placeholder="e.g. Courtyard" /></label><label class="field">Capacity (optional)<input id="s4EventCapacity" class="input" type="number" min="1" max="1000" /></label><label class="field">Description<textarea id="s4EventDesc" class="textarea" maxlength="2000" placeholder="What is happening?"></textarea></label><button class="btn full" data-do="save-event">Submit proposal</button>`, root => {
      root.querySelector('[data-do=save-event]').addEventListener('click', async () => {
        const title = val('s4EventTitle').trim(), start = val('s4EventStart'), end = val('s4EventEnd');
        if (title.length < 3 || !start) return showToast('Add a title and date/time.');
        const d = new Date(start), de = end ? new Date(end) : null;
        if (Number.isNaN(d.getTime()) || d <= now()) return showToast('Choose a future date/time.');
        if (de && (Number.isNaN(de.getTime()) || de <= d)) return showToast('End time must be after the start.');
        const res = await B.createEvent({ community_id: val('s4EventCommunity'), kind: 'residence', title, description: val('s4EventDesc').trim() || null, location: val('s4EventLocation').trim() || null, starts_at: d.toISOString(), ends_at: de ? de.toISOString() : null, capacity: Number(val('s4EventCapacity')) || null, status: 'proposed', trust_label: 'community', proposed_by: me() });
        if (res.error) return showToast(friendly(res.error));
        root.innerHTML = ''; await loadAll({ quiet: true }); renderApp(); showToast('Event proposal submitted for review.');
      });
    });
  }

  async function toggleRsvp(id) {
    if (!S4.rsvps.has(id)) {
      const res = await B.saveEventRsvp(id, 'going');
      if (res.error) return showToast(friendly(res.error));
    } else {
      const res = await B.removeEventRsvp(id);
      if (res.error) return showToast(friendly(res.error));
    }
    await loadAll({ quiet: true }); renderApp();
  }
  async function reviewEvent(id, approve) {
    const res = await B.reviewEvent(id, approve);
    if (res.error) return showToast(friendly(res.error));
    await loadAll({ quiet: true }); renderApp(); showToast(approve ? 'Event approved.' : 'Event declined.');
  }

  // ---------- real opportunities ----------
  window.renderOpportunities = function () {
    if (!live()) return base.renderOpportunities();
    const tab = state.oppTab || 'bursaries';
    const cat = { bursaries: 'bursary', scholarships: 'scholarship', jobs: 'job' }[tab] || 'bursary';
    const filtered = S4.opportunities.filter(o => o.kind === cat && (!o.closes_at || new Date(o.closes_at) > now()) && (cat !== 'job' || state.jobFilter === 'all' || !o.location_type || o.location_type === state.jobFilter));
    const applySet = new Set(S4.applications.map(a => a.opportunity_id));
    const card = o => `<article class="card opp"><div class="opp-top"><span class="icon-box">${icon(o.kind === 'job' ? 'briefcase' : o.kind === 'bursary' ? 'star' : 'cap', 18)}</span><div><strong>${esc0(o.title)}</strong><span>${esc0(o.providerName)}${o.location_type ? ' · ' + esc0(o.location_type) : ''}</span></div><button class="act sm save ${savedOpp(o.id) ? 'on' : ''}" data-action="stage4-opp-save" data-id="${esc0(o.id)}" aria-label="Save">${icon('bookmark', 20)}</button></div><div class="opp-tags"><span class="tag ${o.trust_label === 'sponsored' ? 'sponsored' : 'official'}">${esc0(o.trust)}</span><span class="tag">${esc0(o.cl)}</span>${o.value_label ? `<span class="tag">${esc0(o.value_label)}</span>` : ''}</div><p class="opp-elig">${esc0(o.eligibility || o.summary || '')}</p><div class="opp-actions">${o.apply_url ? `<a class="btn secondary small" href="${esc0(o.apply_url)}" target="_blank" rel="noreferrer">Provider site</a>` : ''}<button class="btn small ${applySet.has(o.id) ? 'secondary' : ''}" data-action="stage4-opp-apply" data-id="${esc0(o.id)}" ${applySet.has(o.id) ? 'disabled' : ''}>${applySet.has(o.id) ? 'Application tracked' : 'Apply on Veya'}</button><button class="link-btn" data-action="stage4-opp-report" data-id="${esc0(o.id)}">Report</button></div></article>`;
    const submit = roleCanSubmitOpp() ? `<button class="btn secondary small" data-action="stage4-opp-submit">Submit listing</button>` : '';
    return `${pageHead('Opportunities', 'Live bursaries, scholarships, jobs and programmes.', submit)}<div class="seg">${[['bursaries','Bursaries'],['scholarships','Scholarships'],['jobs','Job openings']].map(([k,l]) => `<button class="${tab === k ? 'active' : ''}" data-action="opp-tab" data-tab="${k}">${l}</button>`).join('')}</div>${cat === 'job' ? `<div class="chips" style="margin-bottom:12px">${[['all','All jobs'],['campus','On campus'],['external','Off campus'],['remote','Remote']].map(([k,l]) => `<button class="chip ${(state.jobFilter || 'all') === k ? 'on' : ''}" data-action="stage4-job-filter" data-f="${k}">${l}</button>`).join('')}</div>` : ''}${filtered.length ? filtered.map(card).join('') : '<div class="card empty">No live listings match this filter.</div>'}<div class="card card-pad" style="margin-top:8px"><p class="eyebrow">How applications work</p><p class="muted" style="font-size:.78rem;margin:0">Applying on Veya records your application and any portfolio share you choose. A provider can then review its status. External provider applications still happen on their official site.</p></div>`;
  };

  async function toggleOppSave(id) {
    const on = S4.saves.has(id);
    const res = on ? await B.unsaveOpportunity(id) : await B.saveOpportunity(id);
    if (res.error && !/23505/i.test(JSON.stringify(res.error))) return showToast(friendly(res.error));
    if (on) S4.saves.delete(id); else S4.saves.add(id);
    renderApp();
  }
  async function openOppApply(id) {
    const o = S4.opportunities.find(x => x.id === id); if (!o) return;
    const shareable = S4.portfolio.filter(i => i.visibility === 'shareable');
    openSheet(`${sheetHead('Opportunity', 'Apply to ' + esc0(o.title))}<p class="muted" style="margin:0 0 12px">${esc0(o.providerName)} · closes ${esc0(o.cl)}</p><div class="notice"><strong>Tracked on Veya.</strong> This does not submit credentials to an external website unless you also use the provider link shown on the listing.</div>${o.required_documents ? `<p style="font-size:.8rem;margin:12px 0"><strong>Typical documents:</strong> ${esc0(o.required_documents)}</p>` : ''}${shareable.length ? `<label class="check"><input type="checkbox" id="s4IncludePortfolio" checked /> Create a 72-hour portfolio share for this application</label>` : '<p class="muted" style="font-size:.76rem">You have no shareable portfolio items yet. You can still apply.</p>'}<button class="btn full" style="margin-top:14px" data-do="apply">Submit application</button>`, root => root.querySelector('[data-do=apply]').addEventListener('click', async () => {
      let shareId = null;
      if (root.querySelector('#s4IncludePortfolio')?.checked && shareable.length) {
        const shared = await B.createPortfolioShare(shareable.map(i => i.id), o.title, 72, false);
        if (shared.error) return showToast(friendly(shared.error));
        shareId = shared.data?.share_id || null;
      }
      const res = await B.applyOpportunity(id, shareId);
      if (res.error) return showToast(friendly(res.error));
      root.innerHTML = ''; await loadAll({ quiet: true }); renderApp(); showToast('Application submitted and stored securely.');
    }));
  }
  function openOppSubmit() {
    const comms = S4.communities.filter(c => ['company','opportunity','society','campus'].includes(c.kind));
    openSheet(`${sheetHead('Provider listing', 'Submit an opportunity')}<label class="field">Provider community<select id="s4OppCommunity">${comms.map(c => `<option value="${esc0(c.id)}">${esc0(c.name)}</option>`).join('')}</select></label><label class="field">Type<select id="s4OppKind"><option value="bursary">Bursary</option><option value="scholarship">Scholarship</option><option value="job">Job</option><option value="internship">Internship</option><option value="programme">Programme</option></select></label><label class="field">Title<input id="s4OppTitle" class="input" maxlength="140"></label><label class="field">Summary<textarea id="s4OppSummary" class="textarea" maxlength="2000"></textarea></label><label class="field">Value / rate<input id="s4OppValue" class="input" maxlength="80"></label><label class="field">Eligibility<textarea id="s4OppEligibility" class="textarea" maxlength="1000"></textarea></label><label class="field">Required documents<textarea id="s4OppDocs" class="textarea" maxlength="500"></textarea></label><label class="field">Location<select id="s4OppLocation"><option value="campus">Campus</option><option value="external">External</option><option value="remote">Remote</option></select></label><label class="field">Official apply URL (optional)<input id="s4OppUrl" class="input" type="url" placeholder="https://"></label><label class="field">Closing date (optional)<input id="s4OppClose" class="input" type="datetime-local"></label><button class="btn full" data-do="submit">Send for review</button>`, root => root.querySelector('[data-do=submit]').addEventListener('click', async () => {
      const title = val('s4OppTitle').trim(); if (title.length < 3) return showToast('Add a title.');
      const applyUrl = val('s4OppUrl').trim(); if (applyUrl && !/^https:\/\//i.test(applyUrl)) return showToast('The provider URL must start with https://');
      const close = val('s4OppClose'); const res = await B.submitOpportunity({ provider_community_id: val('s4OppCommunity'), kind: val('s4OppKind'), title, summary: val('s4OppSummary').trim() || null, value_label: val('s4OppValue').trim() || null, eligibility: val('s4OppEligibility').trim() || null, required_documents: val('s4OppDocs').trim() || null, location_type: val('s4OppLocation'), apply_url: applyUrl || null, closes_at: close ? new Date(close).toISOString() : null, review_state: 'pending_review', trust_label: 'unverified', created_by: me() });
      if (res.error) return showToast(friendly(res.error)); root.innerHTML = ''; showToast('Listing sent for review.');
    }));
  }

  // ---------- real bookings ----------
  window.renderBookings = function () {
    if (!live()) return base.renderBookings();
    const tab = state.bookTab || 'classes';
    const kind = tab === 'facility' ? 'facility' : tab === 'psych' ? 'counselling' : 'tutor';
    const resources = S4.resources.filter(r => r.kind === kind && r.active);
    const resourceCards = resources.map(r => `<article class="card bk-card"><div class="bk-top"><span class="icon-box">${icon(resourceIcon(r.kind), 18)}</span><div><strong>${esc0(r.name)}</strong><span>${esc0(r.description || '')} · capacity ${r.capacity}</span></div></div><button class="btn small" data-action="stage4-book" data-id="${esc0(r.id)}">Request time</button></article>`).join('');
    const mine = S4.bookings.length ? `<div class="section-head" style="margin-top:22px"><h2 style="font-size:1rem">Your bookings</h2></div><div class="card card-pad" style="padding-top:6px;padding-bottom:6px">${S4.bookings.map(b => `<div class="list-item"><div class="flex"><span class="icon-box">${icon(resourceIcon(b.resource?.kind), 18)}</span><div><strong>${esc0(bookingLabel(b))}</strong><span>${esc0(isoLocal(b.starts_at))} · ${esc0(b.purpose || 'No purpose added')}</span></div></div><div class="bk-right">${statusTag(b.status)}${['requested','confirmed'].includes(b.status) ? `<button class="link-btn" data-action="stage4-book-cancel" data-id="${esc0(b.id)}">Cancel</button>` : ''}</div></div>`).join('')}</div>` : '';
    const adminQueue = roleCanReview() ? S4.bookings.filter(b => b.status === 'requested').map(b => `<div class="list-item"><div><strong>${esc0(bookingLabel(b))}</strong><span>${esc0(isoLocal(b.starts_at))} · ${esc0(b.purpose || 'No purpose')}</span></div><div class="flex" style="gap:6px"><button class="btn mint small" data-action="stage4-book-approve" data-id="${esc0(b.id)}">Approve</button><button class="btn secondary small" data-action="stage4-book-reject" data-id="${esc0(b.id)}">Decline</button></div></div>`).join('') : '';
    return `${pageHead('Bookings', 'Request a real campus resource, tutor or counselling service.')}<div class="seg">${[['classes','One-on-one'],['psych','Counselling'],['facility','Facilities']].map(([k,l]) => `<button class="${tab === k ? 'active' : ''}" data-action="bk-tab" data-tab="${k}">${l}</button>`).join('')}</div><div class="grid two">${resourceCards || '<div class="card empty">No active resources of this type are published yet.</div>'}</div>${adminQueue ? `<div class="card card-pad" style="margin-top:16px"><p class="eyebrow">Requests waiting for review</p>${adminQueue}</div>` : ''}${mine}`;
  };

  function openBooking(id) {
    const r = S4.resources.find(x => x.id === id); if (!r) return;
    const minHours = r.kind === 'tutor' ? 0.333 : r.kind === 'counselling' ? 1 : 1;
    openSheet(`${sheetHead('Live booking', esc0(r.name))}<p class="muted" style="margin:0 0 10px">${esc0(r.description || '')} · capacity ${r.capacity}</p><label class="field">Start<input id="s4BookStart" class="input" type="datetime-local"></label><label class="field">End<input id="s4BookEnd" class="input" type="datetime-local"></label><label class="field">Purpose (optional)<input id="s4BookPurpose" class="input" maxlength="140" placeholder="Study consultation"></label><button class="btn full" data-do="book">Request booking</button><p class="muted" style="font-size:.72rem;margin-top:8px">Requests are checked for overlapping capacity on the server. Nothing is confirmed until the resource allows it.</p>`, root => {
      const start = root.querySelector('#s4BookStart'), end = root.querySelector('#s4BookEnd');
      const d = new Date(); d.setMinutes(d.getMinutes() + 60 - (d.getMinutes() % 30));
      const e = new Date(d.getTime() + minHours * 3600000);
      start.value = d.toISOString().slice(0,16); end.value = e.toISOString().slice(0,16);
      root.querySelector('[data-do=book]').addEventListener('click', async () => {
        const a = new Date(start.value), b = new Date(end.value); if (!start.value || !end.value || !(b > a) || a <= now()) return showToast('Choose a future start and a later end time.');
        const res = await B.createBooking({ resource_id: id, starts_at: a.toISOString(), ends_at: b.toISOString(), purpose: val('s4BookPurpose').trim() || null, status: r.auto_confirm ? 'confirmed' : 'requested' });
        if (res.error) return showToast(friendly(res.error)); root.innerHTML = ''; await loadAll({ quiet: true }); renderApp(); showToast(r.auto_confirm ? 'Booking confirmed.' : 'Booking request sent.');
      });
    });
  }
  async function cancelBooking(id) { const res = await B.cancelBooking(id); if (res.error) return showToast(friendly(res.error)); await loadAll({ quiet: true }); renderApp(); showToast('Booking cancelled.'); }
  async function decideBooking(id, approve) { const res = await B.decideBooking(id, approve); if (res.error) return showToast(friendly(res.error)); await loadAll({ quiet: true }); renderApp(); showToast(approve ? 'Booking approved.' : 'Booking declined.'); }

  // ---------- portfolio ----------
  window.renderPortfolio = function (embedded = false) {
    if (!live()) return base.renderPortfolio(embedded);
    const verified = S4.credentials.length > 0;
    const items = S4.portfolio.map(i => `<div class="list-item"><div><strong>${esc0(i.title)}</strong><span>${esc0(i.item_kind)} · ${i.credential ? 'Verified credential' : 'Self-reported'} · ${esc0(i.visibility)}</span>${i.description ? `<small>${esc0(i.description)}</small>` : ''}</div><div class="flex" style="gap:6px"><button class="btn secondary small" data-action="stage4-portfolio-toggle" data-id="${esc0(i.id)}">${i.visibility === 'shareable' ? 'Make private' : 'Make shareable'}</button><button class="link-btn" data-action="stage4-portfolio-delete" data-id="${esc0(i.id)}">Delete</button></div></div>`).join('');
    const cred = S4.credentials.map(c => `<div class="badge-card"><span class="badge-icon">${icon('shield', 22)}</span><div><strong>${esc0(c.title)}</strong><span>${esc0(c.issuer?.name || 'Verified issuer')} · ${isoLocal(c.issued_at)}</span></div></div>`).join('');
    const shareRows = S4.shares.slice(0, 6).map(s => `<div class="list-item"><div><strong>${esc0(s.audience_label || 'Portfolio share')}</strong><span>Expires ${isoLocal(s.expires_at)}${s.include_identity ? ' · identity included' : ' · identity hidden'}</span></div>${s.revoked_at ? '<span class="tag neutral">Revoked</span>' : `<button class="link-btn" data-action="stage4-share-revoke" data-id="${esc0(s.id)}">Revoke</button>`}</div>`).join('');
    return `${embedded ? '' : pageHead('Portfolio', 'Your verified credentials and selected work, stored in Supabase.', `<button class="btn secondary small" data-action="stage4-share-portfolio">Share selected</button>`)}<div class="grid two"><div class="card card-pad"><div class="flex"><span class="avatar" style="width:55px;height:55px;border-radius:18px">${esc0(state.user.initials)}</span><div><p class="eyebrow">Live portfolio</p><h2 style="margin-bottom:3px">${esc0(state.user.name)}</h2><p class="muted" style="margin:0;font-size:.8rem">${esc0(state.user.alias)}</p></div></div><div class="section-head" style="margin-top:24px"><h2 style="font-size:1rem">Verified credentials</h2><span class="tag official">${verified ? S4.credentials.length : '0'}</span></div>${cred || '<div class="empty" style="padding:18px">Verify a residence or receive another server-issued credential to see it here.</div>'}<div class="section-head" style="margin-top:24px"><h2 style="font-size:1rem">Portfolio items</h2><button class="btn mint small" data-action="stage4-portfolio-add">Add item</button></div>${items ? `<div class="list">${items}</div>` : '<div class="empty" style="padding:18px">No portfolio items yet.</div>'}</div><div class="card card-pad"><p class="eyebrow">Controlled sharing</p><h2>Share only what you choose</h2><p class="muted">Share links are time-limited server records. Your real name is hidden unless you explicitly include identity.</p>${shareRows ? `<div class="list" style="margin-top:14px">${shareRows}</div>` : '<div class="empty" style="padding:18px;margin-top:12px">No portfolio shares created.</div>'}<button class="btn secondary full" style="margin-top:12px" data-action="stage4-share-portfolio">Create a new share</button></div></div>`;
  };

  function addPortfolioItem() {
    openSheet(`${sheetHead('Portfolio', 'Add an item')}<label class="field">Type<select id="s4PiKind"><option value="project">Project</option><option value="role">Role</option><option value="volunteering">Volunteering</option><option value="achievement">Achievement</option><option value="credential">Credential</option></select></label><label class="field">Title<input id="s4PiTitle" class="input" maxlength="140" placeholder="Residence committee role"></label><label class="field">Description<textarea id="s4PiDesc" class="textarea" maxlength="1000"></textarea></label><label class="field">Credential (optional)<select id="s4PiCred"><option value="">No credential — self-reported</option>${S4.credentials.map(c => `<option value="${esc0(c.id)}">${esc0(c.title)}</option>`).join('')}</select></label><button class="btn full" data-do="add">Save item</button>`, root => root.querySelector('[data-do=add]').addEventListener('click', async () => {
      const title = val('s4PiTitle').trim(); if (title.length < 2) return showToast('Add a title.');
      const res = await B.createPortfolioItem({ item_kind: val('s4PiKind'), title, description: val('s4PiDesc').trim() || null, credential_id: val('s4PiCred') || null, visibility: 'private' });
      if (res.error) return showToast(friendly(res.error)); root.innerHTML = ''; await loadAll({ quiet: true }); renderApp(); showToast('Portfolio item added.');
    }));
  }
  async function togglePortfolio(id) { const item = S4.portfolio.find(i => i.id === id); if (!item) return; const res = await B.updatePortfolioItem(id, { visibility: item.visibility === 'shareable' ? 'private' : 'shareable' }); if (res.error) return showToast(friendly(res.error)); await loadAll({ quiet: true }); renderApp(); }
  async function deletePortfolio(id) { const res = await B.deletePortfolioItem(id); if (res.error) return showToast(friendly(res.error)); await loadAll({ quiet: true }); renderApp(); showToast('Portfolio item deleted.'); }
  function sharePortfolio() {
    const items = S4.portfolio.filter(i => i.visibility === 'shareable');
    if (!items.length) return showToast('Make at least one portfolio item shareable first.');
    openSheet(`${sheetHead('Portfolio sharing', 'Create controlled share')}<label class="field">Audience (optional)<input id="s4ShareAudience" class="input" maxlength="80" placeholder="Bursary provider"></label><label class="field">Expires<select id="s4ShareTtl"><option value="24">24 hours</option><option value="72" selected>72 hours</option><option value="168">7 days</option></select></label><label class="check"><input type="checkbox" id="s4ShareIdentity"> Include my real name</label><p class="muted" style="font-size:.76rem">${items.length} shareable item${items.length === 1 ? '' : 's'} will be included.</p><button class="btn full" data-do="create">Create share</button>`, root => root.querySelector('[data-do=create]').addEventListener('click', async () => {
      const res = await B.createPortfolioShare(items.map(i => i.id), val('s4ShareAudience').trim() || null, Number(val('s4ShareTtl')) || 72, Boolean(root.querySelector('#s4ShareIdentity')?.checked));
      if (res.error) return showToast(friendly(res.error));
      const token = res.data?.token;
      root.innerHTML = `<div class="modal-head"><div><p class="eyebrow">Share created</p><h2>Controlled portfolio token</h2></div></div><div class="notice"><strong>${esc0(token || 'Created')}</strong><br>Expires ${esc0(res.data?.expires_at ? isoLocal(res.data.expires_at) : 'on the server')}.</div><p class="muted" style="font-size:.76rem;margin-top:10px">Share this token only with the intended recipient. It cannot be used after expiry or revocation.</p><button class="btn secondary full" data-close>Done</button>`;
      root.querySelector('[data-close]')?.addEventListener('click', async () => { root.innerHTML = ''; await loadAll({ quiet: true }); renderApp(); });
    }));
  }
  async function revokeShare(id) { const res = await B.revokePortfolioShare(id); if (res.error) return showToast(friendly(res.error)); await loadAll({ quiet: true }); renderApp(); }

  // ---------- photo upload ----------
  window.renderCompose = function () {
    if (!live()) return base.renderCompose();
    const picked = S4.file ? `Photo selected · ${Math.round(S4.file.size / 1024)} KB` : 'Add an optional photo';
    const consent = S4.file ? `<label class="check" style="margin-top:8px;font-size:.72rem"><input type="checkbox" id="s4PhotoConsent" /> I confirm I have consent to share the people shown in this photo.</label>` : '';
    return `<div class="composer"><span class="avatar">${esc0(state.user.initials)}</span><div class="composer-main"><textarea id="newPostText" class="textarea" rows="2" placeholder="What's happening on campus?"></textarea><div class="composer-bar"><button class="act sm" type="button" data-action="stage4-add-photo" aria-label="Add photo">${icon('image', 20)}</button><span class="composer-hint">${esc0(picked)}</span><button class="btn small" data-action="create-post">Post</button></div>${consent}</div></div>`;
  };

  window.renderPostMedia = function (media) {
    if (!live()) return base.renderPostMedia(media);
    if (media.url) return `<figure class="media" style="margin-inline:0;margin-bottom:0"><img src="${esc0(media.url)}" alt="${esc0(media.alt || 'Veya community photo')}" loading="lazy" style="display:block;width:100%;height:auto;max-height:420px;object-fit:cover;border-radius:14px" /><figcaption class="media-tag">${icon('image', 12)}Community photo${media.approval === 'pending' ? '<span class="tag community" style="margin-left:6px">Pending approval</span>' : ''}</figcaption></figure>`;
    if (media.approval === 'pending') return `<div class="notice" style="margin-top:8px">Photo pending moderator approval.</div>`;
    return '';
  };

  function pickPhoto() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp,image/gif'; input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0]; if (file && file.size <= 10 * 1024 * 1024) { S4.file = file; if (S4.photoPreviewUrl) URL.revokeObjectURL(S4.photoPreviewUrl); S4.photoPreviewUrl = URL.createObjectURL(file); showToast('Photo selected. Post it when you are ready.'); renderApp(); } else if (file) showToast('Choose an image under 10 MB.');
      input.remove();
    }, { once: true });
    input.click();
  }
  async function createLivePostWithMedia() {
    if (!live()) return base.createPost();
    if (!state.verified) return showToast('Verify your residence membership first.');
    const input = document.getElementById('newPostText'), body = input?.value.trim();
    if (!body) return showToast('Write something before publishing.');
    if (S4.file && !document.getElementById('s4PhotoConsent')?.checked) return showToast('Confirm that the people shown in the photo consented to sharing.');
    const home = S4.communities.find(c => c.name === 'Kora House') || S4.communities.find(c => c.kind === 'house') || S4.communities.find(c => c.kind === 'residence');
    if (!home) return showToast('Could not find your community page.');
    if (input) input.disabled = true;
    const postRes = await B.createPost({ body, communityId: home.id, label: 'community', visibility: 'verified_members' });
    if (postRes.error) { if (input) input.disabled = false; return showToast(friendly(postRes.error)); }
    const row = Array.isArray(postRes.data) ? postRes.data[0] : postRes.data;
    if (S4.file && row?.id) {
      const ext = (S4.file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${me()}/${crypto.randomUUID?.() || Date.now()} .${ext}`.replace(' ', '');
      const up = await B.uploadPrivateMedia(BUCKET, path, S4.file);
      if (up.error) { await B.deletePost?.(row.id); return showToast(`Post created, but photo upload failed. ${friendly(up.error)}`); }
      const media = await B.createPostMedia({ post_id: row.id, owner_id: me(), storage_path: path, media_type: 'image', alt_text: 'Photo uploaded by a verified Veya student', consent_confirmed: true, approval_state: 'pending' });
      if (media.error) { await B.deletePrivateMedia?.(BUCKET, path); await B.deletePost?.(row.id); return showToast(`Photo metadata could not be saved. ${friendly(media.error)}`); }
    }
    S4.file = null; if (S4.photoPreviewUrl) { URL.revokeObjectURL(S4.photoPreviewUrl); S4.photoPreviewUrl = ''; }
    await window.VeyaLive.refresh?.({ quiet: true }); await loadAll({ quiet: true }); renderApp(); showToast('Post published to Kora House.');
  }

  // ---------- admin media review ----------
  const baseAdminPosts = window.renderAdminPosts;
  window.renderAdminPosts = function () {
    if (!live()) return baseAdminPosts();
    const pendingMedia = (state.posts || []).filter(p => (p.media || []).some(m => m.approval === 'pending')).map(p => ({ p, m: p.media.find(x => x.approval === 'pending') }));
    const queue = pendingMedia.length ? pendingMedia.map(({ p, m }) => `<div class="list-item"><div><strong>${esc0(p.author)} · ${esc0(p.body.slice(0, 90))}</strong><span>Photo pending review · ${esc0(m.alt || 'No alt text')}</span></div><div class="flex" style="gap:6px"><button class="btn mint small" data-action="media-approve" data-id="${esc0(p.id)}">Approve</button><button class="btn secondary small" data-action="media-reject" data-id="${esc0(p.id)}">Reject</button></div></div>`).join('') : '<p class="muted">No photo submissions are waiting for review.</p>';
    return `${pageHead('Announcements & media', 'Publish information and review community photo submissions.', `<button class="btn mint small" data-action="new-announcement">New announcement</button>`)}<div class="card card-pad"><p class="eyebrow">Photo approvals · ${pendingMedia.length}</p><h2>${pendingMedia.length ? 'Needs review' : 'All clear'}</h2><div class="list">${queue}</div></div>`;
  };

  // ---------- notifications ----------
  window.renderNotificationsPanel = function () {
    if (!live()) return base.renderNotificationsPanel();
    const panel = document.getElementById('notificationsPanel'); if (!panel) return;
    const fresh = state.notifications.filter(n => !n.read), earlier = state.notifications.filter(n => n.read);
    const row = n => `<button class="np-item ${n.read ? '' : 'unread'}" data-s4-notification="${esc0(n.id)}"><span class="np-ava th-notice">${esc0(n.initials || 'V')}<span class="np-type">${icon(/message/i.test(n.type) ? 'comment' : /booking/i.test(n.type) ? 'calendar' : /opportunity|application/i.test(n.type) ? 'briefcase' : 'bell', 11)}</span></span><span class="np-copy"><strong>${esc0(n.source)}</strong> ${esc0(n.title)}<small>${esc0(n.time)} · ${esc0(n.type)}</small></span>${n.read ? '' : '<span class="np-dot"></span>'}</button>`;
    panel.innerHTML = `<div class="np-head"><h2>Notifications</h2><button class="np-link" data-s4-notification-all ${fresh.length ? '' : 'disabled'}>Mark all read</button></div>${state.notifications.length ? `${fresh.length ? `<div class="np-group">New</div>${fresh.map(row).join('')}` : ''}${earlier.length ? `<div class="np-group">Earlier</div>${earlier.map(row).join('')}` : ''}` : `<div class="np-empty">${icon('bell',28)}<p>No live notifications yet.</p></div>`}<div class="np-foot"><button class="btn secondary small full" data-nav="communities">Manage followed pages</button></div>`;
    panel.querySelector('[data-s4-notification-all]')?.addEventListener('click', async () => { const res = await B.markAllNotificationsRead(); if (res.error) return showToast(friendly(res.error)); await loadAll({ quiet: true }); renderTopbar(); renderNotificationsPanel(); });
    panel.querySelectorAll('[data-s4-notification]').forEach(btn => btn.addEventListener('click', async () => { const res = await B.markNotificationRead(btn.dataset.s4Notification); if (res.error) return showToast(friendly(res.error)); const n = state.notifications.find(x => String(x.id) === btn.dataset.s4Notification); if (n) n.read = true; renderTopbar(); renderNotificationsPanel(); }));
  };
  window.renderTopbar = function () {
    base.renderTopbar();
    if (!live()) return;
    const badge = document.getElementById('notificationBadge'); if (badge) { const unread = S4.notifications.filter(n => !n.read_at).length; badge.textContent = unread > 9 ? '9+' : String(unread); badge.classList.toggle('hidden', unread === 0); }
  };

  // ---------- action routing ----------
  window.handleAction = function (action, button) {
    if (live()) {
      const d = button?.dataset || {};
      if (action === 'stage4-event-propose') return openEventProposal();
      if (action === 'stage4-rsvp') return toggleRsvp(d.id);
      if (action === 'stage4-event-approve') return reviewEvent(d.id, true);
      if (action === 'stage4-event-reject') return reviewEvent(d.id, false);
      if (action === 'stage4-job-filter') { state.jobFilter = d.f; return renderApp(); }
      if (action === 'stage4-opp-save') return toggleOppSave(d.id);
      if (action === 'stage4-opp-apply') return openOppApply(d.id);
      if (action === 'stage4-opp-submit') return openOppSubmit();
      if (action === 'stage4-opp-report') return openReportSheet({ type: 'opportunity', targetId: d.id, label: 'opportunity listing' });
      if (action === 'stage4-book') return openBooking(d.id);
      if (action === 'stage4-book-cancel') return cancelBooking(d.id);
      if (action === 'stage4-book-approve') return decideBooking(d.id, true);
      if (action === 'stage4-book-reject') return decideBooking(d.id, false);
      if (action === 'stage4-portfolio-add') return addPortfolioItem();
      if (action === 'stage4-portfolio-toggle') return togglePortfolio(d.id);
      if (action === 'stage4-portfolio-delete') return deletePortfolio(d.id);
      if (action === 'stage4-share-portfolio') return sharePortfolio();
      if (action === 'stage4-share-revoke') return revokeShare(d.id);
      if (action === 'stage4-add-photo') return pickPhoto();
      if (action === 'create-post') return createLivePostWithMedia();
      if (action === 'media-approve' || action === 'media-reject') {
        const p = state.posts.find(x => String(x.id) === String(d.id));
        const media = p?.media?.find(m => m.approval === 'pending');
        if (!media?.id) return showToast('Pending media was not found.');
        return B.reviewPostMedia?.(media.id, action === 'media-approve', action === 'media-approve' ? null : 'Photo did not pass review.').then(async r => { if (r?.error) showToast(friendly(r.error)); else { await loadAll({ quiet:true }); renderApp(); showToast(action === 'media-approve' ? 'Photo approved.' : 'Photo rejected.'); } });
      }
    }
    return base.handleAction(action, button);
  };

  // Keep the original composer available for demo mode, but make live media explicit.
  window.addPhoto = pickPhoto;

  // Initial live boot wrapper + background refresh. The underlying Stage 2/3 boot remains authoritative for auth.
  const oldBoot = window.VeyaLive?.boot;
  if (oldBoot) {
    window.VeyaLive.boot = async function (...args) {
      const result = await oldBoot.apply(this, args);
      if (live()) await loadAll({ quiet: true });
      return result;
    };
  }
  const oldSignIn = window.VeyaLive?.signIn;
  if (oldSignIn) {
    window.VeyaLive.signIn = async function (...args) {
      const result = await oldSignIn.apply(this, args);
      if (live()) await loadAll({ quiet: true });
      return result;
    };
  }

  let s4Timer = null;
  function startStage4Polling() {
    clearInterval(s4Timer);
    s4Timer = setInterval(() => { if (!document.hidden && live()) loadAll({ quiet: true }); }, 30000);
  }
  const maybeStart = () => { if (live()) startStage4Polling(); };
  setTimeout(maybeStart, 1200);
  window.addEventListener('focus', maybeStart);
  document.addEventListener('visibilitychange', maybeStart);

  // Refresh live data whenever the app navigates to a Stage 4 surface.
  const oldRenderApp = window.renderApp;
  window.renderApp = function (...args) {
    const result = oldRenderApp.apply(this, args);
    if (live() && ['events','bookings','opportunities','portfolio'].includes(state.page)) {
      loadAll({ quiet: true }).catch(err => window.VeyaLive?.reportError?.({ code: 'CLIENT_ERROR', message: err?.message || 'Unexpected error' }, 'Refreshing data'));
    }
    return result;
  };

  // Expose a small manual refresh for diagnostics.
  window.VeyaStage4.refresh = () => loadAll({ quiet: false });
})();
