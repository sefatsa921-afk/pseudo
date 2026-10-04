/* ===== Today card ===== */
const fmtHour = h => String(Math.floor(h)).padStart(2, '0') + ':' + (h % 1 ? '30' : '00');
function renderToday() {
  const now = new Date(), h = now.getHours() + now.getMinutes() / 60;
  const classes = [['ACC202 Lecture', 'Barratt 2.1', 10], ['CSC101 Lab 3', 'Lab 4', 14], ['ECO101 Tutorial', 'Study lounge', 16.5]];
  const next = classes.find(c => c[2] > h);
  const bk = state.bookings[0];
  const row = (cls, ic, kicker, title, sub, time, attr) => `<button class="today-row" ${attr}><span class="today-ic ${cls}">${icon(ic, 16)}</span><span class="today-txt"><small>${kicker}</small><strong>${title}</strong><span>${sub}</span></span><span class="today-time">${time}</span></button>`;
  const rows = [
    next ? row('class', 'clock', 'Next class', esc(next[0]), esc(next[1]), fmtHour(next[2]), 'data-nav="map"') : row('class', 'clock', 'Classes', 'Done for today', 'Tomorrow starts with ACC202 at 10:00', '', 'data-nav="map"'),
    bk ? row('', 'calendar', 'Booking', esc(bk.title), esc(bk.detail), '', 'data-nav="bookings"') : row('deadline', 'flag', 'Deadline', 'CSC101 Lab 3 due', 'Moved to Friday by Dr. Patel', 'Fri', 'data-profile="Computer Science"')
  ].join('');
  const open = Boolean(state.todayOpen);
  const summary = next ? `Next: ${esc(next[0])} · ${fmtHour(next[2])}` : 'No more classes today';
  return `<section class="today-card${open ? ' open' : ''}" aria-label="Today"><button class="today-head" data-v2="today-toggle" aria-expanded="${open}" aria-controls="todayBody"><span class="today-sum"><strong>Today</strong><span class="today-next">${summary}</span></span><span class="today-date">${now.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}</span>${icon('chevron', 16, 'today-chev')}</button><div class="today-body" id="todayBody"${open ? '' : ' hidden'}>${rows}</div></section>`;
}

/* ===== Safety ===== */
function openSafety() {
  const call = (num, label, sub, cls = '') => `<a class="sos-row ${cls}" href="tel:${num.replace(/\s/g, '')}"><span class="sos-ic">${icon('phone', 17)}</span><span><strong>${label}</strong><small>${sub}</small></span><b>${num}</b></a>`;
  openSheet(`${sheetHead('Safety', 'Get help fast')}
    <div class="sos-main">${call('046 603 8999', 'Campus Protection Unit', '24-hour emergency line · on campus dial 8999', 'main')}</div>
    ${call('046 603 8146', 'CPU control room', 'Report an incident')}
    ${call('10111', 'Police', 'National emergency')}
    ${call('10177', 'Ambulance', 'National ambulance service')}
    ${call('112', 'Emergency from a cell', 'National toll-free')}
    ${call('082 803 0177', 'Psychological emergency', 'After-hours student support line')}
    ${call('010 205 3068', 'ER24 (university vacations)', 'Say you are a Rhodes student')}
    <div class="sos-actions"><button class="btn secondary" data-do="warden">${icon('shield', 15)} Alert my warden</button><button class="btn secondary" data-do="share">${icon('pin', 15)} Share location</button></div>
    <p class="muted" style="margin:0;font-size:.72rem">Numbers are from Rhodes University Campus Protection; the back of your student card also lists the CPU number. Veya is not an emergency service, so call first. Warden alert and location sharing are simulated in this demo.</p>`,
    root => {
      root.querySelector('[data-do=warden]').addEventListener('click', () => { root.innerHTML = ''; showToast('Alert sent to Maya Khumalo, your warden (demo).'); });
      root.querySelector('[data-do=share]').addEventListener('click', () => { root.innerHTML = ''; showToast('Location shared with your warden for 30 minutes (demo).'); });
    });
}

