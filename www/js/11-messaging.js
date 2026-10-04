/* ===== Messaging rules =====
   Student -> student: only once friends (otherwise "Add friend" sends a request).
   Student -> lecturer: only if the student is the module rep for that lecturer's module. */
const isLecturer = e => e.type === 'Profile' && /^Lecturer/.test(e.sub || '');
const lecturerModule = e => ((/^Lecturer\s*·\s*([A-Z]{3}\d{3})/.exec(e.sub || '')) || [])[1] || null;
function myRepModules() {
  const u = state.user || {};
  return Array.isArray(u.repOf) ? u.repOf : (u.alias === 'Ari N.' ? ['ACC202'] : []);
}
function friendStatus(name) {
  const s = state.social;
  if (isBlocked(name)) return 'blocked';
  return s.friends.includes(name) ? 'friends' : s.requests.includes(name) ? 'pending' : 'none';
}
function canMessage(e) {
  if (e.student) return friendStatus(e.name) === 'friends';
  if (isLecturer(e)) return myRepModules().includes(lecturerModule(e));
  return false;
}
function messageButtons(e) {
  const n = esc(e.name);
  if (isBlocked(e.name)) return `<button class="btn ghost small" data-action="unblock" data-name="${n}">Blocked · Unblock</button>`;
  if (e.student) {
    const st = friendStatus(e.name);
    if (st === 'friends') return `<button class="btn secondary small" data-action="message-open" data-name="${n}">${icon('comment', 15)}Message</button>`;
    if (st === 'pending') return `<button class="btn ghost small" disabled>Request sent</button>`;
    return `<button class="btn mint small" data-action="add-friend" data-name="${n}">${icon('plus', 15)}Add friend</button>`;
  }
  if (isLecturer(e)) return `<button class="btn secondary small" data-action="message-open" data-name="${n}">${canMessage(e) ? icon('comment', 15) : icon('lock', 15)}Message</button>`;
  return `<button class="btn secondary small" data-action="message-open" data-name="${n}">Message</button>`;
}
function addFriend(name) {
  if (friendStatus(name) !== 'none') return;
  state.social.requests.push(name); saveState();
  showToast('Friend request sent to ' + name + '.');
  renderApp();
}
function openMessage(name) {
  const e = entityOf(name);
  if (e.student) {
    if (canMessage(e)) return openDm(e);
    const pending = friendStatus(name) === 'pending';
    return openSheet(`${sheetHead('Messages', 'Message ' + esc(e.name))}<p class="muted" style="margin:0 0 6px;font-size:.84rem">${pending ? 'Your friend request is waiting to be accepted. Direct messages unlock once you are both friends.' : 'Direct messages unlock once you are both friends on Veya. Send a friend request and they can accept it.'}</p>${pending ? '<button class="btn full secondary" style="margin-top:12px" data-close>Close</button>' : '<button class="btn full" style="margin-top:12px" data-do="ok">Add friend</button>'}`,
      root => { const b = root.querySelector('[data-do=ok]'); if (b) b.addEventListener('click', () => { root.innerHTML = ''; addFriend(e.name); }); });
  }
  if (isLecturer(e)) {
    if (canMessage(e)) return openDm(e);
    const mine = myRepModules(), mod = lecturerModule(e);
    const why = mine.length
      ? `You are the module rep for ${mine.join(', ')}, so you can only message lecturers of ${mine.length > 1 ? 'those modules' : 'that module'}. ${esc(e.name)} teaches ${esc(mod || 'another module')}. Please ask that module's rep to raise your question.`
      : `Students cannot message lecturers directly. Only a module rep can, so please send your question to your ${esc(mod || 'module')} rep.`;
    const repName = repOfModule(mod);
    return openSheet(`${sheetHead('Messages', 'Message ' + esc(e.name))}<div class="notice"><strong>Module reps only.</strong><br>${why}</div>${repName ? `<button class="btn full" style="margin-top:12px" data-rep="${esc(repName)}">${icon('user', 15)}View ${esc(mod)} rep: ${esc(repName)}</button>` : ''}<button class="btn full secondary" style="margin-top:8px" data-close>Got it</button>`, root => { root.querySelector('[data-rep]')?.addEventListener('click', ev => { root.innerHTML = ''; openProfile(ev.currentTarget.dataset.rep); }); });
  }
  openInfoModal('Messages', `${e.name} shares updates publicly and does not take direct messages. Follow to see everything it posts.`);
}
function dmHtml(name) {
  const t = state.social.threads[name] || [];
  return t.length ? t.map(m => `<div class="dm-msg ${m.me ? 'me' : ''}">${esc(m.t)}</div>`).join('') : `<div class="dm-empty">No messages yet. Say hello.</div>`;
}
function openDm(e) {
  const lect = isLecturer(e);
  if (state.social.unread[e.name]) { delete state.social.unread[e.name]; saveState(); renderTopbar(); }
  const note = lect ? `${icon('shield', 14)}Messaging as module rep · ${esc(lecturerModule(e))}` : `${icon('users', 14)}You are friends on Veya`;
  openSheet(`${sheetHead(lect ? 'Module rep message' : 'Direct message', esc(e.name))}<p class="dm-note">${note}<button class="link-btn dm-opts" data-action="dm-menu" data-name="${esc(e.name)}">Report or block</button></p><div class="dm-thread" id="dmThread" data-name="${esc(e.name)}">${dmHtml(e.name)}</div><div class="dm-bar"><input id="dmInput" placeholder="Write a message…" autocomplete="off" /><button class="btn" id="dmSend" aria-label="Send">${icon('send', 16)}</button></div>`, root => {
    const box = root.querySelector('#dmThread'), input = root.querySelector('#dmInput');
    root.querySelector('[data-action=dm-menu]')?.addEventListener('click', () => openProfileMenu(e.name));
    const draw = () => { box.innerHTML = dmHtml(e.name); box.scrollTop = box.scrollHeight; };
    const send = () => {
      const text = input.value.trim(); if (!text || !canMessage(e)) return;
      (state.social.threads[e.name] = state.social.threads[e.name] || []).push({ me: true, t: text });
      input.value = ''; saveState(); draw();
      setTimeout(() => { // demo reply
        if (!document.getElementById('dmThread') || document.getElementById('dmThread').dataset.name !== e.name) return;
        const reply = lect ? 'Thanks for raising this. I will respond to the class shortly.' : 'Hey! Got your message 👋';
        state.social.threads[e.name].push({ me: false, t: reply }); saveState(); draw();
      }, 1400);
    };
    root.querySelector('#dmSend').addEventListener('click', send);
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') send(); });
    draw(); input.focus();
  });
}
