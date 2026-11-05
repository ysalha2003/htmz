// Reference backend: Node.js built-ins only. Every route renders a full HTML page; when the request
// carries X-Fragment-Target the matching region is returned alone (optional optimisation).
// DEMO ONLY: in-memory sessions, no authentication, no database. Contract: ../../docs/CONTRACT-AR.md
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = path.join(root, 'public');
const projects = JSON.parse(fs.readFileSync(path.join(root, 'projects.json'), 'utf8'));
const layout = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const sessions = new Map(); // Demo only: replace with real auth + persistent session store.
const TEST_ROUTES = process.env.KIT_TEST_ROUTES === '1'; // failure scenarios for the test suite only
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'";
const headers = {
  'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store',
  'Vary': 'X-Fragment-Target'
};
const REGION = /^[A-Za-z][\w-]{0,63}$/;
// Regions served alone on X-Fragment-Target. Only self-contained ones qualify: everything else depends on page
// state (selection, query), so the full page is returned and the layer refreshes all dynamic regions from it.
const FRAGMENTS = new Set(['project-tab']);
const projectById = id => projects.find(p => p.id === id);
const query = params => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  const t = s.toString();
  return t ? '?' + t : '';
};
const projectHref = (id, q, view) => '/projects/' + encodeURIComponent(id) + query({q, view});

// ---- views: every region has a stable id; the same functions feed full pages and fragments ----
// The search form lives inside the list region so that action, value and hidden state travel with every swap.
const searchForm = (action, q) => '<form action="' + esc(action) + '" method="get" data-target="#project-list" class="ds-search">' +
  '<label for="project-search">البحث في المشاريع</label><div class="ds-input-row">' +
  '<input id="project-search" name="q" type="search" value="' + esc(q) + '" placeholder="اسم المشروع" autocomplete="off">' +
  '<button class="ds-button ds-button-quiet" type="submit">بحث</button></div></form>';
const listView = (q, selected, view, action) => {
  const needle = q.trim().toLocaleLowerCase();
  const entries = projects.filter(p => p.title.toLocaleLowerCase().includes(needle));
  return '<section id="project-list" aria-label="نتائج البحث">' + searchForm(action, q) + '<h2>قائمة المشاريع</h2>' +
    (entries.length ? '<ul class="ds-project-list">' + entries.map(p =>
      '<li><a href="' + esc(projectHref(p.id, q)) + '" data-target="#project-panel"' + (p.id === selected ? ' aria-current="page"' : '') + '>' +
      esc(p.title) + '</a><small>' + esc(p.status) + '</small></li>').join('') + '</ul>'
      : '<p class="ds-empty">لا توجد مشاريع مطابقة.</p>') + '</section>';
};
// Self-contained region: the tab nav lives inside it so aria-current stays right when it is swapped alone.
const tabView = (project, view, q = '') => {
  const link = (v, label) => '<a href="' + esc(projectHref(project.id, q, v)) + '" data-target="#project-tab"' + (view === v ? ' aria-current="true"' : '') + '>' + label + '</a>';
  return '<div id="project-tab"><nav class="ds-tabs" aria-label="أقسام المشروع">' + link('overview', 'نظرة عامة') + link('tasks', 'المهام') + '</nav><div class="ds-panel">' +
    (view === 'tasks'
      ? '<h3>المهام الأساسية</h3><ul>' + project.tasks.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>'
      : '<h3>ملخص المشروع</h3><p class="ds-muted">مثال يوضح استبدال أجزاء HTML من الخادم دون JavaScript لتوليد الواجهة.</p>') + '</div></div>';
};
const panelView = (project, session, {q = '', view = 'overview', note, error = '', saved = false} = {}) => {
  const text = note ?? session.notes[project.id] ?? project.note;
  const notice = error ? '<div class="ds-alert ds-alert-error" role="alert" id="note-error">' + esc(error) + '</div>'
    : saved ? '<div class="ds-alert ds-alert-success">تم حفظ الملاحظة بنجاح.</div>' : '';
  return '<section id="project-panel" class="ds-card">' +
    '<div class="ds-detail-title"><h2>' + esc(project.title) + '</h2><span class="ds-pill">' + esc(project.status) + '</span></div>' +
    '<div class="ds-section">' + tabView(project, view, q) + '</div>' +
    '<section class="ds-section" aria-label="ملاحظات المشروع"><h3>الملاحظات</h3>' + notice +
    '<form action="' + esc('/projects/' + encodeURIComponent(project.id) + '/notes') + '" method="post" data-target="#project-panel" class="ds-note-form">' +
    '<input type="hidden" name="csrf" value="' + esc(session.csrf) + '">' +
    (q ? '<input type="hidden" name="q" value="' + esc(q) + '">' : '') +
    '<label for="note">وصف مختصر</label><textarea id="note" name="note" maxlength="300" rows="4" required' +
    (error ? ' aria-invalid="true" aria-describedby="note-error" autofocus' : '') + '>' + esc(text) + '</textarea>' +
    '<button class="ds-button" type="submit">حفظ الملاحظة</button></form></section></section>';
};
const emptyPanel = () => '<section id="project-panel" class="ds-card"><h2>اختر مشروعًا</h2><p class="ds-muted">اختر مشروعًا من القائمة لعرض تفاصيله وملاحظاته.</p></section>';
const messagePanel = (title, message) => '<section id="project-panel" class="ds-card"><h2>' + esc(title) + '</h2><p class="ds-alert ds-alert-error" role="alert">' + esc(message) + '</p><a href="/">العودة إلى قائمة المشاريع</a></section>';

