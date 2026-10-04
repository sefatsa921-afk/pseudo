/* assistant */
function minsAgo(t) { const m = /(\d+)\s*min/.exec(t), h = /(\d+)\s*hr/.exec(t); return m ? +m[1] : h ? +h[1] * 60 : /just now/i.test(t) ? 0 : Infinity; }
function notifIcon(t) { return /lecturer|module/i.test(t) ? 'book' : t === 'Official' ? 'megaphone' : t === 'Opportunity' ? 'briefcase' : t === 'Promotion' ? 'tag' : 'users'; }
function interestingNow() {
  const w = { Official: 3, Opportunity: 3, 'Lecturer update': 3, 'Lecturer reply': 2, Community: 2, Promotion: 1, Module: 1 };
  const score = n => (w[n.type] || 0) + (state.subscriptions.includes(n.source) ? 2 : 0);
  return state.notifications.filter(n => minsAgo(n.time) <= 240).sort((a, b) => score(b) - score(a) || minsAgo(a.time) - minsAgo(b.time)).slice(0, 3);
}
function chatHighlights() { return isAdmin() ? [] : interestingNow(); }
function updateChatFabBadge() {
  const fab = document.getElementById('chatFab'); if (!fab) return;
  const n = sessionStorage.getItem('veya-pop-seen') ? 0 : chatHighlights().length;
  fab.classList.toggle('has-news', n > 0);
  fab.dataset.count = n ? String(n) : '';
  fab.setAttribute('aria-label', n ? `Ask Veya assistant, ${n} highlight${n > 1 ? 's' : ''}` : 'Ask Veya assistant');
}
/* The "while you were away" summary used to open over the first screen. Now it waits for a tap on the assistant button. */
function maybeShowChatPop() { updateChatFabBadge(); }
function showChatPop() {
  const items = chatHighlights(); if (!items.length) return false;
  sessionStorage.setItem('veya-pop-seen', '1'); updateChatFabBadge();
  const pop = document.getElementById('chatPop');
  pop.innerHTML = `<div class="cp-head"><div><strong>While you were away</strong><span>${items.length} highlight${items.length > 1 ? 's' : ''} from the last 4 hours</span></div><button class="act sm" data-pop="close" aria-label="Dismiss">${icon('close', 16)}</button></div>${items.map(n => `<div class="cp-item"><span class="cp-ic">${icon(notifIcon(n.type), 12)}</span><div><strong>${esc(n.source)}</strong> ${esc(n.title)}<small>${esc(n.time)}</small></div></div>`).join('')}<button class="btn small full" style="margin-top:8px" data-pop="chat">Ask Veya about these</button>`;
  pop.classList.add('open');
  pop.querySelector('[data-pop=close]').addEventListener('click', () => pop.classList.remove('open'));
  pop.querySelector('[data-pop=chat]').addEventListener('click', () => openChat('What did I miss?'));
  return true;
}
const msgHtml = m => `<div class="msg ${m.r}">${esc(m.t)}${m.a && m.a.length ? `<div class="msg-actions">${m.a.map(x => `<button class="chip" data-gonav="${x[1]}">${esc(x[0])}</button>`).join('')}</div>` : ''}</div>`;
function chatPush(m) { state.chat.push(m); state.chat = state.chat.slice(-40); saveState(); const box = document.getElementById('chMsgs'); if (box) { box.insertAdjacentHTML('beforeend', msgHtml(m)); box.scrollTop = box.scrollHeight; } }
function openChat(prompt) {
  document.getElementById('chatPop').classList.remove('open');
  ['searchPanel', 'profileMenu'].forEach(id => document.getElementById(id).classList.remove('open')); closeNotifications();
  const p = document.getElementById('chatPanel');
  if (!state.chat.length) state.chat.push({ r: 'bot', t: `Hi ${state.user.alias.split(' ')[0]}! I can summarise what is new, find events, bursaries and jobs, and point you to bookings. What do you need?`, a: [] });
  p.innerHTML = `<div class="ch-head"><span class="ch-bot">${icon('bot', 20)}</span><div style="flex:1"><strong>Veya assistant</strong><span>Demo assistant · answers from this app's data</span></div><button class="act sm" data-chat="close" aria-label="Close chat">${icon('close', 18)}</button></div><div class="ch-msgs" id="chMsgs">${state.chat.map(msgHtml).join('')}</div><div class="ch-sugg">${['What did I miss?', 'Upcoming events', 'Bursaries closing soon', 'Book a study room'].map(x => `<button class="chip" data-ask="${x}">${x}</button>`).join('')}</div><div class="ch-input"><input id="chInput" placeholder="Ask anything about campus…" autocomplete="off" /><button data-chat="send" aria-label="Send">${icon('send', 18)}</button></div>`;
  p.classList.add('open');
  const box = document.getElementById('chMsgs'); box.scrollTop = box.scrollHeight;
  p.querySelector('[data-chat=close]').addEventListener('click', () => p.classList.remove('open'));
  p.querySelector('[data-chat=send]').addEventListener('click', () => chatAsk(val('chInput')));
  p.querySelector('#chInput').addEventListener('keydown', e => { if (e.key === 'Enter') chatAsk(e.target.value); });
  p.querySelectorAll('[data-ask]').forEach(b => b.addEventListener('click', () => chatAsk(b.dataset.ask)));
  box.addEventListener('click', e => { const b = e.target.closest('[data-gonav]'); if (!b) return; const [pg, tab] = b.dataset.gonav.split(':'); if (tab) state[pg === 'bookings' ? 'bookTab' : 'oppTab'] = tab; state.page = pg; saveState(); p.classList.remove('open'); renderApp(); window.scrollTo(0, 0); });
  if (prompt) chatAsk(prompt); else document.getElementById('chInput').focus();
}
function chatAsk(q) {
  q = q.trim(); if (!q) return;
  const input = document.getElementById('chInput'); if (input) input.value = '';
  chatPush({ r: 'me', t: q });
  const box = document.getElementById('chMsgs'), typing = document.createElement('div');
  typing.className = 'msg bot typing'; typing.textContent = '…'; box.appendChild(typing); box.scrollTop = box.scrollHeight;
  setTimeout(() => { typing.remove(); chatPush({ r: 'bot', ...assistantReply(q) }); }, 550);
}
/* Single swap point: replace this with a call to a real language-model backend when one exists. */
function assistantReply(q) {
  const s = q.toLowerCase(), has = re => re.test(s), top = c => OPPS.filter(o => o.cat === c).slice(0, 3).map(o => `• ${o.t} (${o.pr}), closes ${o.cl}`).join('\n');
  if (has(/suicid|kill myself|self.?harm|hurt myself|end my life|want to die/)) return { t: "I'm really sorry you are going through this, and I'm glad you said something. I can't give crisis support. If you might act on these thoughts or you are in danger, please call 112 now (from a mobile in South Africa) or go to the nearest emergency room, and tell someone you trust who is nearby. For counselling, the official campus service is the right place, and you can request a session under Bookings.", a: [['Counselling requests', 'bookings:psych']] };
  if (has(/miss|catch up|summary|what'?s new|last (4|four)/)) { const it = interestingNow(); return it.length ? { t: 'In the last 4 hours:\n' + it.map(n => `• ${n.source} ${n.title} (${n.time})`).join('\n'), a: [['Today’s feed', 'home']] } : { t: 'Nothing new in the last 4 hours. You are all caught up.', a: [] }; }
  if (has(/event|rsvp|social|five|clinic|happening|this week/)) return { t: 'Coming up:\n' + state.events.map(e => `• ${e.day} ${e.month}: ${e.title} (${e.meta.split('·').slice(0, 2).join('·').trim()})${e.rsvp ? ' · you are going' : ''}`).join('\n'), a: [['Open events', 'events']] };
  if (has(/bursar|scholar|funding|financial|money|fees/)) return { t: `Bursaries:\n${top('bursary')}\n\nScholarships:\n${top('scholarship')}`, a: [['Bursaries', 'opportunities:bursaries'], ['Scholarships', 'opportunities:scholarships']] };
  if (has(/job|intern|part-time|employ|work for|earn/)) return { t: `Job openings:\n${OPPS.filter(o => o.cat === 'job').slice(0, 4).map(o => `• ${o.t} · ${o.pr} (${o.loc === 'campus' ? 'on campus' : 'off campus'}), closes ${o.cl}`).join('\n')}`, a: [['Job openings', 'opportunities:jobs']] };
  if (has(/counsel|psych|therap|stress|anxi|wellness|mental/)) return { t: 'You can request a counselling or psychology appointment under Bookings. Only the service and a preferred time are collected, so you never have to explain anything up front. Veya is not an emergency service: if someone is at risk, call 112 or use your campus emergency channels.', a: [['Request counselling', 'bookings:psych']] };
  if (has(/tutor|consult|one.on.one|lecturer|office hour/)) return { t: 'Under Bookings > One-on-one you can reserve a 20-minute slot with lecturers and peer tutors for ACC, CSC and ECO modules.', a: [['Book a slot', 'bookings:classes']] };
  if (has(/room|hall|facility|venue|field|lab|lounge|book/)) return { t: 'Bookings > Facilities lets you request the Main Hall, Study Lounge, Seminar Room 2.14, North Field or Computer Lab 4. The venue manager approves each request.', a: [['Book a facility', 'bookings:facility']] };
  if (has(/verif|qr|member|unlock/)) return { t: state.verified ? 'You are a verified residence member, so you can like, reply and post in Kora House.' : state.pendingVerification ? 'Your verification request is with the residence administration. Switch to the warden demo to approve it.' : 'Scan the administrator’s temporary QR on the Home screen to start verification.', a: [['Go to Home', 'home']] };
  if (has(/follow|feed|for you/)) return { t: 'For you mixes public posts with about half course updates. Following shows only the pages and people you follow. Use the search bar to follow societies, houses, companies and people.', a: [] };
  if (has(/profile|username|password|privacy|delete|account|settings|security/)) return { t: 'Tap your avatar (top right) for My Profile and Settings. Settings holds Security, Privacy, Edit profile (name and username) and Account deletion.', a: [['Open Settings', 'settings']] };
  if (has(/^(hi|hello|hey|yo|sup)\b/)) return { t: 'Hey! Ask me what you missed, what is on this week, or where to find bursaries, jobs and bookings.', a: [] };
  if (has(/thank|cheers|great/)) return { t: 'Any time!', a: [] };
  return { t: 'I can help with what is new, events, bursaries, scholarships, jobs, bookings, counselling requests and your profile settings. Try one of the suggestions below.', a: [] };
}