/* ===== Campus map ===== */
const MAP_CATS = [['all', 'All'], ['study', 'Study'], ['res', 'Residence'], ['food', 'Food'], ['safe', 'Safety'], ['serv', 'Services']];
const MAP_PLACES = [
  { id: 'lib', n: 'Library', short: 'Library', cat: 'study', x: 24, y: 30, w: 110, h: 80, d: 'Quiet floors, group study rooms, printing and research help.', hrs: 'Mon–Fri 07:30–22:00 · Sat 09:00–17:00' },
  { id: 'barratt', n: 'Barratt Lecture Hall', short: 'Barratt', cat: 'study', x: 206, y: 26, w: 110, h: 56, d: 'Large lecture venue for ECO101 and ACC202.', hrs: 'Open on timetable days' },
  { id: 'labs', n: 'Computer Labs', short: 'Labs', cat: 'study', x: 206, y: 92, w: 110, h: 34, d: 'CSC101 practicals and open-access computers.', hrs: 'Mon–Fri 08:00–20:00' },
  { id: 'lounge', n: 'Study lounge', short: 'Lounge', cat: 'study', x: 24, y: 172, w: 110, h: 40, d: 'Bookable group tables and a quiet corner.', hrs: 'Daily 07:00–23:00' },
  { id: 'affairs', n: 'Student Affairs', short: 'Affairs', cat: 'serv', x: 24, y: 222, w: 110, h: 40, d: 'Bursaries, counselling referrals and student support.', hrs: 'Mon–Fri 08:00–16:30' },
  { id: 'silo', n: 'Silo Coffee Co.', short: 'Silo', cat: 'food', x: 206, y: 172, w: 56, h: 40, d: 'Coffee and student offers.', hrs: 'Daily 07:30–17:00' },
  { id: 'dining', n: 'Dining hall', short: 'Dining', cat: 'food', x: 268, y: 172, w: 48, h: 40, d: 'Residence meals. Book or unbook on ROSS.', hrs: 'Breakfast, lunch and dinner' },
  { id: 'cpu', n: 'Campus Protection (CPU)', short: 'CPU', cat: 'safe', x: 206, y: 222, w: 52, h: 40, d: '24-hour emergency line: 046 603 8999 (on campus dial 8999).', hrs: 'Open 24 hours', tel: '0466038999' },
  { id: 'health', n: 'Health Care Centre', short: 'Health', cat: 'safe', x: 264, y: 222, w: 52, h: 40, d: 'Nursing care and basic health support for students.', hrs: 'Mon–Fri 08:00–16:30' },
  { id: 'northbank', n: 'Northbank Residence', short: 'Northbank', cat: 'res', x: 24, y: 298, w: 86, h: 50, d: 'Your residence, home of Kora House.', hrs: 'Warden: Maya Khumalo' },
  { id: 'kora', n: 'Kora House', short: 'Kora', cat: 'res', x: 118, y: 298, w: 60, h: 50, d: 'Courtyard, house common room and events.', hrs: 'Residents only' },
  { id: 'hilltop', n: 'Hilltop House', short: 'Hilltop', cat: 'res', x: 186, y: 298, w: 70, h: 50, d: 'Riverside Residence house.', hrs: 'Residents only' },
  { id: 'field', n: 'North field', short: 'Field', cat: 'serv', x: 264, y: 298, w: 52, h: 50, d: 'Five-a-side and inter-house matches.', hrs: 'Daylight hours' }
];
function renderMap() {
  const cat = state.mapCat || 'all', sel = MAP_PLACES.find(p => p.id === state.mapSel) || null;
  const dim = p => cat !== 'all' && p.cat !== cat;
  const svg = `<svg class="map-svg" viewBox="0 0 340 360" role="img" aria-label="Illustrative campus map"><rect class="m-grass" width="340" height="360"/><g class="m-road"><path d="M0 150H340"/><path d="M170 0V285"/><path d="M0 285H340"/></g>${MAP_PLACES.map(p => `<g class="m-b ${p.cat} ${sel && sel.id === p.id ? 'sel' : ''} ${dim(p) ? 'dim' : ''}" data-action="map-pick" data-id="${p.id}" role="button" tabindex="0" aria-label="${esc(p.n)}"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="9"/><text x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 3}" text-anchor="middle">${esc(p.short)}</text></g>`).join('')}</svg>`;
  const info = sel ? `<div class="map-info"><span class="tag">${esc(MAP_CATS.find(c => c[0] === sel.cat)[1])}</span><h3>${esc(sel.n)}</h3><p>${esc(sel.d)}</p><p>${icon('clock', 13)} ${esc(sel.hrs)}</p><div class="row"><a class="btn small" target="_blank" rel="noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sel.n + ' Rhodes University Makhanda')}">Open in Maps</a>${sel.tel ? `<a class="btn sos small" href="tel:${sel.tel}">Call CPU</a>` : ''}</div></div>` : `<p class="map-note">Tap a building to see details.</p>`;
  const list = MAP_PLACES.filter(p => !dim(p)).map(p => `<button class="msg-row" data-action="map-pick" data-id="${p.id}"><span class="today-ic ${p.cat === 'safe' ? 'deadline' : p.cat === 'res' ? 'class' : p.cat === 'food' ? 'event' : ''}">${icon(p.cat === 'study' ? 'book' : p.cat === 'res' ? 'building' : p.cat === 'food' ? 'tag' : p.cat === 'safe' ? 'shield' : 'pin', 17)}</span><div class="msg-main"><strong>${esc(p.n)}</strong><span>${esc(p.hrs)}</span></div>${icon('chevron', 16)}</button>`).join('');
  return `${pageHead('Campus map', 'Find venues, food and help on campus.', `<button class="btn ghost small" data-nav="services">Services</button>`)}<div class="map-chips">${MAP_CATS.map(([k, l]) => `<button class="chip ${cat === k ? 'on' : ''}" data-action="map-cat" data-cat="${k}">${l}</button>`).join('')}</div>${svg}<p class="map-note">Illustrative map, not to scale.</p>${info}${list}`;
}

