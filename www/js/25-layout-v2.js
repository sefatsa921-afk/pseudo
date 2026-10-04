/* ===== Layout v2 =====
   Campus hub, Events agenda, Opportunities "Saved" filter, full-screen message thread, and a few
   small controls (Today toggle, dismiss banner). It works by (a) adding one page and (b) enhancing
   the DOM after each render, so it covers both the demo and the live-mode screens, which share class names. */

/* ---------- Campus hub (fifth tab) ---------- */
function renderCampus() {
  const tile = (page, ic, title, text) => `<button class="campus-tile" data-nav="${page}"><span class="icon-box">${icon(ic, 22)}</span><span class="ct-txt"><strong>${title}</strong><span>${text}</span></span>${icon('chevron', 16, 'ct-chev')}</button>`;
  const link = ([ic, label, href]) => `<a class="campus-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><span class="icon-box">${icon(ic, 18)}</span><span>${esc(label)}</span>${icon('arrow', 14, 'ct-ext')}</a>`;
  const open = state.page === 'campus' ? '' : '';
  return `${pageHead('Campus', 'Everything beyond your feed, in one place.')}${open}
    <section class="campus-group" aria-labelledby="cg1"><h2 id="cg1" class="campus-h">Get things done</h2>
      <div class="campus-grid">
        ${tile('opportunities', 'briefcase', 'Opportunities', 'Bursaries, scholarships, jobs')}
        ${tile('bookings', 'clock', 'Bookings', 'Tutors, counselling, venues')}
        ${tile('portfolio', 'star', 'Portfolio', 'Your verified record')}
        ${tile('services', 'grid', 'Services', 'Campus services')}
      </div>
    </section>
    <section class="campus-group" aria-labelledby="cg2"><h2 id="cg2" class="campus-h">Around campus</h2>
      <div class="campus-grid">
        ${tile('map', 'map', 'Campus map', 'Find buildings and help points')}
        ${tile('lostfound', 'search', 'Lost &amp; found', 'Report or find an item')}
      </div>
    </section>
    <section class="campus-group" aria-labelledby="cg3"><h2 id="cg3" class="campus-h">School links</h2>
      <div class="campus-links">${SCHOOL_LINKS.map(link).join('')}</div>
    </section>
    <section class="campus-group" aria-labelledby="cg4"><h2 id="cg4" class="campus-h">Social</h2>
      <div class="campus-links">${SOCIAL_LINKS.map(link).join('')}</div>
    </section>`;
}

/* ---------- small controls (delegated, so they survive re-renders) ---------- */
document.addEventListener('click', event => {
  const t = event.target.closest('[data-v2]'); if (!t) return;
  const act = t.dataset.v2;
  if (act === 'today-toggle') { state.todayOpen = !state.todayOpen; saveState(); renderMain(); return; }
  if (act === 'dismiss-verify') { state.dismissVerify = true; saveState(); renderMain(); return; }
  if (act === 'opp-saved') { state.oppSavedOnly = !state.oppSavedOnly; saveState(); renderMain(); return; }
});

/* ---------- after every render ---------- */
function v2EnhancePage() {
  const main = document.getElementById('mainContent'); if (!main) return;
  if (state.page === 'events') v2Agenda(main);
  if (state.page === 'opportunities') v2OppFilter(main);
}

/* Events: group the existing cards under month headings, with the date as a left rail.
   Cards are moved, not rebuilt, so their RSVP/approve handlers keep working. */
