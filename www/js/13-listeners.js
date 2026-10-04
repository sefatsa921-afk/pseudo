document.querySelectorAll('[data-demo-role]').forEach(button => button.addEventListener('click', () => loginAs(button.dataset.demoRole)));
document.getElementById('customLogin').addEventListener('click', () => loginAs('student', document.getElementById('customName').value));
document.getElementById('notificationsBtn').addEventListener('click', toggleNotifications);
document.getElementById('sosBtn').addEventListener('click', () => { closeNotifications(); openSafety(); });
document.addEventListener('click', event => {
  const panel = document.getElementById('notificationsPanel');
  if (panel.classList.contains('open') && !event.target.closest('#notificationsPanel') && !event.target.closest('#notificationsBtn')) closeNotifications();
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action="close-modal"]');
  if (button) { document.getElementById('modalRoot').innerHTML = ''; }
});
/* Phone frame: the phone's inner area scrolls instead of the page, so route scrollTo there */
(function () {
  const nativeScrollTo = window.scrollTo.bind(window);
  window.scrollTo = function (...args) {
    const sc = document.getElementById('phoneScroll');
    if (sc && getComputedStyle(sc).overflowY === 'auto') sc.scrollTo({ top: typeof args[0] === 'object' ? (args[0].top || 0) : (args[1] || 0), behavior: 'auto' });
    else nativeScrollTo(...args);
  };
})();

/* ===== Extra icons ===== */
Object.assign(ICONS, {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  alert: '<path d="m10.3 3.9-8.5 14.7A2 2 0 0 0 3.5 21.5h17a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'
});

/* ===== Theme =====
   state.theme is 'light', 'dark', or unset. Unset follows the phone's own light/dark setting. */
function systemPrefersDark() { return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
function effectiveTheme() { return state.theme === 'dark' || state.theme === 'light' ? state.theme : (systemPrefersDark() ? 'dark' : 'light'); }
function applyTheme() {
  const theme = effectiveTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = theme === 'dark' ? '#16100C' : '#F6F0E6';
}
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => { if (state.theme !== 'dark' && state.theme !== 'light') { applyTheme(); if (state.user) renderApp(); } };
  mq.addEventListener ? mq.addEventListener('change', onSystemChange) : mq.addListener && mq.addListener(onSystemChange);
}
function toggleTheme() { state.theme = effectiveTheme() === 'dark' ? 'light' : 'dark'; saveState(); applyTheme(); if (state.user) renderApp(); }
