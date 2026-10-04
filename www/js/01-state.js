const STORAGE_KEY = 'veya-campus-prototype-v6';
const defaultState = {
  user: null,
  verified: false,
  verifiedScope: null,
  verificationDraftScope: null,
  pendingVerification: false,
  page: 'home',
  posts: [
    { id: 1, author: 'Kora House', initials: 'KH', kind: 'community', label: 'Photo post', time: '12 min ago', body: 'Golden hour at the courtyard. Thank you to everyone who brought a little warmth to the welcome social.', media: { theme: 'golden-hour', emoji: '🌅', label: 'Kora House courtyard', alt: 'A warm sunset-style photo card from the Kora House courtyard' }, likes: 84, reacted: false, comments: [{ author: 'Tumi R.', text: 'This was such a good evening.' }, { author: 'Sihle M.', text: 'The light was perfect.' }] },
    { id: 2, author: 'House Committee', initials: 'HC', kind: 'official', label: 'House announcement', time: '28 min ago', body: 'Quiet-hours reminder: please keep the east study wing clear from 20:00 tonight so the peer tutoring group can set up.', likes: 18, reacted: false, comments: [{ author: 'Amara N.', text: 'Thanks for the reminder.' }] },
    { id: 7, author: 'Dr. Naledi Mbeki', initials: 'NM', kind: 'academic', module: 'ACC201 Accounting', label: 'ACC201 update', time: '35 min ago', body: 'ACC201 students: Tutorial 4 is now available. Please complete questions 1–5 before Thursday’s consultation at 15:00 in Room 2.14.', likes: 29, reacted: false, comments: [{ author: 'Class Representative', text: 'Thank you, Dr. Mbeki. I will share this with the class.' }] },
    { id: 8, author: 'Prof. Daniel Moyo', initials: 'DM', kind: 'academic', module: 'ACC202 Accounting', label: 'ACC202 reply', time: '2 hrs ago', body: 'Yes — use the straight-line method for the depreciation question. I have added a worked example to the module resources.', replyTo: { author: 'Class Representative · ACC202', initials: 'CR', text: 'Can we use the straight-line method for Question 4, and will the worked example be available before the test?' }, likes: 41, reacted: false, comments: [] },
    { id: 9, author: 'Dr. Amina Patel', initials: 'AP', kind: 'academic', module: 'CSC101 Computer Science', label: 'CSC101 update', time: '1 hr ago', body: 'CSC101: Lab 3 submission has moved to Friday 17:00. Pair programming groups are posted on the module page.', likes: 22, reacted: false, comments: [] },
    { id: 10, author: 'Prof. Daniel Moyo', initials: 'DM', kind: 'academic', module: 'ACC202 Accounting', label: 'ACC202 reminder', time: '3 hrs ago', body: 'ACC202: the depreciation quiz opens at 08:00 tomorrow and closes at 20:00. One attempt only, so read the instructions first.', likes: 31, reacted: false, comments: [] },
    { id: 11, author: 'Prof. Thabo Nkosi', initials: 'TN', kind: 'academic', module: 'ECO101 Economics', label: 'ECO101 update', time: '3 hrs ago', body: 'ECO101: tomorrow’s lecture moves to the Barratt Lecture Theatre. Bring a calculator for the elasticity examples.', likes: 17, reacted: false, comments: [] },
    { id: 12, author: 'Ms. Lerato Dube', initials: 'LD', kind: 'academic', module: 'MAN101 Management', label: 'MAN101 update', time: '4 hrs ago', body: 'MAN101: case study groups are now on the module page. Please meet your group before Wednesday’s tutorial.', likes: 14, reacted: false, comments: [] },
    { id: 3, author: 'Kora House', initials: 'KH', kind: 'community', label: 'Match day', time: '1 hr ago', body: 'The sunset five-a-side is on this Friday. Bring water, good energy, and a team name that is less serious than your warm-up.', media: { theme: 'field', emoji: '⚽', label: 'Five-a-side warm-up', alt: 'A green field-style photo card for the house football activity' }, likes: 61, reacted: false, comments: [{ author: 'Tumi R.', text: 'Kora United is ready.' }, { author: 'Sihle M.', text: 'Adding this to my calendar.' }] },
    { id: 4, author: 'Maya Khumalo', initials: 'MK', kind: 'official', label: 'Warden update', time: 'Yesterday', body: 'Welcome to the Veya pilot. This space is for useful residence information and respectful community moments. Report anything that feels unsafe.', likes: 46, reacted: false, comments: [] },
    { id: 5, author: 'Ari N.', initials: 'AN', kind: 'community', label: 'Study moment', time: 'Yesterday', body: 'Small reminder that progress can look like one page, one question, and one friend checking in.', media: { theme: 'study', emoji: '📚', label: 'Late study session', alt: 'A warm library-style photo card for a late study session' }, likes: 37, reacted: false, comments: [{ author: 'Nia A.', text: 'Needed this today.' }] },
    { id: 6, author: 'Culture Circle', initials: 'CC', kind: 'community', label: 'Society update', time: '2 days ago', body: 'Open mic sign-ups are live. Bring poetry, music, comedy, or just a story you want to tell.', media: { theme: 'open-mic', emoji: '🎤', label: 'Open mic night', alt: 'A terracotta poster-style photo card for an open mic event' }, likes: 52, reacted: false, comments: [] }
  ],
  promotions: [
    { id: 1, company: 'Silo Coffee Co.', initials: 'SC', source: 'Silo Coffee Co.', title: 'Study fuel for less.', body: 'Students get 10% off hot drinks before 10:00. Show your student profile at the counter.', cta: 'View student offer', theme: 'coffee', emoji: '☕', time: 'Sponsored · 2 hrs ago' },
    { id: 2, company: 'Makhanda Mobile', initials: 'MM', source: 'Makhanda Mobile', title: 'Stay connected on a student budget.', body: 'A verified local data bundle for late-night study, group projects, and your favourite feeds.', cta: 'See bundle', theme: 'data', emoji: '📶', time: 'Sponsored · Yesterday' },
    { id: 3, company: 'Theatre Lane', initials: 'TL', source: 'Theatre Lane', title: 'Student nights are back.', body: 'Two-for-one student tickets for this weekend’s live showcase. Limited seats available.', cta: 'View event', theme: 'tickets', emoji: '🎟️', time: 'Verified business · 2 days ago' }
  ],
  subscriptions: ['Kora House', 'Northbank Residence', 'FutureFound', 'Study Hub', 'Accounting'],
  notifications: [
    { id: 1, source: 'Kora House', initials: 'KH', title: 'posted a new photo from the courtyard', time: '12 min ago', type: 'Community', theme: 'golden-hour', read: false },
    { id: 2, source: 'Northbank Residence', initials: 'NB', title: 'updated the quiet-hours announcement', time: '28 min ago', type: 'Official', theme: 'notice', read: false },
    { id: 3, source: 'FutureFound', initials: 'FF', title: 'posted a new bursary opportunity', time: '1 hr ago', type: 'Opportunity', theme: 'opportunity', read: false },
    { id: 4, source: 'Study Hub', initials: 'SH', title: 'shared a new study-session reminder', time: 'Yesterday', type: 'Module', theme: 'study', read: true },
    { id: 6, source: 'Accounting', initials: 'NM', title: 'posted an ACC201 tutorial update', time: '35 min ago', type: 'Lecturer update', theme: 'academic', read: false },
    { id: 7, source: 'Accounting', initials: 'DM', title: 'replied to the ACC202 class question', time: '2 hrs ago', type: 'Lecturer reply', theme: 'academic', read: false },
    { id: 8, source: 'Computer Science', initials: 'AP', title: 'moved the CSC101 Lab 3 deadline to Friday', time: '1 hr ago', type: 'Lecturer update', theme: 'academic', read: false },
    { id: 9, source: 'Economics', initials: 'TN', title: 'moved tomorrow’s ECO101 lecture to Barratt', time: '3 hrs ago', type: 'Lecturer update', theme: 'academic', read: false },
    { id: 5, source: 'Silo Coffee Co.', initials: 'SC', title: 'posted a new student offer', time: '2 hrs ago', type: 'Promotion', theme: 'coffee', read: false }
  ],
  pendingRequest: null,
  verificationNotice: null,
  profile: { username: '', bio: '', twoFactor: false, loginAlerts: true, discoverable: true, showResidence: true, timelinePublic: true },
  social: { friends: ['Sipho D.'], requests: [], incoming: ['Thandi M.'], unread: { 'Sipho D.': 1 }, threads: { 'Sipho D.': [{ me: false, t: 'Hey Ari! Are you coming to the house social on Thursday?' }] } },
  bookings: [], savedOpps: [], applied: [], chat: [], viewProfile: '', vpTab: 'posts', prevPage: 'home', bookTab: 'classes', oppTab: 'bursaries', jobFilter: 'all', profileTab: 'timeline',
  events: [
    { day: '24', month: 'SEP', title: 'Kora House welcome social', meta: 'Courtyard · 18:30 · Approved residence event', accent: 'mint', rsvp: false },
    { day: '27', month: 'SEP', title: 'Sunset five-a-side', meta: 'North field · 16:00 · Inter-house proposal', accent: 'blue', rsvp: false },
    { day: '02', month: 'OCT', title: 'Bursary application clinic', meta: 'Study lounge · 13:00 · Opportunity session', accent: 'coral', rsvp: false }
  ],
  reports: [
    { id: 1, type: 'Photo report', summary: 'A media post needs consent review.', community: 'Kora House', status: 'Needs review', time: '2 hrs ago' }
  ],
  blocked: [],
  hiddenPosts: [],
  // Pseudo-feature state (local demo only)
  activityProposals: [],
  counsellingBookings: [],
  pendingPhoto: null,          // { theme, label, alt } attached to next post
  authEmail: null              // last email used for backend login (optional)
};