/* ===== Lost & found ===== */
function ensureLF() {
  if (!state.lf) state.lf = [
    { id: 1, kind: 'found', title: 'Blue scientific calculator', place: 'Library, 2nd floor', time: '2 hrs ago', note: 'Handed in at the library desk.' },
    { id: 2, kind: 'found', title: 'Student card (initials T.M.)', place: 'Barratt Lecture Hall', time: 'Yesterday', note: 'Left with Campus Protection.' },
    { id: 3, kind: 'lost', title: 'Black umbrella', place: 'Northbank common room', time: 'Yesterday', note: 'Has a small coffee-cup keyring.' },
    { id: 4, kind: 'found', title: 'Keys on a red lanyard', place: 'North field', time: '2 days ago', note: 'Three keys and a gym tag.' },
    { id: 5, kind: 'lost', title: 'Grey hoodie', place: 'Study lounge', time: '3 days ago', note: 'Size M, with ACC notes in the pocket.' }
  ];
  return state.lf;
}
function renderLostFound() {
  const list = ensureLF(), tab = state.lfTab || 'all';
  const shown = list.filter(i => tab === 'all' || i.kind === tab);
  const tabs = [['all', 'All'], ['found', 'Found'], ['lost', 'Lost']];
  const cards = shown.map(i => `<article class="lf-card"><div class="lf-top"><span class="tag ${i.kind}">${i.kind === 'found' ? 'Found' : 'Lost'}</span><span class="muted" style="font-size:.72rem">${esc(i.time)}</span></div><h3>${esc(i.title)}</h3><p>${icon('pin', 12)} ${esc(i.place)}</p>${i.note ? `<p style="margin-top:4px">${esc(i.note)}</p>` : ''}<div class="row">${i.mine ? `<button class="btn secondary small" data-action="lf-resolve" data-id="${i.id}">Mark resolved</button>` : i.kind === 'found' ? (i.claim ? '<button class="btn ghost small" disabled>Claim sent</button>' : `<button class="btn small" data-action="lf-claim" data-id="${i.id}">This is mine</button>`) : (i.seen ? '<button class="btn ghost small" disabled>Owner notified</button>' : `<button class="btn small" data-action="lf-found" data-id="${i.id}">I found this</button>`)}</div></article>`).join('');
  return `${pageHead('Lost &amp; found', 'Report something you lost or hand in what you found.', `<button class="btn small" data-action="lf-new">${icon('plus', 15)}Post</button>`)}<div class="seg">${tabs.map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-action="lf-tab" data-tab="${k}">${l}</button>`).join('')}</div>${cards || emptyState('search', 'Nothing here', 'Nothing has been reported yet. Post an item if you lost or found something.')}<div class="notice" style="margin-top:12px">Never share your student number. Hand found items to the Campus Protection Unit and describe what is inside before you collect something.</div>`;
}
function openLfForm() {
  openSheet(`${sheetHead('Lost &amp; found', 'Post an item')}<div class="seg" id="lfKindSeg"><button class="active" data-k="lost">I lost something</button><button data-k="found">I found something</button></div><label class="field">What is it?<input id="lfTitle" class="input" maxlength="48" placeholder="e.g. Black water bottle" /></label><label class="field">Where?<input id="lfPlace" class="input" maxlength="48" placeholder="e.g. Library, 1st floor" /></label><label class="field">Details (optional)<input id="lfNote" class="input" maxlength="90" placeholder="Anything that helps identify it" /></label><button class="btn full" style="margin-top:12px" data-do="post">Post</button>`, root => {
    let kind = 'lost';
    root.querySelectorAll('#lfKindSeg button').forEach(b => b.addEventListener('click', () => { kind = b.dataset.k; root.querySelectorAll('#lfKindSeg button').forEach(x => x.classList.toggle('active', x === b)); }));
    root.querySelector('[data-do=post]').addEventListener('click', () => {
      const title = root.querySelector('#lfTitle').value.trim(), place = root.querySelector('#lfPlace').value.trim();
      if (!title || !place) return showToast('Add what it is and where.');
      ensureLF().unshift({ id: Date.now(), kind, title, place, note: root.querySelector('#lfNote').value.trim(), time: 'Just now', mine: true });
      state.lfTab = 'all'; saveState(); root.innerHTML = ''; renderApp(); showToast('Posted. Students can now see it.');
    });
  });
}

/* ===== Extra actions ===== */
function handleExtraAction(action, b) {
  const d = b.dataset, s = ensureSocial();
  const done = (msg) => { saveState(); renderApp(); if (msg) showToast(msg); return true; };
  switch (action) {
    case 'open-safety': openSafety(); return true;
    case 'toggle-theme': toggleTheme(); return true;
    case 'feed-tab': state.feedTab = d.tab; startSkeleton(380); return done();
    case 'msg-tab': state.msgTab = d.tab; return done();
    case 'open-chat': openMessage(d.name); return true;
    case 'req-accept': s.incoming = s.incoming.filter(n => n !== d.name); if (!s.friends.includes(d.name)) s.friends.push(d.name); return done('You and ' + d.name + ' are now friends.');
    case 'req-decline': s.incoming = s.incoming.filter(n => n !== d.name); return done('Request declined.');
    case 'req-cancel': s.requests = s.requests.filter(n => n !== d.name); return done('Request cancelled.');
    case 'map-pick': state.mapSel = state.mapSel === d.id ? null : d.id; saveState(); renderApp(); document.querySelector('.map-info')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return true;
    case 'map-cat': state.mapCat = d.cat; return done();
    case 'lf-tab': state.lfTab = d.tab; return done();
    case 'lf-new': openLfForm(); return true;
    case 'lf-claim': { const i = ensureLF().find(x => String(x.id) === d.id); if (i) i.claim = true; return done('Claim sent. Be ready to describe it before you collect.'); }
    case 'lf-found': { const i = ensureLF().find(x => String(x.id) === d.id); if (i) i.seen = true; return done('Thanks! The owner has been notified.'); }
    case 'lf-resolve': state.lf = ensureLF().filter(x => String(x.id) !== d.id); return done('Marked as resolved.');
  }
  return false;
}