// ---- rendering: full page by default, fragment when X-Fragment-Target names a region of this page ----
function render(req, res, status, {title, q = '', view = 'overview', selected = null, searchAction = '/projects', list, panel, tab}, extra = {}) {
  const regions = {'project-list': list ?? listView(q, selected, view, searchAction), 'project-panel': panel};
  if (tab) regions['project-tab'] = tab;
  const wanted = req.headers['x-fragment-target'];
  const fragment = typeof wanted === 'string' && REGION.test(wanted) && FRAGMENTS.has(wanted) && regions[wanted];
  const body = fragment ? '<title>' + esc(title) + ' | HTMZ Kit</title>' + fragment
    : layout.replace('{{TITLE}}', () => esc(title)).replace('{{PROJECT_LIST}}', () => regions['project-list']).replace('{{PROJECT_PANEL}}', () => panel);
  send(res, status, body, extra);
}
function send(res, status, body, extra = {}) { res.writeHead(status, {...headers, ...extra}); res.end(body); }
function redirect(res, location) { send(res, 303, '<!doctype html><title>303</title>', {Location: location}); }
const errorPage = (req, res, status, title, message, q = '') => render(req, res, status, {title, q, panel: messagePanel(title, message)});
function loadSession(req, res, create = false) {
  const cookie = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('kit_sid='))?.slice(8);
  if (cookie && sessions.has(cookie)) return sessions.get(cookie);
  if (!create) return null;
  const id = crypto.randomBytes(24).toString('hex');
  const session = {csrf: crypto.randomBytes(24).toString('hex'), notes: {}, hits: 0};
  sessions.set(id, session);
  res.setHeader('Set-Cookie', 'kit_sid=' + id + '; HttpOnly; SameSite=Lax; Path=/' + (process.env.PUBLIC_ORIGIN?.startsWith('https://') ? '; Secure' : ''));
  return session;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function testRoutes(req, res, url, session) {
  const name = url.pathname.slice('/__test/'.length), q = '';
  const marker = label => '<section id="project-panel" class="ds-card"><h2>' + esc(label) + '</h2><p>استجابة اختبار.</p></section>';
  if (name === 'slow') { await sleep(Math.min(Number(url.searchParams.get('ms')) || 1000, 20000)); return render(req, res, 200, {title: 'slow', q, panel: marker(url.searchParams.get('label') || 'slow')}); }
  if (name === 'hang') return; // never answers: exercises the 10 s client timeout
  if (name === 'error500') return send(res, 500, '<!doctype html><html lang="ar" dir="rtl"><head><title>خطأ</title></head><body><h1>500</h1></body></html>');
  if (name === 'error400') return send(res, 400, '<!doctype html><html lang="ar" dir="rtl"><head><title>خطأ</title></head><body><h1>400</h1></body></html>');
  if (name === 'flaky') { session.hits += 1; if (session.hits % 2) return send(res, 500, '<!doctype html><title>500</title><h1>500</h1>'); return render(req, res, 200, {title: 'flaky', q, panel: marker('flaky ok')}); }
  if (name === 'external') return send(res, 302, '', {Location: url.searchParams.get('to') || '/'});
  if (name === 'unsafe') return render(req, res, 200, {title: 'unsafe', q, panel: '<section id="project-panel" class="ds-card"><h2>unsafe</h2><script>window.__kitScript = 1</script><img src="/missing.png" onerror="window.__kitImg = 1" alt=""></section>'});
  if (name === 'no-target') return render(req, res, 200, {title: 'no-target', q, panel: '<section id="other-panel" class="ds-card"><h2>other</h2></section>'});
  if (name === 'json') return send(res, 200, '{"ok":true}', {'Content-Type': 'application/json; charset=utf-8'});
  return errorPage(req, res, 404, 'غير موجود', 'لا يوجد مسار اختبار بهذا الاسم.');
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost')), p = url.pathname;
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (p === '/design-system.html') return send(res, 200, fs.readFileSync(path.join(publicDir, 'design-system.html')));
    if (p === '/design.css' || p === '/kit.js') {
      return send(res, 200, fs.readFileSync(path.join(publicDir, p.slice(1))), {'Content-Type': (p.endsWith('.css') ? 'text/css' : 'text/javascript') + '; charset=utf-8', 'Cache-Control': 'public, max-age=300'});
    }
    const session = loadSession(req, res, true);
    const q = (url.searchParams.get('q') || '').slice(0, 100);
    if (TEST_ROUTES && p.startsWith('/__test/')) return testRoutes(req, res, url, session);
    if (p === '/' || p === '/projects') return render(req, res, 200, {title: 'المشاريع', q, panel: emptyPanel()});
    const match = p.match(/^\/projects\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]), project = projectById(id);
      if (!project) return errorPage(req, res, 404, 'المشروع غير موجود', 'لا يوجد مشروع بالمعرّف المطلوب.', q);
      const view = url.searchParams.get('view') === 'tasks' ? 'tasks' : 'overview';
      return render(req, res, 200, {
        title: project.title, q, view, selected: id, searchAction: '/projects/' + encodeURIComponent(id),
        panel: panelView(project, session, {q, view, saved: url.searchParams.has('saved')}), tab: tabView(project, view, q)
      });
    }
    return errorPage(req, res, 404, 'الصفحة غير موجودة', 'لا يوجد مسار بهذا العنوان.');
  }
  if (req.method === 'POST') {
    const match = p.match(/^\/projects\/([^/]+)\/notes$/);
    if (!match) return errorPage(req, res, 404, 'الصفحة غير موجودة', 'لا يوجد مسار بهذا العنوان.');
    const session = loadSession(req, res);
    if (!session) return errorPage(req, res, 403, 'انتهت الجلسة', 'انتهت الجلسة؛ أعد تحميل الصفحة ثم حاول مجددًا.');
    // CSRF: Origin must match exactly when present (so "null" is rejected), Fetch Metadata must be same-origin,
    // and the session-bound token must match (constant-time).
    const expected = process.env.PUBLIC_ORIGIN || 'http://' + req.headers.host;
    const site = req.headers['sec-fetch-site'];
    if ((req.headers.origin !== undefined && req.headers.origin !== expected) || (site && !['same-origin', 'none'].includes(site))) {
      return errorPage(req, res, 403, 'مصدر الطلب غير مسموح', 'رُفض الطلب لأن مصدره لا يطابق أصل التطبيق.');
    }
    let body = '';
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 16384) return errorPage(req, res, 413, 'حجم النموذج كبير', 'تجاوز النموذج الحد المسموح.'); }
    const data = new URLSearchParams(body);
    const token = Buffer.from(data.get('csrf') || ''), real = Buffer.from(session.csrf);
    if (token.length !== real.length || !crypto.timingSafeEqual(token, real)) return errorPage(req, res, 403, 'رمز الحماية غير صالح', 'رمز حماية النموذج غير صالح؛ أعد تحميل الصفحة.');
    const id = decodeURIComponent(match[1]), project = projectById(id);
    if (!project) return errorPage(req, res, 404, 'المشروع غير موجود', 'لا يوجد مشروع بالمعرّف المطلوب.');
    const note = data.get('note') || '', q = (data.get('q') || '').slice(0, 100);
    if (!note.trim() || note.length > 300) {
      return render(req, res, 422, {title: project.title, q, selected: id, searchAction: '/projects/' + encodeURIComponent(id),
        panel: panelView(project, session, {q, note, error: 'الملاحظة مطلوبة ويجب ألا تتجاوز 300 حرف.'}), tab: tabView(project, 'overview', q)});
    }
    session.notes[project.id] = note;
    return redirect(res, '/projects/' + encodeURIComponent(project.id) + query({q, saved: '1'})); // PRG: POST → 303 → GET
  }
  return send(res, 405, '<!doctype html><title>405</title><h1>405</h1>', {Allow: 'GET, HEAD, POST'});
}
const port = Number(process.env.PORT ?? 4188);
const server = http.createServer((req, res) => handler(req, res).catch(error => {
  console.error('request failed', error.name);
  if (!res.headersSent) send(res, 500, '<!doctype html><html lang="ar" dir="rtl"><head><title>خطأ داخلي</title></head><body><h1>خطأ داخلي</h1></body></html>'); else res.end();
}));
server.requestTimeout = 15000; // slow-loris guard: the whole request must arrive within 15 s
server.headersTimeout = 10000;
server.listen(port, '127.0.0.1', () => console.log('HTMZ_STARTER_READY http://127.0.0.1:' + server.address().port));
