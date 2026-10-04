/* messages button + scroll-aware floating buttons */
(function () {
  let last = 0;
  const getY = () => { const sc = document.getElementById('phoneScroll'); return sc && getComputedStyle(sc).overflowY === 'auto' ? sc.scrollTop : window.scrollY; };
  const onScroll = () => {
    const y = getY(), shell = document.getElementById('appShell'); if (!shell) return;
    if (y < 40 || y < last - 4) shell.classList.remove('fabs-hidden'); else if (y > last + 8) shell.classList.add('fabs-hidden');
    last = y;
  };
  document.getElementById('phoneScroll').addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
})();
/* ===== Capacitor / Android shell behavior ===== */
let appErrorShown = false;
function updateNetworkStatus() {
  const bar = document.getElementById('networkStatus');
  if (!bar) return;
  const offline = navigator.onLine === false;
  bar.hidden = !offline;
  if (offline) bar.textContent = 'Offline mode: your demo data remains available on this phone; external shortcuts need a connection.';
}
function updateViewportHeight() {
  const vv = window.visualViewport;
  const height = vv?.height || window.innerHeight;
  document.documentElement.style.setProperty('--viewport-height', `${height}px`);
  document.documentElement.classList.toggle('keyboard-open', Boolean(vv && window.innerHeight - vv.height > 120));
}
function handleVeyaBack() {
  const chatPanel = document.getElementById('chatPanel');
  const chatPop = document.getElementById('chatPop');
  const modal = document.getElementById('modalRoot');
  const notifications = document.getElementById('notificationsPanel');
  const search = document.getElementById('searchPanel');
  const profile = document.getElementById('profileMenu');
  if (chatPanel?.classList.contains('open')) { chatPanel.classList.remove('open'); return true; }
  if (chatPop?.classList.contains('open')) { chatPop.classList.remove('open'); return true; }
  if (modal?.innerHTML.trim()) { modal.innerHTML = ''; return true; }
  if (notifications?.classList.contains('open')) { closeNotifications(); return true; }
  if (search?.classList.contains('open')) { search.classList.remove('open'); return true; }
  if (profile?.classList.contains('open')) { profile.classList.remove('open'); return true; }
  if (!state.user) return false;
  if (state.page === 'viewprofile') { state.page = state.prevPage || 'home'; saveState(); renderApp(); return true; }
  if (state.page === 'profile') { state.page = 'home'; saveState(); renderApp(); return true; }
  const home = isAdmin() ? 'admin-overview' : 'home';
  if (state.page !== home) { state.page = home; saveState(); renderApp(); window.scrollTo(0, 0); return true; }
  return false;
}
function showAppError() {
  if (appErrorShown) return;
  appErrorShown = true;
  document.getElementById('appLoading')?.classList.add('is-hidden');
  const main = document.getElementById('mainContent');
  if (main && state.user) {
    main.innerHTML = `<div class="error-state"><span class="es-ic">${icon('alert', 24)}</span><strong>Veya needs a refresh</strong><p>The demo could not finish this screen. Your saved demo data is still on this phone.</p><button class="btn" type="button" onclick="location.reload()">Reload Veya</button></div>`;
  }
}
function initMobileShell() {
  updateNetworkStatus();
  updateViewportHeight();
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  window.visualViewport?.addEventListener('resize', updateViewportHeight, { passive: true });
  document.addEventListener('focusin', event => {
    if (event.target.matches('input, textarea, select')) setTimeout(() => event.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 180);
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (navigator.onLine === false && link && /^https?:/i.test(link.href)) {
      event.preventDefault();
      showToast('You are offline. Reconnect before opening this external shortcut.');
    }
  });
  const nativeApp = window.Capacitor?.Plugins?.App || window.Capacitor?.registerPlugin?.('App');
  if (nativeApp?.addListener && window.Capacitor?.isNativePlatform?.()) {
    nativeApp.addListener('backButton', () => {
      if (!handleVeyaBack()) nativeApp.exitApp?.();
    });
  }
  window.__veyaHandleNativeBack = handleVeyaBack;
  window.addEventListener('error', event => { console.error(event.error || event.message); showAppError(); });
  window.addEventListener('unhandledrejection', event => { console.error(event.reason); showAppError(); });
}