function v2Agenda(main) {
  const grid = main.querySelector('.grid.three'); if (!grid || grid.dataset.agenda) return;
  const cards = [...grid.querySelectorAll(':scope > .event-card')]; if (!cards.length) return;
  grid.dataset.agenda = '1'; grid.classList.add('agenda');
  const MONTHS = { JAN: 'January', FEB: 'February', MAR: 'March', APR: 'April', MAY: 'May', JUN: 'June', JUL: 'July', AUG: 'August', SEP: 'September', OCT: 'October', NOV: 'November', DEC: 'December' };
  let lastMonth = '';
  cards.forEach(card => {
    const d = card.querySelector('.event-date'); const day = d?.querySelector('strong')?.textContent?.trim() || '';
    const mon = (d?.querySelector('span')?.textContent || '').trim().toUpperCase();
    if (mon && mon !== lastMonth) {
      lastMonth = mon;
      const h = document.createElement('h2'); h.className = 'agenda-month'; h.textContent = MONTHS[mon] || mon;
      grid.insertBefore(h, card);
    }
    const row = document.createElement('div'); row.className = 'agenda-row';
    const rail = document.createElement('div'); rail.className = 'agenda-date'; rail.setAttribute('aria-hidden', 'true');
    rail.innerHTML = `<b>${esc(day)}</b><span>${esc(mon)}</span>`;
    card.parentNode.insertBefore(row, card); row.appendChild(rail); row.appendChild(card);
  });
}

/* Opportunities: a "Saved" chip that narrows the list to bookmarked listings (works for demo and live cards) */
function v2OppFilter(main) {
  const cards = [...main.querySelectorAll('.card.opp')]; if (!cards.length) return;
  const savedCount = cards.filter(c => c.querySelector('.save.on')).length;
  const on = Boolean(state.oppSavedOnly);
  const bar = document.createElement('div'); bar.className = 'opp-bar';
  bar.innerHTML = `<span class="opp-count" role="status">${on ? savedCount : cards.length} listing${(on ? savedCount : cards.length) === 1 ? '' : 's'}</span><button class="chip${on ? ' on' : ''}" data-v2="opp-saved" aria-pressed="${on}">${icon('bookmark', 14)} Saved${savedCount ? ' (' + savedCount + ')' : ''}</button>`;
  const first = cards[0]; first.parentNode.insertBefore(bar, first);
  if (on) {
    cards.forEach(c => { if (!c.querySelector('.save.on')) c.hidden = true; });
    if (!savedCount) bar.insertAdjacentHTML('afterend', `<div class="card empty opp-empty">Nothing saved yet. Tap the bookmark on a listing to keep it here.</div>`);
  }
}

/* hook into the single place every page render passes through */
(function () {
  const baseWire = window.wirePageEvents;
  window.wirePageEvents = function () { baseWire.apply(this, arguments); try { v2EnhancePage(); } catch (e) { console.error('layout v2', e); } };
})();

/* ---------- Messages: open a conversation as a full-screen thread, not a bottom sheet ----------
   The demo and live code both call openSheet() and produce the same .dm-thread / .dm-bar markup, so we only
   change how it is presented. All sending/loading logic stays where it was. */
(function () {
  const baseOpenSheet = window.openSheet;
  window.openSheet = function (html, bind) {
    baseOpenSheet(html, bind);
    const modal = document.querySelector('#modalRoot .modal');
    if (!modal || !modal.querySelector('#dmThread')) return;
    modal.classList.add('modal-dm'); modal.parentElement?.classList.add('dm-backdrop');
    const head = modal.querySelector('.modal-head'); if (!head) return;
    const who = head.querySelector('h2')?.textContent || 'Conversation';
    const kind = head.querySelector('.eyebrow')?.textContent || '';
    const ini = who.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
    head.innerHTML = `<button class="dm-back" aria-label="Back to messages">${icon('chevron', 20)}</button><span class="avatar" aria-hidden="true">${esc(ini)}</span><div class="dm-who"><strong>${esc(who)}</strong><span>${esc(kind)}</span></div><button class="dm-more" aria-label="Report or block ${esc(who)}">${icon('more', 20)}</button>`;
    head.querySelector('.dm-back').addEventListener('click', () => { document.getElementById('modalRoot').innerHTML = ''; if (typeof renderTopbar === 'function') renderTopbar(); if (state.page === 'messages') renderMain(); });
    head.querySelector('.dm-more').addEventListener('click', () => modal.querySelector('[data-action="dm-menu"]')?.click());
    const thread = modal.querySelector('#dmThread'); if (thread) thread.scrollTop = thread.scrollHeight;
  };
})();
