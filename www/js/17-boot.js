// Boot: runs last, after every function and constant above exists.
ensureSocial();
applyTheme();
initChrome();
initMobileShell();
// With a stored backend session the app is rebuilt from the server, so keep the loading screen up until
// that finishes (max 8 s) instead of flashing stale demo content.
const restoringLive = Boolean(window.VeyaBackend?.isConfigured?.() && window.VeyaBackend.auth?.hasStoredSession?.());
if (state.user && !restoringLive) renderApp();
const hideLoading = () => requestAnimationFrame(() => document.getElementById('appLoading')?.classList.add('is-hidden'));
if (window.VeyaLive) {
  if (restoringLive) setTimeout(hideLoading, 8000);
  window.VeyaLive.boot().catch(error => console.error(error)).finally(hideLoading);
} else hideLoading();