// Demo events are dated relative to today so they never look stale.
const DEMO_EVENT_OFFSETS = { 'Kora House welcome social': 2, 'Sunset five-a-side': 5, 'Bursary application clinic': 8 };
const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function refreshDemoDates(st) {
  (st.events || []).forEach(ev => {
    const off = DEMO_EVENT_OFFSETS[ev.title];
    if (off === undefined) return;
    const d = new Date(); d.setDate(d.getDate() + off);
    ev.day = String(d.getDate()).padStart(2, '0'); ev.month = MONTH_ABBR[d.getMonth()];
  });
  return st;
}
function greetingWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

let state = loadState();
const backendPreview = { status: 'idle', communities: [], modules: [], error: '' };

const demoUsers = {
  student: { name: 'Amara Ndlovu', alias: 'Ari N.', initials: 'AN', role: 'Student', userType: 'student', tone: 'mint', repOf: ['ACC202'] },
  warden: { name: 'Maya Khumalo', alias: 'Maya K.', initials: 'MK', role: 'Residence Warden', userType: 'warden', tone: 'blue' },
  committee: { name: 'Lebo Dlamini', alias: 'Lebo D.', initials: 'LD', role: 'House Committee', userType: 'committee', tone: 'coral' }
};

function cloneDefault() { return JSON.parse(JSON.stringify(defaultState)); }
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return refreshDemoDates(saved ? { ...cloneDefault(), ...saved } : cloneDefault());
  } catch (error) { return refreshDemoDates(cloneDefault()); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}
