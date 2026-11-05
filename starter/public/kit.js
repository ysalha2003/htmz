/* kit.js — HTMZ Kit enhancement layer (Phase 1). ES2020, one file, no build, no dependencies.
 * Contract: docs/CONTRACT-AR.md. One attribute (data-target="#id"), one request header (X-Fragment-Target).
 * Without this file every link and form still works as a full-page navigation; this layer only
 * replaces one element by id from the server's HTML (full page or fragment) and keeps URL/history,
 * focus and announcements consistent. It never executes scripts from responses and never sanitizes:
 * output encoding and CSP are the server's job.
 */
(() => {
  'use strict';
  const doc = document, win = window;
  if (!win.fetch || !win.DOMParser || !win.AbortController || !win.AbortSignal || !AbortSignal.timeout) return;
  const ID = /^[A-Za-z][\w-]{0,63}$/;
  const TIMEOUT = 10000;
  const inflight = new Map(); // target id → AbortController; the latest request per target wins
  // The page's dynamic regions are the ids its own data-target attributes point at. When a response is a full page,
  // every one of them present in both documents is refreshed, so the document always matches its URL.
  const regions = () => {
    const ids = new Set();
    for (const el of doc.querySelectorAll('[data-target]')) { const k = (el.getAttribute('data-target') || '').replace(/^#/, ''); if (ID.test(k)) ids.add(k); }
    return ids;
  };
  const ar = /^ar\b/i.test(doc.documentElement.lang);
  const T = ar
    ? {busy: 'جارٍ التحميل…', done: 'تم التحديث', fail: 'تعذّر تحميل المحتوى.', retry: 'إعادة المحاولة'}
    : {busy: 'Loading…', done: 'Updated', fail: 'Could not load the content.', retry: 'Retry'};
  let live;

  const warn = msg => { console.warn('kit: ' + msg + ' — falling back to native navigation'); };

  // The single announcement region (created once, visually hidden, polite).
  const announce = text => {
    if (!live) {
      live = doc.createElement('div');
      live.className = 'kit-status';
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      // Visually hidden with clip-path on a fixed box; no 1px box, so it never affects layout or scrollable overflow.
      Object.assign(live.style, {position: 'fixed', insetBlockStart: '0', insetInlineStart: '0', maxWidth: '100%', clipPath: 'inset(50%)', pointerEvents: 'none'});
      doc.body.append(live);
    }
    live.textContent = text;
  };

  // Resolve data-target="#id" to an existing element id, or undefined (→ native navigation).
  const targetOf = el => {
    const raw = el.getAttribute('data-target') || '';
    const id = raw.replace(/^#/, '');
    if (!ID.test(id)) return warn('data-target must be "#id" (letters, digits, _ and -), got "' + raw + '"');
    if (!doc.getElementById(id)) return warn('no element with id "' + id + '" in the current page');
    return id;
  };

  // 1. Intercept links: plain left click, same origin, not download/_blank/hash-only.
  doc.addEventListener('click', e => {
    const a = e.target instanceof Element && e.target.closest('a[data-target]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = a.getAttribute('href') || '';
    if (!href || href[0] === '#' || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
    if (!/^https?:$/.test(a.protocol) || a.origin !== location.origin) return;
    const id = targetOf(a);
    if (!id) return;
    e.preventDefault();
    load({url: a.href, id, push: true});
  });

  // 1b. Intercept forms: GET → query string + pushState; POST → body, history only on redirect.
  doc.addEventListener('submit', e => {
    const form = e.target, s = e.submitter;
    if (e.defaultPrevented || !(form instanceof HTMLFormElement) || !form.hasAttribute('data-target')) return;
    const method = ((s && s.getAttribute('formmethod')) || form.method || 'get').toLowerCase();
    const target = (s && s.getAttribute('formtarget')) || form.getAttribute('target');
    if (method === 'dialog' || (target && target !== '_self')) return;
    const action = new URL((s && s.getAttribute('formaction')) || form.getAttribute('action') || '', location.href);
    if (!/^https?:$/.test(action.protocol) || action.origin !== location.origin) return;
    const id = targetOf(form);
    if (!id) return;
    e.preventDefault();
    const data = s ? new FormData(form, s) : new FormData(form);
    if (method === 'get') {
      action.search = new URLSearchParams(data);
      action.hash = '';
      return load({url: action.href, id, push: true});
    }
    if (doc.getElementById(id).getAttribute('aria-busy') === 'true') return; // double-submit guard
    const enctype = (s && s.getAttribute('formenctype')) || form.enctype;
    load({url: action.href, id, method: 'POST', body: /multipart/i.test(enctype) ? data : new URLSearchParams(data)});
  });

  // 4. Back/forward: re-fetch the entry's URL as a full page (no fragment header) and refresh the dynamic regions.
  //    Entries not created here (state without kit) are left to the browser.
  win.addEventListener('popstate', e => {
    const id = e.state && e.state.kit;
    if (!id) return;
    const present = [id, ...regions()].find(k => doc.getElementById(k));
    if (present) load({url: location.href, id: present, pop: true}); else location.reload();
  });

  // Was this GET answered by a redirect the fetch could not follow (cross-origin under same-origin mode)?
  const redirected = (url, id) => fetch(url, {
    mode: 'same-origin', credentials: 'same-origin', redirect: 'manual',
    headers: {'X-Fragment-Target': id}, signal: AbortSignal.timeout(TIMEOUT)
  }).then(r => r.type === 'opaqueredirect', () => false);

  // 2–5. Fetch, parse, swap, history, errors. Any unexpected exception → full navigation.
  async function load(req) {
    const {url, id} = req, method = req.method || 'GET';
    // Latest wins per target. A back/forward load replaces the whole dynamic state, so it cancels everything in
    // flight, and any new request cancels a pending back/forward load (its full page would otherwise land late).
    for (const [k, c] of inflight) {
      if (req.pop || k === id || c.pop) { c.abort(); inflight.delete(k); const r = doc.getElementById(k); if (r) r.removeAttribute('aria-busy'); }
    }
    const ctrl = new AbortController();
    ctrl.pop = !!req.pop;
    inflight.set(id, ctrl);
    const timer = AbortSignal.timeout(TIMEOUT);
    timer.onabort = () => ctrl.abort(timer.reason);
    const region = doc.getElementById(id);
    clearError(region);
    region.setAttribute('aria-busy', 'true');
    announce(T.busy);
    let navUrl = url;
    try {
      const res = await fetch(url, {
        method, body: req.body, mode: 'same-origin', credentials: 'same-origin', redirect: 'follow',
        headers: req.pop ? {} : {'X-Fragment-Target': id}, signal: ctrl.signal
      });
      navUrl = res.url || url;
      const status = res.status, html = await res.text();
      if (ctrl.signal.aborted) throw ctrl.signal.reason;
      if (!/text\/html/i.test(res.headers.get('content-type') || '')) throw new Error('response is not text/html');
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const incoming = parsed.getElementById(id);
      if (status >= 500 || (status >= 400 && !incoming)) return fail(req, status);
      if (!incoming) {
        warn('response for ' + url + ' has no element with id "' + id + '"');
        return location.assign(navUrl);
      }
      if (!req.pop && (req.push || res.redirected)) {
        if (!(history.state && history.state.kit)) history.replaceState({kit: id}, '', location.href);
        history[navUrl === location.href ? 'replaceState' : 'pushState']({kit: id}, '', navUrl);
      }
      const pairs = [...new Set([id, ...regions()])].map(k => [doc.getElementById(k), parsed.getElementById(k)]).filter(p => p[0] && p[1]);
      swap(pairs.filter(([, inc]) => !pairs.some(([, other]) => other !== inc && other.contains(inc))), id, parsed.querySelector('title'));
    } catch (err) {
      if (ctrl.signal.aborted) { // decided by our own reason: engines differ in what the rejected fetch carries
        const reason = ctrl.signal.reason;
        return reason && reason.name === 'TimeoutError' ? fail(req, 0) : undefined; // else superseded by a newer request
      }
      if (err instanceof TypeError) { // network error, or a redirect the browser hid from us
        if (method === 'GET' && await redirected(url, id)) return location.assign(url);
        return fail(req, 0);
      }
      console.error('kit:', err);
      location.assign(navUrl);
    } finally {
      if (inflight.get(id) === ctrl) {
        inflight.delete(id);
        const r = doc.getElementById(id);
        if (r) r.removeAttribute('aria-busy');
      }
    }
  }

  // 3 + 6 + 7. Replace by id, update <title>, move focus, announce; view transition unless reduced motion.
  function swap(pairs, id, titleEl) {
    const apply = () => {
      for (const [current, incoming] of pairs) current.replaceWith(doc.adoptNode(incoming));
      if (titleEl) doc.title = titleEl.textContent;
      const region = doc.getElementById(id);
      focus(region);
      const h = region.querySelector('h1,h2,h3,h4,h5,h6');
      announce(T.done + (h ? ': ' + h.textContent.trim() : ''));
    };
    const reduced = win.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    doc.getElementById(id).removeAttribute('aria-busy'); // nothing mutates between the transition start and its callback
    if (!doc.startViewTransition || reduced) return apply();
    const t = doc.startViewTransition(apply);
    for (const p of [t.ready, t.finished, t.updateCallbackDone]) if (p) p.catch(() => {}); // a newer transition skips this one; not an error
  }

  function focus(region) {
    const el = region.querySelector('[autofocus],[aria-invalid="true"]') || region.querySelector('h1,h2,h3,h4,h5,h6') || region;
    el.focus();
    if (doc.activeElement !== el) { el.tabIndex = -1; el.focus(); }
  }

  // 5. In-place error state with retry; nothing unknown replaces the region.
  function fail(req, status) {
    const region = doc.getElementById(req.id);
    if (!region) return;
    clearError(region);
    const box = doc.createElement('div');
    box.className = 'kit-error';
    box.setAttribute('role', 'alert');
    const msg = doc.createElement('p');
    msg.textContent = T.fail + (status ? ' (' + status + ')' : '');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.textContent = T.retry;
    btn.addEventListener('click', () => load(req));
    box.append(msg, btn);
    region.prepend(box);
    btn.focus();
    if (live) live.textContent = '';
  }
  const clearError = region => { for (const el of region.querySelectorAll('.kit-error')) el.remove(); };
})();
