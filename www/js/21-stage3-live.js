/**
 * Stage 3 - live social, messaging and safety.
 *
 * Uses only the Supabase publishable key already used by the client.
 * No service-role/secret key belongs in this file.
 *
 * Connected in Stage 3:
 *   - friend requests and acceptance/decline
 *   - direct messages
 *   - block / unblock
 *   - reports
 *   - admin/community moderation queue
 *
 * Demo/local mode remains unchanged.
 */
(function () {
  const B = window.VeyaBackend;
  const demoAddFriend = window.addFriend;
  const demoOpenMessage = window.openMessage;
  const demoBlockPerson = window.blockPerson;
  const demoUnblockPerson = window.unblockPerson;
  const demoOpenReportSheet = window.openReportSheet;
  const demoOpenBlockSheet = window.openBlockSheet;
  const demoOpenPostMenu = window.openPostMenu;
  const S3 = { people: new Map(), friendships: [], blocks: new Set(), messages: new Map(), reports: [] };

  function live() { return Boolean(window.VeyaLive?.isLive?.()); }
  function me() { return B?.auth?.user?.()?.id || ''; }
  function clean(s) { return String(s || '').trim(); }
  function friendly(error) {
    if (typeof window.VeyaLive?._friendly === 'function') return window.VeyaLive._friendly(error);
    const text = `${error?.message || ''} ${error?.details?.message || ''}`;
    if (error?.code === 'NETWORK_ERROR') return 'You appear to be offline. Try again when you have a connection.';
    if (/23505|duplicate key|already exists/i.test(text)) return 'That request already exists.';
    if (/42501|row-level security|permission denied/i.test(text)) return 'Your account is not allowed to do that yet.';
    return error?.message || 'The backend request failed.';
  }
  function initialsFor(name) {
    return String(name || 'Campus member').split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase() || 'CM';
  }
  function rememberProfile(p) {
    if (p?.id && p?.display_name) {
      S3.people.set(p.id, p);
      S3.people.set(`name:${p.display_name}`, p);
      if (p.username) S3.people.set(`user:${p.username}`, p);
    }
    return p;
  }
  async function profileForName(name) {
    const exact = S3.people.get(`name:${name}`);
    if (exact) return exact;
    const res = await B.findProfile(name);
    if (!res.error && res.data?.[0]) return rememberProfile(res.data[0]);
    return null;
  }
  async function profileForId(id) {
    const cached = S3.people.get(id);
    if (cached) return cached;
    const res = await B.getProfileById(id);
    if (!res.error && res.data?.[0]) return rememberProfile(res.data[0]);
    return null;
  }
  function localName(id) {
    return S3.people.get(id)?.display_name || 'Campus member';
  }
  function canonicalPair(a, b) { return a < b ? [a,b] : [b,a]; }

  async function loadFriendships() {
    const res = await B.listMyFriendships();
    if (res.error) return res;
    S3.friendships = res.data || [];
    const ids = [...new Set(S3.friendships.flatMap(r => [r.user_a, r.user_b]).filter(id => id && id !== me()))];
    await Promise.all(ids.map(profileForId));
    const s = ensureSocial();
    s.friends = []; s.requests = []; s.incoming = [];
    for (const row of S3.friendships) {
      const other = row.user_a === me() ? row.user_b : row.user_a;
      const name = localName(other);
      if (row.status === 'accepted') s.friends.push(name);
      else if (row.status === 'pending') {
        if (row.requested_by === me()) s.requests.push(name);
        else s.incoming.push(name);
      }
    }
    s.friends = [...new Set(s.friends)];
    s.requests = [...new Set(s.requests)];
    s.incoming = [...new Set(s.incoming)];
    return res;
  }

  async function loadBlocks() {
    const res = await B.listMyBlocks();
    if (res.error) return res;
    const ids = (res.data || []).map(r => r.blocked_id);
    await Promise.all(ids.map(profileForId));
    S3.blocks = new Set(ids);
    state.blocked = ids.map(localName);
    return res;
  }

  async function loadMessages() {
    const s = ensureSocial();
    const ids = [...new Set([
      ...S3.friendships.flatMap(r => [r.user_a, r.user_b]),
      ...[...S3.people.keys()].filter(k => /^[0-9a-f-]{36}$/i.test(k))
    ])].filter(id => id && id !== me());

    // We fetch conversations for known contacts only. This keeps the app small and
    // avoids downloading unrelated campus messages.
    const lecturerNames = typeof lecturersOf === 'function'
      ? lecturersOf(myRepModules()).map(d => d[0])
      : [];
    const lecturerProfiles = await Promise.all(lecturerNames.map(profileForName));
    const lecturerIds = lecturerProfiles.filter(Boolean).map(p => p.id);
    const contacts = [...new Set(ids.filter(id => {
      const row = S3.friendships.find(r => (r.user_a === id || r.user_b === id) && (r.status === 'accepted'));
      return Boolean(row);
    }).concat(lecturerIds))];

    await Promise.all(contacts.map(async id => {
      const res = await B.listMessages(id);
      if (res.error) return;
      rememberProfile(await profileForId(id));
      const name = localName(id);
      const rows = res.data || [];
      S3.messages.set(id, rows);
      s.threads[name] = rows.map(r => ({
        id: r.id, me: r.sender_id === me(), t: r.body, createdAt: r.created_at
      }));
    }));
    return { error: null };
  }

  async function loadReports() {
    const res = await B.listMyReports();
    if (res.error) return res;
    S3.reports = res.data || [];
    state.reports = S3.reports.map(r => ({
      id: r.id, live: true, mine: r.reporter_id === me(),
      targetType: r.target_type, targetId: r.target_id, targetUserId: r.target_user_id,
      reason: r.reason, details: r.details || '',
      summary: `${r.reason}: ${r.target_type}`,
      community: 'Veya moderation', status: r.status, time: relTime(r.created_at),
      createdAt: r.created_at
    }));
    return res;
  }

  async function refresh() {
    if (!live()) return;
    await loadFriendships();
    await loadBlocks();
    await loadMessages();
    await loadReports();
  }

  async function resolveContact(name) {
    const p = await profileForName(name);
    if (!p?.id) {
      showToast('That campus member could not be found on the live directory.');
      return null;
    }
    return p;
  }

  // ---------- live friend requests ----------
  window.addFriend = async function (name) {
    if (!live()) return demoAddFriend(name);
    const p = await resolveContact(name);
    if (!p || p.id === me()) return;
    if (S3.blocks.has(p.id)) return showToast('Unblock this person before sending a request.');
    const s = ensureSocial();
    if (s.friends.includes(name)) return showToast('You are already friends.');
    if (s.requests.includes(name)) return showToast('Friend request already sent.');
    const res = await B.createFriendRequest(p.id);
    if (res.error) return showToast(friendly(res.error));
    await loadFriendships();
    saveState(); renderApp();
    showToast(`Friend request sent to ${name}.`);
  };

  async function respondRequest(name, status) {
    const p = await resolveContact(name);
    if (!p) return;
    const res = await B.respondFriendship(p.id, status);
    if (res.error) return showToast(friendly(res.error));
    await loadFriendships();
    if (status === 'accepted') await loadMessages();
    saveState(); renderApp();
    showToast(status === 'accepted' ? `${name} is now your friend.` : 'Friend request declined.');
  }

  async function cancelRequest(name) {
    const p = await resolveContact(name);
    if (!p) return;
    const res = await B.cancelFriendRequest(p.id);
    if (res.error) return showToast(friendly(res.error));
    await loadFriendships();
    saveState(); renderApp();
    showToast('Friend request cancelled.');
  }

  // ---------- live direct messages ----------
  window.openMessage = async function (name) {
    if (!live()) return demoOpenMessage(name);
    const e = entityOf(name);
    const p = await resolveContact(name);
    if (!p) return;
    const student = p.role === 'student';
    if (student && !friendStatus(name).includes('friends')) {
      const pending = friendStatus(name) === 'pending';
      return openSheet(`${sheetHead('Messages', 'Message ' + esc(name))}<p class="muted" style="margin:0 0 6px;font-size:.84rem">${pending ? 'Your friend request is waiting to be accepted. Direct messages unlock once you are both friends.' : 'Direct messages unlock once you are friends on Veya.'}</p>${pending ? '' : `<button class="btn full" style="margin-top:12px" data-do="ok">Add friend</button>`}<button class="btn full secondary" style="margin-top:8px" data-close>Close</button>`, root => {
        root.querySelector('[data-do=ok]')?.addEventListener('click', () => { root.innerHTML = ''; addFriend(name); });
      });
    }
    if (p.role === 'lecturer' && !canMessage(e)) {
      return openSheet(`${sheetHead('Messages', 'Message ' + esc(name))}<div class="notice"><strong>Module reps only.</strong><br>Only an active representative for the lecturer's module can send a direct message.</div><button class="btn full secondary" style="margin-top:12px" data-close>Got it</button>`);
    }
    return openLiveDm(p, e);
  };

  async function openLiveDm(p, e) {
    const rowsRes = await B.listMessages(p.id);
    if (rowsRes.error) return showToast(friendly(rowsRes.error));
    const rows = rowsRes.data || [];
    rememberProfile(p);
    const name = p.display_name;
    const note = p.role === 'lecturer'
      ? `${icon('shield', 14)} Messaging as module rep`
      : `${icon('users', 14)} You are friends on Veya`;
    const threadHtml = rows.length
      ? rows.map(m => `<div class="dm-msg ${m.sender_id === me() ? 'me' : ''}" data-message-id="${esc(m.id)}">${esc(m.body)}</div>`).join('')
      : `<div class="dm-empty">No messages yet. Say hello.</div>`;
    openSheet(`${sheetHead(p.role === 'lecturer' ? 'Module rep message' : 'Direct message', esc(name))}
      <p class="dm-note">${note}<button class="link-btn dm-opts" data-action="dm-menu" data-name="${esc(name)}">Report or block</button></p>
      <div class="dm-thread" id="dmThread" data-name="${esc(name)}" data-user-id="${esc(p.id)}">${threadHtml}</div>
      <div class="dm-bar"><input id="dmInput" placeholder="Write a message…" autocomplete="off" maxlength="4000" /><button class="btn" id="dmSend" aria-label="Send">${icon('send', 16)}</button></div>`,
      root => {
        const box = root.querySelector('#dmThread'), input = root.querySelector('#dmInput');
        root.querySelector('[data-action=dm-menu]')?.addEventListener('click', () => openProfileMenu(name));
        const draw = rowsNow => {
          box.innerHTML = rowsNow.length
            ? rowsNow.map(m => `<div class="dm-msg ${m.sender_id === me() ? 'me' : ''}" data-message-id="${esc(m.id)}">${esc(m.body)}</div>`).join('')
            : `<div class="dm-empty">No messages yet. Say hello.</div>`;
          box.scrollTop = box.scrollHeight;
        };
        const send = async () => {
          const body = input.value.trim();
          if (!body) return;
          input.disabled = true;
          const res = await B.sendMessage(p.id, body);
          input.disabled = false;
          if (res.error) return showToast(friendly(res.error));
          input.value = '';
          const fresh = await B.listMessages(p.id);
          draw(fresh.data || []);
        };
        root.querySelector('#dmSend')?.addEventListener('click', send);
        input.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(); } });
        draw(rows);
        input.focus();
      });
  }

  // ---------- live block / unblock ----------
  window.blockPerson = async function (name) {
    if (!live()) return demoBlockPerson(name);
    const p = await resolveContact(name);
    if (!p || p.id === me()) return false;
    const res = await B.blockUser(p.id);
    if (res.error && !/23505|duplicate/i.test(JSON.stringify(res.error))) {
      showToast(friendly(res.error)); return false;
    }
    S3.blocks.add(p.id);
    await loadFriendships();
    await loadBlocks();
    saveState(); renderApp();
    showToast(`${name} is blocked.`);
    return true;
  };
  window.unblockPerson = async function (name) {
    if (!live()) return demoUnblockPerson(name);
    const p = await resolveContact(name);
    if (!p) return false;
    const res = await B.unblockUser(me(), p.id);
    if (res.error) return showToast(friendly(res.error));
    S3.blocks.delete(p.id);
    await loadBlocks();
    saveState(); renderApp();
    showToast(`${name} is unblocked.`);
    return true;
  };

  // ---------- live reports ----------
  window.openReportSheet = async function (t) {
    if (!live()) return demoOpenReportSheet(t);
    const alsoBlock = t.author && canBlock(t.author) && !isBlocked(t.author);
    openSheet(`${sheetHead('Report', esc(t.label))}
      <p class="muted rp-lead">Pick the closest reason. A moderator reviews it. The person is not told who reported them.</p>
      <div class="report-reasons" role="radiogroup" aria-label="Reason">${REPORT_REASONS.map(([k,l],i) => `<label class="report-reason"><input type="radio" name="rpReason" value="${k}" ${i === 0 ? 'checked' : ''} /><span>${l}</span></label>`).join('')}</div>
      <label class="field">Details (optional)<textarea id="rpDetails" rows="2" maxlength="1000" placeholder="Anything that helps a moderator"></textarea></label>
      ${alsoBlock ? `<label class="check"><input type="checkbox" id="rpBlock" /> Also block ${esc(t.author)}</label>` : ''}
      <button class="btn full" style="margin-top:14px" data-do="send">Send report</button>
      <button class="link-btn rp-sos" data-do="sos">Someone in danger? Open Safety &amp; SOS</button>`,
      root => {
        root.querySelector('[data-do=send]').addEventListener('click', async () => {
          const reason = root.querySelector('input[name=rpReason]:checked')?.value || 'other';
          let targetId = t.targetId;
          let targetUserId = null;
          if (t.type === 'profile') {
            const p = await resolveContact(t.author || t.label);
            if (!p) return;
            targetId = p.id;
            targetUserId = p.id;
          }
          if (!targetId || !/^[0-9a-f-]{36}$/i.test(String(targetId))) {
            root.innerHTML = ''; return showToast('This item is still demo-only and cannot be reported to the live server.');
          }
          const res = await B.submitReport(t.type, targetId, reason, root.querySelector('#rpDetails').value);
          if (res.error) return showToast(friendly(res.error));
          if (root.querySelector('#rpBlock')?.checked && t.author) await blockPerson(t.author);
          await loadReports();
          root.innerHTML = '';
          renderApp();
          showToast('Report sent. A moderator will review it.');
        });
        root.querySelector('[data-do=sos]')?.addEventListener('click', () => { root.innerHTML = ''; openSafety(); });
      });
  };

  async function reportForTarget(p) {
    const rows = S3.reports.filter(r => r.target_id === p);
    return rows[0] || null;
  }

  window.openBlockSheet = function (name) {
    if (!live()) return demoOpenBlockSheet(name);
    openSheet(`${sheetHead('Block', esc(name))}
      <p class="muted rp-lead">${esc(name)} will not be able to message you or send friend requests, and their posts disappear from your feed. They are not told.</p>
      <button class="btn danger full" data-do="block">Block ${esc(name)}</button>
      <button class="btn secondary full" style="margin-top:8px" data-close>Cancel</button>`,
      root => root.querySelector('[data-do=block]')?.addEventListener('click', async () => {
        const ok = await blockPerson(name);
        if (ok) { root.innerHTML = ''; if (state.page === 'viewprofile' && state.viewProfile === name) state.page = state.prevPage || 'home'; renderApp(); }
      }));
  };

  // A live post menu must report the Supabase UUID, not the UI's local numeric id.
  window.openPostMenu = function (id) {
    if (!live()) return demoOpenPostMenu(id);
    const p = state.posts.find(x => x.id === id);
    if (!p) return;
    const block = canBlock(p.author) && !isBlocked(p.author);
    const own = state.user && (p.author === state.user.alias || p.author === state.user.name);
    openSheet(`${sheetHead('Post options', esc(p.author))}
      <div class="menu-list">
        ${own ? '' : `<button class="menu-item" data-do="report">${icon('flag')}Report post</button>`}
        ${block ? `<button class="menu-item danger" data-do="block">${icon('shield')}Block ${esc(p.author)}</button>` : ''}
        <button class="menu-item" data-do="hide">${icon('eye')}Hide this post</button>
        <button class="menu-item" data-close>${icon('close')}Cancel</button>
      </div>`,
      root => {
        root.querySelector('[data-do=report]')?.addEventListener('click', () => openReportSheet({
          type:'post', targetId:p.liveId, author:p.author, label:`${p.author}'s post`, community:p.kind === 'academic' ? p.module : 'Kora House'
        }));
        root.querySelector('[data-do=block]')?.addEventListener('click', () => openBlockSheet(p.author));
        root.querySelector('[data-do=hide]')?.addEventListener('click', () => { hiddenPostIds().push(p.id); saveState(); root.innerHTML=''; renderApp(); showToast('Post hidden from your feed.'); });
      });
  };
  // ---------- admin moderation queue ----------
  window.renderReportQueue = function () {
    const open = state.reports.filter(r => ['open','reviewing'].includes(r.status));
    const done = state.reports.filter(r => !['open','reviewing'].includes(r.status)).slice(0,5);
    const card = r => `<div class="list-item rp-item">
      <div><div class="flex"><span class="tag ${r.mine ? 'community' : 'official'}">${esc(REPORT_TYPE_LABEL[r.targetType] || r.targetType)}</span><span class="muted" style="font-size:.7rem">${esc(r.community)} · ${esc(r.time || '')}</span></div>
      <strong style="margin-top:6px;display:block">${esc(r.summary)}</strong>${r.details ? `<span class="muted" style="display:block;margin-top:4px">“${esc(r.details)}”</span>` : ''}</div>
      <div class="rp-actions">
        <button class="btn mint small" data-action="report-resolve" data-id="${esc(r.id)}">Keep</button>
        <button class="btn coral small" data-action="report-remove" data-id="${esc(r.id)}">Remove</button>
        <button class="link-btn" data-action="report-dismiss" data-id="${esc(r.id)}">Dismiss</button>
      </div></div>`;
    const doneRow = r => `<div class="list-item"><div><strong>${esc(r.summary)}</strong><span>${esc(r.status)}</span></div></div>`;
    return `<div class="card card-pad"><p class="eyebrow">Open reports · ${open.length}</p><h2>${open.length ? 'Needs a decision' : 'All clear'}</h2><div class="list">${open.length ? open.map(card).join('') : '<p class="muted" style="margin:0">No open reports.</p>'}</div>${done.length ? `<p class="eyebrow" style="margin-top:18px">Recently closed</p><div class="list">${done.map(doneRow).join('')}</div>` : ''}</div>`;
  };

  const baseSafety = window.handleSafetyAction;
  window.handleSafetyAction = function (action, button) {
    if (live()) {
      const d = button.dataset;
      if (action === 'req-accept') return respondRequest(d.name, 'accepted'), true;
      if (action === 'req-decline') return respondRequest(d.name, 'declined'), true;
      if (action === 'req-cancel') return cancelRequest(d.name), true;
      if (action === 'report-resolve' || action === 'report-dismiss' || action === 'report-remove') {
        const r = state.reports.find(x => String(x.id) === String(d.id));
        if (!r?.live) return baseSafety(action, button);
        (async () => {
          let res;
          if (action === 'report-remove' && ['post','comment'].includes(r.targetType)) {
            res = await B.moderateContent(r.targetType, r.targetId, 'removed', 'Removed after report review.');
            if (!res.error) res = await B.resolveReport(r.id, 'actioned', 'Content removed after review.');
          } else {
            res = await B.resolveReport(r.id, action === 'report-resolve' ? 'dismissed' : 'dismissed', action === 'report-resolve' ? 'Reviewed; content kept.' : 'Report dismissed.');
          }
          if (res?.error) return showToast(friendly(res.error));
          await loadReports(); renderApp();
          showToast(action === 'report-remove' ? 'Content removed.' : 'Report closed.');
        })();
        return true;
      }
    }
    return baseSafety(action, button);
  };

  window.VeyaStage3 = { refresh, profileForName, profileForId, loadReports };
})();