function initials(name) {
  return name.split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase();
}
function currentUser() { return state.user; }
function isAdmin() { return ['warden', 'committee'].includes(state.user?.userType); }
function showToast(message) {
  const root = document.getElementById('toastRoot');
  root.innerHTML = `<div class="toast" role="status" aria-live="polite">${esc(message)}</div>`;
  setTimeout(() => { root.innerHTML = ''; }, 3200);
}
function resetDemo() {
  state = cloneDefault();
  saveState();
  showLogin();
}
function showLogin() {
  document.getElementById('loginScreen').style.display = 'grid';
  document.getElementById('appShell').classList.remove('active');
  document.getElementById('modalRoot').innerHTML = '';
}
function loginAs(userType, customName = '') {
  if (customName.trim()) {
    state.user = { name: customName.trim(), alias: customName.trim().split(' ')[0] + ' V.', initials: initials(customName.trim()), role: 'Student', userType: 'student', tone: 'mint', repOf: [] };
  } else {
    state.user = { ...demoUsers[userType] };
  }
  state.page = isAdmin() ? 'admin-overview' : 'home';
  saveState();
  window.scrollTo(0, 0); // the login screen is long; don't carry its scroll position into the app
  startSkeleton(550);
  renderApp();
}
function logout() { sessionStorage.removeItem('veya-pop-seen'); sessionStorage.removeItem('veya-access-token'); window.veyaAccessToken = '';  state.user = null; saveState(); showLogin(); }
