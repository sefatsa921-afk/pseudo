/* bookings */
function addBooking(b) { state.bookings.unshift({ id: Date.now(), ...b }); saveState(); renderApp(); }
function renderBookings() {
  const tab = state.bookTab || 'classes';
  const tabs = [['classes', 'One-on-one'], ['psych', 'Counselling'], ['facility', 'Facilities']];
  const taken = new Set(state.bookings.filter(b => b.kind === 'class').map(b => b.key));
  const opt = a => a.map(x => `<option>${x}</option>`).join('');
  let body = '';
  if (tab === 'classes') body = TUTORS.map(t => `<article class="card bk-card"><div class="bk-top"><span class="avatar">${t.i}</span><div><strong>${t.n}</strong><span>${t.r} · ${t.p}</span></div></div><div class="bk-slots">${t.s.map(x => { const on = taken.has(t.id + '|' + x); return `<button class="chip ${on ? 'on' : ''}" data-action="book-class" data-id="${t.id}" data-slot="${x}" ${on ? 'disabled' : ''}>${x}${on ? ' · Booked' : ''}</button>`; }).join('')}</div></article>`).join('') + '<p class="muted bk-note">20-minute one-on-one slots. Tap a time to confirm it.</p>';
  else if (tab === 'psych') body = `<div class="card card-pad"><div class="flex"><span class="icon-box">${icon('heart', 18)}</span><div><h3 style="margin:0 0 3px">Counselling and psychology</h3><span class="muted" style="font-size:.76rem">Official campus service</span></div></div><div class="notice" style="margin-top:14px">Only the service and a preferred time are collected here, never details about what you are going through. Veya is not an emergency service: if someone is at risk, contact your campus emergency and crisis channels or call 112.</div><label class="field">Service<select id="psService">${opt(PS_SERVICES)}</select></label><label class="field">Preferred time<select id="psTime">${opt(PS_TIMES)}</select></label><button class="btn full" style="margin-top:16px" data-action="book-psych">Request appointment</button><p class="muted bk-note">Counselling staff confirm through a secure area.</p></div>`;
  else body = FACILITIES.map(f => `<article class="card bk-card"><div class="bk-top"><span class="icon-box">${icon(f.ic, 18)}</span><div><strong>${f.n}</strong><span>${f.c} · ${f.d}</span></div><button class="btn small" data-action="book-facility" data-id="${f.id}">Book</button></div></article>`).join('');
  const mine = state.bookings.length ? `<div class="section-head" style="margin-top:22px"><h2 style="font-size:1rem">Your bookings</h2></div><div class="card card-pad" style="padding-top:6px;padding-bottom:6px">${state.bookings.map(b => `<div class="list-item"><div class="flex"><span class="icon-box">${icon(b.kind === 'class' ? 'cap' : b.kind === 'psych' ? 'heart' : 'building', 18)}</span><div><strong>${esc(b.title)}</strong><span>${esc(b.detail)}</span></div></div><div class="bk-right"><span class="tag ${b.status === 'Confirmed' ? 'official' : 'community'}">${esc(b.status)}</span><button class="link-btn" data-action="cancel-booking" data-id="${b.id}">Cancel</button></div></div>`).join('')}</div>` : '';
  return `${pageHead('Bookings', 'Book a lecturer, request counselling, or reserve a campus space.')}<div class="seg">${tabs.map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-action="bk-tab" data-tab="${k}">${l}</button>`).join('')}</div>${body}${mine}`;
}
function openFacilityModal(id) {
  const f = FACILITIES.find(x => x.id === id);
  const days = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i + 1); return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' }); });
  const opt = a => a.map(x => `<option>${x}</option>`).join('');
  openSheet(`${sheetHead('Facility booking', esc(f.n))}<p class="muted" style="margin:0;font-size:.8rem">${f.c} · ${f.d}</p><label class="field">Date<select id="fDate">${opt(days)}</select></label><label class="field">Time slot<select id="fSlot">${opt(FAC_SLOTS)}</select></label><label class="field">Purpose<select id="fPurpose">${opt(['Study group', 'Society meeting', 'Training or practice', 'Event'])}</select></label><button class="btn full" style="margin-top:16px" data-do="ok">Request booking</button><p class="muted bk-note">The venue manager reviews facility requests before they are confirmed.</p>`, root => root.querySelector('[data-do=ok]').addEventListener('click', () => {
    addBooking({ kind: 'facility', title: f.n, detail: `${val('fDate')} · ${val('fSlot')} · ${val('fPurpose')}`, status: 'Pending approval' });
    root.innerHTML = ''; showToast('Booking requested. You will be told once it is approved.');
  }));
}

/* opportunities */
function renderOpportunities() {
  const tab = state.oppTab || 'bursaries', jf = state.jobFilter || 'all';
  const cat = { bursaries: 'bursary', scholarships: 'scholarship', jobs: 'job' }[tab];
  const list = OPPS.filter(o => o.cat === cat && (cat !== 'job' || jf === 'all' || o.loc === jf));
  const card = o => { const saved = state.savedOpps.includes(o.id), applied = state.applied.includes(o.id); return `<article class="card opp"><div class="opp-top"><span class="icon-box">${icon(o.cat === 'job' ? 'briefcase' : o.cat === 'bursary' ? 'star' : 'cap', 18)}</span><div><strong>${o.t}</strong><span>${o.pr}${o.loc ? ' · ' + (o.loc === 'campus' ? 'On campus' : 'Off campus') : ''}</span></div><button class="act sm save ${saved ? 'on' : ''}" data-action="opp-save" data-id="${o.id}" aria-label="Save">${icon('bookmark', 20)}</button></div><div class="opp-tags"><span class="tag ${o.trust.startsWith('Sponsored') ? 'sponsored' : o.trust.startsWith('Pending') ? '' : 'official'}">${o.trust}</span><span class="tag">Closes ${o.cl}</span><span class="tag">${o.val}</span></div><p class="opp-elig">${o.el}</p><div class="opp-actions"><button class="btn small ${applied ? 'secondary' : ''}" data-action="opp-apply" data-id="${o.id}" ${applied ? 'disabled' : ''}>${applied ? 'Applied' : 'Apply'}</button><button class="link-btn" data-action="opp-report" data-id="${o.id}">Report</button></div></article>`; };
  return `${pageHead('Opportunities', 'Bursaries, scholarships and jobs, each with its source and closing date.')}
    <div class="seg">${[['bursaries', 'Bursaries'], ['scholarships', 'Scholarships'], ['jobs', 'Job openings']].map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-action="opp-tab" data-tab="${k}">${l}</button>`).join('')}</div>
    ${cat === 'job' ? `<div class="chips" style="margin-bottom:12px">${[['all', 'All jobs'], ['campus', 'On campus'], ['external', 'Off campus']].map(([k, l]) => `<button class="chip ${jf === k ? 'on' : ''}" data-action="job-filter" data-f="${k}">${l}</button>`).join('')}</div>` : ''}
    ${list.map(card).join('')}
    <div class="card card-pad" style="margin-top:6px"><p class="eyebrow">Submit a listing</p><h3 style="margin:2px 0 6px">Know something useful?</h3><p class="muted" style="font-size:.8rem;margin:0 0 12px">External providers are checked by an authorised sponsor before students see a verified label.</p><button class="btn secondary small" data-action="listing-request">Request a listing review</button></div>`;
}
