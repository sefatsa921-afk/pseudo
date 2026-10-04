function renderHome() {
  if (isAdmin()) return renderAdminOverview();
  const tab = state.feedTab || 'foryou';
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const pendingScope = state.pendingRequest?.scope || DEFAULT_VERIFICATION_SCOPE;
  const v = state.verified
    ? { cls: ' verified', ic: 'check', h: 'Verified Residence Member', p: `${state.verifiedScope?.residence || 'Northbank Residence'} · ${state.verifiedScope?.community || 'Kora House'}`, end: '<span class="status verified">Active</span>' }
    : state.pendingVerification
      ? { cls: '', ic: 'send', h: 'Request sent for admin review', p: `${pendingScope.community} · scanned ${formatVerificationTime(state.pendingRequest?.requestedAt)}`, end: '<span class="status pending">Pending</span>' }
      : { cls: '', ic: 'shield', h: 'Unlock your communities', p: 'Scan an admin’s QR in person. They still approve you.', end: '<button class="btn small" data-action="scan-qr">Scan QR</button>' };
  const stories = [
    ['KH', 'Kora House', ''], ['N', 'Northbank', 'mint'], ['AC', 'Accounting', 'gold'],
    [icon('sparkle', 21), 'Opportunities', 'lime'], [icon('calendar', 21), 'Events', 'blue'], [icon('plus', 24), 'Add story', 'plus']
  ];
  const items = tab === 'following' ? followingItems() : forYouItems();
  return `<div class="student-home">
    <div class="greet-row"><p class="greet">${hello}, <strong>${esc(state.user.alias)}</strong></p>${state.verified ? `<span class="status verified home-verified">${icon('check', 12)} Verified</span>` : ''}</div>
    <div class="stories">${stories.map(([inner, label, tone]) => `<button class="story" data-action="story" data-story="${esc(label)}"><span class="story-ring ${tone}"><span>${inner}</span></span><span>${label}</span></button>`).join('')}</div>
    ${renderToday()}
    ${state.verified || (state.dismissVerify && !state.pendingVerification) ? '' : `<div class="verification-card slim${v.cls}"><div class="flex"><span class="check-bubble">${icon(v.ic, 14)}</span><div><h3>${v.h}</h3><p>${v.p}</p></div></div><div class="vc-end">${v.end}${state.pendingVerification ? '' : `<button class="vc-dismiss" data-v2="dismiss-verify" aria-label="Hide this for now">${icon('close', 14)}</button>`}</div></div>`}
    <div class="feed-tabs" role="tablist"><button class="feed-tab ${tab === 'foryou' ? 'active' : ''}" data-action="feed-tab" data-tab="foryou">For you</button><button class="feed-tab ${tab === 'following' ? 'active' : ''}" data-action="feed-tab" data-tab="following">Following</button></div>
    ${state.verified ? renderCompose() : ''}
    <div class="feed">${Date.now() < skeletonUntil ? skeletonFeed() : items.length ? items.map(i => i.promo ? renderPromotions([i.promo]) : renderPosts(state.verified, [i.p])).join('') : emptyState('users', 'Your feed is quiet', 'Follow pages, modules and people to fill it. Try the search bar.', `<button class="btn small" data-nav="communities">Browse communities</button>`)}</div>
    <div class="coming-up"><div class="cu-head"><strong>Coming up</strong><button class="cu-link" data-nav="events">See all</button></div>${state.events.slice(0, 2).map(e => { const m = e.meta.split('·').map(x => x.trim()); return `<div class="cu-row"><span class="cu-date"><b>${e.day}</b>${e.month}</span><div><strong>${esc(e.title)}</strong><span>${esc(m[0])} · ${esc(m[1] || '')}</span></div></div>`; }).join('')}</div>
    <div class="suggested"><strong>Suggested spaces</strong><div class="chips">${['Study Hub', 'Five-a-side FC', 'Culture Circle'].map(n => `<button class="chip" data-profile="${n}">${n}</button>`).join('')}</div></div>
  </div>`;
}
const SCHOOL_LINKS = [
  ['cap', 'RU Connected', 'https://ruconnected.ru.ac.za'],
  ['building', 'ROSS', 'https://ross.ru.ac.za'],
  ['mail', 'Student Emails', 'https://outlook.office.com'],
  ['book', 'Library', 'https://www.ru.ac.za/library']
];
const SOCIAL_LINKS = [
  ['camera', 'Instagram', 'https://www.instagram.com'],
  ['comment', 'WhatsApp', 'https://web.whatsapp.com'],
  ['play', 'YouTube', 'https://www.youtube.com']
];
function renderCompose() {
  const photoHint = state.pendingPhoto
    ? `<span class="composer-hint spark-warn">Photo attached · needs admin approval</span>`
    : `<span class="composer-hint">Visible to verified students</span>`;
  return `<div class="composer"><span class="avatar">${esc(state.user.initials)}</span><div class="composer-main"><textarea id="newPostText" class="textarea" rows="2" placeholder="What's happening on campus?"></textarea><div class="composer-bar"><button class="act sm" type="button" data-action="add-photo" aria-label="Add photo">${icon('image', 20)}</button>${photoHint}<button class="btn small" data-action="create-post">Post</button></div></div></div>`;
}
function renderPostMedia(media) {
  const pending = media.approval === 'pending';
  const adminActions = pending && isAdmin()
    ? `<div style="display:flex;gap:8px;margin-top:8px;"><button class="btn mint small" data-action="media-approve" data-id="${media.postId || ''}">Approve photo</button><button class="btn secondary small" data-action="media-reject" data-id="${media.postId || ''}">Reject</button></div>`
    : '';
  const badge = pending ? `<span class="tag community" style="margin-left:6px;">Pending approval</span>` : '';
  return `<figure class="media" role="img" aria-label="${esc(media.alt)}" style="margin-inline:0;margin-bottom:0;${pending ? 'opacity:.85;' : ''}">${scene(media.theme)}<figcaption class="media-tag">${icon('pin', 12)}${esc(media.label)}${badge}</figcaption></figure>${adminActions}`;
}
function renderPromotions(list = state.promotions) {
  return list.map(promo => `<article class="promo-card"><div class="promo-head"><button class="plink" data-profile="${esc(promo.company)}"><span class="avatar coral">${esc(promo.initials)}</span></button><div class="grow"><strong><button class="plink-t" data-profile="${esc(promo.company)}">${esc(promo.company)}</button></strong><span class="promo-source">${icon('verified', 11)} Verified business · ${esc(promo.time)}</span></div>${subscriptionButton(promo.source)}</div><div class="promo-image ${esc(promo.theme)}">${scene(promo.theme)}<span class="promo-stamp">Sponsored</span></div><button class="promo-cta" data-action="promo-open" data-source="${esc(promo.source)}"><span>${esc(promo.cta)}</span>${icon('chevron', 18)}</button><h3>${esc(promo.title)}</h3><p>${esc(promo.body)}</p></article>`).join('');
}
function renderPosts(canInteract = false, list = state.posts) {
  if (!list.length) return emptyState('bookmark', 'Nothing here yet', 'Follow pages to see their posts here.');
  return list.map(post => {
    const isAcademic = post.kind === 'academic';
    const isOfficial = post.kind === 'official' || isAcademic;
    const n = post.comments.length;
    const sub = isAcademic ? `Lecturer · <button class="plink-t" data-profile="${esc(subjectOf(post))}">${esc(post.module)}</button>` : (isOfficial ? 'Official' : 'Community');
    return `
    <article class="post" data-post-id="${post.id}">
      <header class="post-head">
        <button class="plink" data-profile="${esc(post.author)}" aria-label="Open ${esc(post.author)}"><span class="avatar ${isAcademic ? 'academic' : (isOfficial ? 'blue' : 'coral')}">${esc(post.initials)}</span></button>
        <div class="post-id">
          <div class="post-name"><strong><button class="plink-t" data-profile="${esc(post.author)}">${esc(post.author)}</button></strong>${isOfficial ? `<span class="vbadge" title="Verified">${icon('verified', 15)}</span>` : ''}<time>· ${esc(post.time)}</time></div>
          <span class="post-sub">${sub} · ${esc(post.label)}</span>
        </div>
        <button class="act more" data-action="post-menu" data-id="${post.id}" title="More" aria-label="More options">${icon('more', 20)}</button>
      </header>
      <div class="post-text"><p>${esc(post.body)}</p></div>
      ${post.replyTo ? `<div class="post-reply-context"><span class="reply-label">Replying to a class question</span><div class="reply-question"><span class="avatar" style="width:28px;height:28px;border-radius:50%;font-size:.6rem;">${esc(post.replyTo.initials)}</span><div><strong>${esc(post.replyTo.author)}</strong><p>${esc(post.replyTo.text)}</p></div></div></div>` : ''}
      ${post.media ? renderPostMedia({ ...post.media, postId: post.id }) : ''}
      <div class="post-bar">
        <button class="act like ${post.reacted ? 'on' : ''}" data-action="react" data-id="${post.id}" title="Like" aria-label="Like">${icon('heart', 24)}</button>
        <button class="act" data-action="toggle-comments" data-id="${post.id}" title="Reply" aria-label="Reply">${icon('comment', 24)}</button>
        <button class="act" data-action="repost" data-id="${post.id}" title="Repost" aria-label="Repost">${icon('repost', 24)}</button>
        <button class="act" data-action="share-post" data-id="${post.id}" title="Share" aria-label="Share">${icon('send', 24)}</button>
        <span class="grow"></span>
        <button class="act save ${post.saved ? 'on' : ''}" data-action="save" data-id="${post.id}" title="Save" aria-label="Save">${icon('bookmark', 24)}</button>
      </div>
      <div class="post-stats"><strong>${post.likes} ${post.likes === 1 ? 'like' : 'likes'}</strong></div>
      <button class="link-btn" data-action="toggle-comments" data-id="${post.id}">${n ? `View all ${n} comment${n > 1 ? 's' : ''}` : 'Add a comment'}</button>
      <div class="comments hidden" id="comments-${post.id}">
        ${n ? post.comments.map(comment => `
          <div class="comment">
            <span class="avatar" style="width:28px;height:28px;border-radius:50%;font-size:.62rem;">${esc(initials(comment.author))}</span>
            <div><strong>${esc(comment.author)}</strong> ${esc(comment.text)}</div>
          </div>`).join('') : `<div class="muted" style="font-size:.78rem;padding:4px 0;">No replies yet.</div>`}
        ${canInteract && !isAcademic ? `
          <div class="comment-form">
            <input class="input" id="comment-input-${post.id}" placeholder="Add a comment…" />
            <button class="btn small" data-action="add-comment" data-id="${post.id}">Post</button>
          </div>` : isAcademic ? `<p class="muted" style="margin:10px 0 0;font-size:.72rem;">Questions go through the verified class representative.</p>` : `<p class="muted" style="margin:10px 0 0;font-size:.72rem;">Residence verification is required to reply.</p>`}
      </div>
    </article>`;
  }).join('');
}
function isSubscribed(source) {
  return state.subscriptions.includes(source);
}
function subscriptionButton(source) {
  const following = isSubscribed(source);
  return `<button class="btn ${following ? 'secondary' : 'mint'} small" data-action="toggle-subscription" data-source="${esc(source)}">${following ? 'Following' : 'Follow page'}</button>`;
}
function renderCommunities() {
  const card = ({ ic, name, sub, status, text, primary, follow }) => `<article class="card comm-card"><div class="comm-top"><span class="icon-box">${icon(ic, 20)}</span><div class="comm-id"><h3><button class="plink-t" data-profile="${esc(name)}">${esc(name)}</button></h3><span>${sub}</span></div>${status}</div><p class="comm-text">${text}</p><div class="comm-actions">${primary}${follow ? subscriptionButton(follow) : ''}</div></article>`;
  const cards = [
    { ic: 'building', name: 'Northbank Residence', sub: 'Residence community', status: `<span class="status ${state.verified ? 'verified' : 'pending'}">${state.verified ? 'Member' : 'Locked'}</span>`, text: 'Announcements, houses, events, and the people who make the residence feel like home.', primary: '<button class="btn small" data-action="open-house">Open Kora House</button>', follow: 'Northbank Residence' },
    { ic: 'book', name: 'Accounting', sub: 'ACC201 · ACC202 modules', status: '<span class="status verified">Verified lecturers</span>', text: 'Tutorial updates, resources, class-representative questions, and lecturer replies.', primary: '<button class="btn secondary small" data-action="open-accounting">Open module</button>', follow: 'Accounting' },
    { ic: 'sparkle', name: 'Study Hub', sub: 'Verified organisation space', status: '<span class="status neutral">Preview</span>', text: 'Societies, sports teams, modules, and projects can create trusted spaces as the pilot grows.', primary: '<button class="btn secondary small" data-nav="opportunities">Explore directory</button>', follow: 'Study Hub' }
  ].map(card).join('');
  return `${pageHead('Communities', 'Find the spaces where campus life happens. Follow a page to receive its updates.', `<button class="btn mint small" data-action="community-request">Request activity</button>`)}
    <div class="comm-list">${cards}</div>
    ${backendReferenceDirectory()}
    <div class="section-head"><h2>Kora House timeline</h2><div class="flex">${subscriptionButton('Kora House')}</div></div>
    <p class="muted tl-note"><span class="tag official">Public to verified campus users</span></p>
    ${state.verified ? renderCompose() : `<div class="card empty"><h3>Verification unlocks this space</h3><p>Scan an admin's QR in person, and they approve your request.</p><button class="btn small" data-action="scan-qr">Start verification</button></div>`}<div class="feed" style="margin-top:14px;">${renderPosts(state.verified)}</div>`;
}
