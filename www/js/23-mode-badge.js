/**
 * Mode badge: always tells the person whether what they see is real.
 *   Live            - signed in to Supabase and the backend is answering
 *   Offline         - signed in, but the backend can't be reached (showing last loaded data)
 *   Offline demo    - demo role card: fictional data, nothing is saved to the server
 * Hidden on the sign-in screen.
 */
(function () {
  const badge = document.getElementById('modeBadge');
  if (!badge) return;
  let reachable = true;   // last known result of talking to Supabase

  function currentMode() {
    if (typeof state === 'undefined' || !state.user) return null;
    const live = Boolean(window.VeyaLive?.isLive?.());
    if (!live) return { cls: 'demo', text: 'Offline demo', hint: 'nothing is saved to the server' };
    if (navigator.onLine === false || !reachable) return { cls: 'offline', text: 'Offline', hint: 'showing last loaded data' };
    return { cls: 'live', text: 'Live', hint: 'connected' };
  }

  function update() {
    const mode = currentMode();
    if (!mode) { badge.hidden = true; return; }
    badge.hidden = false;
    badge.className = 'mode-badge ' + mode.cls;
    badge.textContent = '';
    const dot = document.createElement('span'); dot.className = 'mode-dot'; dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('strong'); label.textContent = mode.text;
    const hint = document.createElement('span'); hint.className = 'mode-hint'; hint.textContent = ' \u00b7 ' + mode.hint;
    badge.append(dot, label, hint);
  }

  window.addEventListener('veya:network', event => { reachable = Boolean(event.detail?.ok); update(); });
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  window.VeyaMode = { update };
  update();
})();
