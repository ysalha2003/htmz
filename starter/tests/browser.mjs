// Real-browser acceptance suite for the HTMZ Kit contract (docs/CONTRACT-AR.md): RT-1..RT-13 and SV-1..SV-7
// in Chromium, Firefox and WebKit against two independently implemented backends (Node, Python).
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {chromium, firefox, webkit} from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engines = {chromium, firefox, webkit};
// Optional narrowing for local iteration: KIT_ENGINES=chromium,webkit KIT_BACKENDS=node (CI runs everything).
const pickSet = (env, all) => all.filter(x => !process.env[env] || process.env[env].split(',').includes(x));
const checks = [];
const report = {date: new Date().toISOString(), platform: process.platform, kit: {}, notes: process.platform === 'win32' ? ['webkit: startViewTransition stubbed out (Playwright WebKit/Windows web-process crash); see tests/browser.mjs open()'] : [], results: [], counts: {pass: 0, fail: 0}, versions: {}};
function record(backend, browser, name, ok, detail = '') { checks.push({backend, browser, name, status: ok ? 'PASS' : 'FAIL', detail}); }

async function startBackend(name) {
  const args = name === 'node' ? ['backends/node/server.mjs'] : ['backends/python/server.py'];
  const child = spawn(name === 'node' ? process.execPath : 'python', args, {cwd: root, env: {...process.env, PORT: '0', KIT_TEST_ROUTES: '1'}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  let log = '';
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Backend start timeout ' + name + ': ' + log.slice(0, 600))), 10000);
    child.stdout.on('data', chunk => { log += String(chunk); const match = log.match(/HTMZ_STARTER_READY (http:\/\/127\.0\.0\.1:\d+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    child.stderr.on('data', c => { log += String(c); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('exit', n => { clearTimeout(timer); reject(Error('Backend terminated ' + n + ': ' + log)); });
  });
  return {base, child};
}
// A second origin (different port) standing in for "another site" in redirect and Origin tests.
function startExternal() {
  const server = http.createServer((req, res) => { res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end('<!doctype html><html><head><title>External</title></head><body><h1 id="external">external site</h1></body></html>'); });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({base: 'http://127.0.0.1:' + server.address().port, close: () => server.close()})));
}
const waitText = (page, selector, text, timeout = 5000) => page.waitForFunction(({selector, text}) => (document.querySelector(selector)?.textContent || '').includes(text), {selector, text}, {timeout});
const assert = (condition, message) => { if (!condition) throw Error(message); };
const addLink = (page, id, href) => page.evaluate(({id, href}) => { const a = document.createElement('a'); a.id = id; a.href = href; a.dataset.target = '#project-panel'; a.textContent = id; document.querySelector('.ds-footer').append(a); }, {id, href});
const checkHeaders = (response, label) => {
  const h = response.headers();
  assert((h['content-type'] || '').startsWith('text/html; charset=utf-8'), label + ': content-type ' + h['content-type']);
  assert(h['x-content-type-options'] === 'nosniff', label + ': nosniff missing');
  assert(h['content-security-policy']?.includes("script-src 'self'") && !h['content-security-policy'].includes('unsafe-inline'), label + ': CSP weak');
  assert(h['referrer-policy'] === 'strict-origin-when-cross-origin', label + ': referrer-policy ' + h['referrer-policy']);
  assert(h['vary']?.includes('X-Fragment-Target'), label + ': Vary missing');
};

async function suite(name, engine, backend, base, external) {
  const browser = await engine.launch({headless: true});
  report.versions[name] = browser.version();
  const test = async (title, fn) => { try { const note = await fn(); record(backend, name, title, true, note || ''); } catch (e) { record(backend, name, title, false, String(e.message).slice(0, 500)); } };
  const open = async (options = {}) => {
    const context = await browser.newContext({viewport: {width: 1280, height: 840}, ...options});
    // Playwright's WebKit build for Windows crashes its web process when document.startViewTransition runs on this
    // page (reproduced deterministically; not reproducible in Chromium/Firefox or with the swap alone). It is not a
    // shipping browser, so on Windows the WebKit runs use the no-transition path; RT-13 still verifies the call
    // logic with a spy. On macOS/Linux WebKit runs the real path.
    if (name === 'webkit' && process.platform === 'win32') await context.addInitScript(() => { document.startViewTransition = undefined; });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    return {context, page, errors};
  };
  const back = page => page.evaluate(() => history.back());
  const forward = page => page.evaluate(() => history.forward());
  try {
    // ---------- A. enhanced navigation in one long-lived page ----------
    const {context, page, errors} = await open();
    await test('SV-1/SV-3 home is a full page with strict headers', async () => {
      const response = await page.goto(base + '/');
      assert(response.status() === 200, 'status ' + response.status());
      checkHeaders(response, 'home');
      assert(await page.locator('#project-list li').count() === 3, 'list incomplete');
      await waitText(page, '#project-panel h2', 'اختر مشروعًا');
      assert(await page.locator('iframe').count() === 0, 'iframe still present');
    });
    await test('RT-4 link replaces only the target element', async () => {
      await page.evaluate(() => { document.querySelector('h1').dataset.marker = 'kept'; });
      await page.locator('#project-list a[href*="P-102"]').click();
      await waitText(page, '#project-panel h2', 'تحديث مركز الخدمات');
      assert(await page.evaluate(() => document.querySelector('h1').dataset.marker) === 'kept', 'page outside the target was replaced');
      assert(await page.locator('#project-list li').count() === 3, 'list region touched');
      assert(await page.locator('#project-panel').count() === 1, 'duplicate target');
    });
    await test('RT-5 URL and title follow a GET link', async () => {
      assert(await page.evaluate(() => location.pathname) === '/projects/P-102', 'URL not pushed');
      assert((await page.title()).startsWith('تحديث مركز الخدمات'), 'title not updated: ' + await page.title());
    });
    await test('RT-12 focus lands in the region and one status region announces', async () => {
      assert(await page.evaluate(() => document.getElementById('project-panel').contains(document.activeElement)), 'focus outside region');
      assert(await page.evaluate(() => document.querySelectorAll('.kit-status[role="status"]').length) === 1, 'status region count');
      assert((await page.locator('.kit-status').textContent()).includes('تم التحديث'), 'no announcement');
    });
    await test('RT-4 nested tab region swaps from the same page URL (fragment)', async () => {
      const requests = [];
      page.on('request', r => { if (r.headers()['x-fragment-target']) requests.push(r.url()); });
      await page.locator('#project-tab a[href*="view=tasks"]').click();
      await waitText(page, '#project-tab', 'المهام الأساسية');
      assert(requests.length === 1, 'expected one fragment request, saw ' + requests.length);
      assert(await page.locator('#project-tab a[aria-current="true"]').textContent() === 'المهام', 'aria-current not updated with the fragment');
      assert((await page.evaluate(() => location.search)).includes('view=tasks'), 'URL missing view');
      assert(await page.evaluate(() => document.activeElement?.textContent) === 'المهام الأساسية', 'focus not on tab heading');
      assert(await page.locator('#project-panel textarea').count() === 1, 'panel outside tab replaced');
    });
    await test('RT-5 GET form pushes its query and swaps the list only', async () => {
      await page.locator('#project-search').fill('تصميم');
      await page.locator('.ds-search button').click();
      await page.waitForFunction(() => document.querySelectorAll('#project-list li').length === 1);
      assert((await page.evaluate(() => location.search)).includes('q='), 'query not pushed');
      assert((await page.locator('#project-list a').getAttribute('href')).includes('q='), 'list links lost the query');
      assert((await page.locator('#project-panel h2').textContent()).includes('تحديث مركز الخدمات'), 'selection lost by a list search');
      assert((await page.locator('#project-list form').getAttribute('action')).endsWith('/projects/P-102'), 'list did not refresh from the full page');
      assert((await page.locator('#project-search').inputValue()) === 'تصميم', 'search value not re-rendered');
    });
    await test('RT-5 back and forward re-fetch the recorded region', async () => {
      await back(page);
      await page.waitForFunction(() => document.querySelectorAll('#project-list li').length === 3 && !location.search.includes('q='));
      await forward(page);
      await page.waitForFunction(() => document.querySelectorAll('#project-list li').length === 1 && location.search.includes('q='));
      // One traversal at a time: WebKit coalesces two rapid history.back() calls into a single step.
      await back(page);
      await page.waitForFunction(() => location.search.includes('view=tasks') && !location.search.includes('q=') && document.querySelector('#project-tab')?.textContent.includes('المهام الأساسية'));
      await back(page);
      await page.waitForFunction(() => location.pathname === '/projects/P-102' && !location.search && document.querySelector('#project-tab')?.textContent.includes('ملخص المشروع'));
      await back(page);
      await page.waitForFunction(() => location.pathname === '/' && document.querySelector('#project-panel h2')?.textContent.includes('اختر مشروعًا'));
      await forward(page);
      await page.waitForFunction(() => location.pathname === '/projects/P-102' && document.querySelector('#project-panel h2')?.textContent.includes('تحديث مركز الخدمات'));
    });
    await test('RT-7 422 re-renders the form with values, alert and focus, without pushState', async () => {
      await page.locator('#project-panel textarea').fill('   ');
      await page.locator('#project-panel button[type=submit]').click();
      await page.locator('#project-panel [role="alert"]').waitFor({timeout: 5000});
      assert(await page.locator('#project-panel textarea').inputValue() === '   ', 'values lost');
      assert(await page.evaluate(() => document.activeElement === document.querySelector('#project-panel textarea[aria-invalid="true"]')), 'first error not focused');
      assert(await page.evaluate(() => location.pathname) === '/projects/P-102', 'POST without redirect changed the URL');
    });
    const payload = '<script>alert(1)</script><img src=x onerror=alert(1)> ملاحظة';
    await test('RT-6/SV-6 PRG: POST → 303 → GET pushes the final URL and escapes output', async () => {
      await page.locator('#project-panel textarea').fill(payload);
      await page.locator('#project-panel button[type=submit]').click();
      await page.waitForFunction(() => location.search.includes('saved=1'), null, {timeout: 5000});
      await waitText(page, '#project-panel', 'تم حفظ الملاحظة بنجاح');
      assert(await page.locator('#project-panel textarea').inputValue() === payload, 'round-trip mismatch');
      assert(await page.locator('#project-panel img, #project-panel script').count() === 0, 'HTML injected');
      assert(await page.locator('#project-panel [role="alert"]').count() === 0, 'stale alert');
    });
    await test('RT-5 back after PRG re-fetches the pre-redirect URL', async () => {
      await back(page);
      await page.waitForFunction(() => !location.search.includes('saved=1') && !document.querySelector('#project-panel .ds-alert-success'));
      assert(await page.locator('#project-panel textarea').inputValue() === payload, 'saved note missing after back');
    });
    await test('RT-9 race: the latest request wins and the slow one never appears', async () => {
      await addLink(page, 'race-slow', '/__test/slow?ms=1500&label=slow');
      await addLink(page, 'race-fast', '/__test/slow?ms=100&label=fast');
      await page.locator('#race-slow').click();
      await page.locator('#race-fast').click();
      await waitText(page, '#project-panel h2', 'fast');
      await page.waitForTimeout(1900);
      assert((await page.locator('#project-panel h2').textContent()) === 'fast', 'slow response replaced the fast one');
      assert((await page.evaluate(() => location.search)).includes('label=fast'), 'URL not the latest');
      assert(await page.locator('#project-panel[aria-busy]').count() === 0, 'aria-busy stuck');
    });
    await test('RT-12 aria-busy is set during the request and cleared after', async () => {
      await addLink(page, 'busy', '/__test/slow?ms=700&label=busy');
      await page.locator('#busy').click();
      await page.locator('#project-panel[aria-busy="true"]').waitFor({timeout: 600});
      await waitText(page, '#project-panel h2', 'busy');
      assert(await page.locator('#project-panel[aria-busy]').count() === 0, 'aria-busy not cleared');
    });
    await test('RT-8 500 → in-place error with retry; retry recovers', async () => {
      await addLink(page, 'flaky', '/__test/flaky');
      await page.locator('#flaky').click();
      await page.locator('#project-panel .kit-error').waitFor({timeout: 5000});
      assert((await page.locator('#project-panel h2').textContent()) === 'busy', 'unknown content replaced the region');
      assert((await page.locator('.kit-error').textContent()).includes('(500)'), 'status not shown');
      assert(await page.evaluate(() => document.activeElement?.closest('.kit-error') !== null), 'retry not focused');
      await page.locator('.kit-error button').click();
      await waitText(page, '#project-panel h2', 'flaky ok');
      assert(await page.locator('.kit-error').count() === 0, 'error state not cleared');
    });
    await test('RT-8 4xx without the target id → error state', async () => {
      await addLink(page, 'e400', '/__test/error400');
      await page.locator('#e400').click();
      await page.locator('#project-panel .kit-error').waitFor({timeout: 5000});
      assert((await page.locator('.kit-error').textContent()).includes('(400)'), 'status not shown');
      assert((await page.locator('#project-panel h2').textContent()) === 'flaky ok', 'region replaced');
    });
    await test('RT-8 network failure → error state', async () => {
      await page.route('**/__test/offline*', route => route.abort('failed'));
      await addLink(page, 'offline', '/__test/offline');
      await page.locator('#offline').click();
      await page.locator('#project-panel .kit-error').waitFor({timeout: 5000});
      await page.unroute('**/__test/offline*');
      assert((await page.locator('#project-panel h2').textContent()) === 'flaky ok', 'region replaced');
    });
    await test('RT-8 10 s timeout → error state', async () => {
      await addLink(page, 'hang', '/__test/hang');
      const started = Date.now();
      await page.locator('#hang').click();
      await page.locator('#project-panel .kit-error').waitFor({timeout: 14000});
      const elapsed = Date.now() - started;
      assert(elapsed >= 9500 && elapsed < 13000, 'timeout after ' + elapsed + ' ms');
      return 'timed out after ' + elapsed + ' ms';
    });
    await test('RT-11 scripts and inline handlers in responses never execute', async () => {
      await addLink(page, 'unsafe', '/__test/unsafe');
      await page.locator('#unsafe').click();
      await waitText(page, '#project-panel h2', 'unsafe');
      await page.waitForTimeout(400);
      const flags = await page.evaluate(() => [window.__kitScript, window.__kitImg]);
      assert(flags.every(v => v === undefined), 'script executed: ' + JSON.stringify(flags));
    });
    await test('404 page carrying the target id is swapped and its URL pushed', async () => {
      await addLink(page, 'missing', '/projects/zzz');
      await page.locator('#missing').click();
      await waitText(page, '#project-panel h2', 'المشروع غير موجود');
      assert(await page.evaluate(() => location.pathname) === '/projects/zzz', 'URL not pushed for 404');
    });
    await test('modified clicks, download, _blank and foreign links stay native', async () => {
      const results = await page.evaluate(ext => {
        const out = [];
        addEventListener('click', e => { out.push(e.defaultPrevented); e.preventDefault(); });
        const make = attrs => { const a = document.createElement('a'); Object.assign(a, {href: '/projects/P-101', textContent: 'x'}); a.dataset.target = '#project-panel'; for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v); document.body.append(a); return a; };
        const fire = (a, init = {}) => a.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, ...init}));
        fire(make({}), {ctrlKey: true});
        fire(make({}), {button: 1});
        fire(make({download: ''}));
        fire(make({target: '_blank'}));
        fire(make({href: ext + '/landing'}));
        fire(make({}));
        return out;
      }, external);
      assert(JSON.stringify(results) === JSON.stringify([false, false, false, false, false, true]), 'interception matrix ' + JSON.stringify(results));
    });
    await test('RT-6 redirect to another origin becomes a full navigation', async () => {
      await addLink(page, 'external', '/__test/external?to=' + encodeURIComponent(external + '/landing'));
      await page.locator('#external').click();
      await page.waitForURL(external + '/landing', {timeout: 5000});
      assert(await page.locator('h1#external').count() === 1, 'external page not shown');
    });
    await test('no uncaught exceptions in the enhanced page', async () => {
      // WebKit reports the intentional cross-origin redirect (RT-6) as a page error ("access control checks"); it is the browser's network report, not a thrown exception.
      const real = errors.filter(m => !/access control checks|Load failed/.test(m));
      assert(real.length === 0, real.join(' | ').slice(0, 300));
    });
    await context.close();

    // ---------- B. fallback and preference contexts ----------
    await test('RT-10 internal exception → full navigation quickly', async () => {
      const {context, page} = await open();
      await context.addInitScript(() => {
        DOMParser.prototype.parseFromString = () => { throw Error('kit-test: forced parse failure'); };
        addEventListener('click', () => sessionStorage.setItem('kitClick', String(performance.timeOrigin + performance.now())), true);
      });
      await page.goto(base + '/');
      await page.evaluate(() => { window.__alive = 1; });
      await page.locator('#project-list a[href*="P-102"]').click();
      await page.waitForURL('**/projects/P-102', {timeout: 5000});
      await waitText(page, '#project-panel h2', 'تحديث مركز الخدمات');
      const [alive, ms] = await page.evaluate(() => [window.__alive, Math.round(performance.timeOrigin - Number(sessionStorage.getItem('kitClick')))]);
      await context.close();
      assert(alive === undefined, 'no full navigation happened');
      assert(ms < 1000, 'fallback took ' + ms + ' ms');
      return 'fallback navigation started ' + ms + ' ms after the click';
    });
    await test('2xx without the target id → full navigation (contract warning)', async () => {
      const {context, page} = await open();
      const warnings = [];
      page.on('console', m => { if (m.type() === 'warning' && m.text().startsWith('kit:')) warnings.push(m.text()); });
      await page.goto(base + '/');
      await page.evaluate(() => { window.__alive = 1; });
      await addLink(page, 'nt', '/__test/no-target');
      await page.locator('#nt').click();
      await page.waitForURL('**/__test/no-target', {timeout: 5000});
      await waitText(page, '#other-panel h2', 'other');
      const alive = await page.evaluate(() => window.__alive);
      await context.close();
      assert(alive === undefined, 'no full navigation happened');
      assert(warnings.length === 1, 'console warning: ' + JSON.stringify(warnings));
    });
    await test('non-HTML response → full navigation', async () => {
      const {context, page} = await open();
      await page.goto(base + '/');
      await addLink(page, 'json', '/__test/json');
      await page.locator('#json').click();
      await page.waitForURL('**/__test/json', {timeout: 5000});
      const text = await page.evaluate(() => document.body.textContent);
      await context.close();
      assert(text.includes('"ok":true'), 'JSON page not shown');
    });
    await test('RT-13 startViewTransition only without prefers-reduced-motion', async () => {
      const spy = () => { window.__vt = 0; document.startViewTransition = cb => { window.__vt++; cb(); return {finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve()}; }; };
      const counts = [];
      for (const reducedMotion of ['reduce', 'no-preference']) {
        const {context, page} = await open({reducedMotion});
        await context.addInitScript(spy);
        await page.goto(base + '/');
        await page.locator('#project-list a[href*="P-102"]').click();
        await waitText(page, '#project-panel h2', 'تحديث مركز الخدمات');
        counts.push(await page.evaluate(() => window.__vt));
        await context.close();
      }
      assert(counts[0] === 0 && counts[1] === 1, 'startViewTransition calls [reduce, no-preference] = ' + JSON.stringify(counts));
    });

    // ---------- C. JavaScript disabled: everything is a full page ----------
    await test('RT-3 no JavaScript: links, search, tabs, PRG and 422 work as full pages', async () => {
      const {context, page} = await open({javaScriptEnabled: false});
      await page.goto(base + '/');
      await page.locator('#project-list a[href*="P-102"]').click();
      await page.waitForURL('**/projects/P-102');
      assert((await page.locator('#project-panel h2').textContent()).includes('تحديث مركز الخدمات'), 'project page');
      await page.locator('#project-search').fill('تحديث');
      await page.locator('.ds-search button').click();
      await page.waitForURL('**/projects/P-102?q=*');
      assert(await page.locator('#project-list li').count() === 1 && (await page.locator('#project-panel h2').textContent()).includes('تحديث مركز الخدمات'), 'search page keeps selection');
      await page.locator('#project-tab a[href*="view=tasks"]').click();
      await page.waitForURL('**/projects/P-102?*view=tasks*');
      assert((await page.locator('#project-tab').textContent()).includes('المهام الأساسية'), 'tab page');
      await page.locator('#project-panel textarea').fill('ملاحظة بلا جافاسكربت');
      await page.locator('#project-panel button[type=submit]').click();
      await page.waitForURL('**/projects/P-102?*saved=1*');
      assert((await page.locator('#project-panel').textContent()).includes('تم حفظ الملاحظة بنجاح'), 'PRG page');
      assert((await page.evaluate(() => location.search)).includes('q='), 'PRG lost the page state (q)');
      assert(await page.locator('#project-panel textarea').inputValue() === 'ملاحظة بلا جافاسكربت', 'note not persisted');
      await page.locator('#project-panel textarea').fill('   ');
      await page.locator('#project-panel button[type=submit]').click();
      await page.locator('#project-panel [role="alert"]').waitFor();
      assert(await page.locator('#project-panel textarea').inputValue() === '   ', '422 page lost values');
      assert(await page.evaluate(() => document.activeElement === document.querySelector('textarea')), '422 page autofocus');
      await context.close();
    });

    // ---------- D. HTTP contract through the request API (shares the browser cookie jar) ----------
    const {context: api, page: apiPage} = await open();
    await apiPage.goto(base + '/projects/P-102');
    const token = await apiPage.locator('input[name=csrf]').inputValue();
    const req = api.request;
    const form = (note, csrf = token) => ({csrf, note});
    await test('SV-1 every GET route answers a full document to Sec-Fetch-Dest: document', async () => {
      for (const route of ['/', '/projects?q=x', '/projects/P-102', '/projects/P-102?view=tasks', '/projects/zzz']) {
        const r = await req.get(base + route, {headers: {'Sec-Fetch-Dest': 'document'}});
        const body = await r.text();
        assert(body.startsWith('<!doctype html>') && body.includes('<title>') && body.includes('id="project-panel"'), route + ' is not a full page');
        checkHeaders(r, route);
      }
    });
    await test('SV-2 fragments are optional: self-contained region alone, otherwise the full page', async () => {
      const frag = await req.get(base + '/projects/P-102?view=tasks', {headers: {'X-Fragment-Target': 'project-tab'}});
      const body = await frag.text();
      assert(body.startsWith('<title>') && body.includes('<div id="project-tab"') && body.includes('aria-current="true">المهام') && !body.includes('<!doctype') && !body.includes('project-panel'), 'fragment shape');
      checkHeaders(frag, 'fragment');
      const page = await (await req.get(base + '/projects/P-102', {headers: {'X-Fragment-Target': 'project-panel'}})).text();
      assert(page.startsWith('<!doctype html>') && page.includes('<section id="project-panel"'), 'state-dependent region must come as a full page');
      const unknown = await (await req.get(base + '/projects/P-102', {headers: {'X-Fragment-Target': 'nope'}})).text();
      assert(unknown.startsWith('<!doctype html>'), 'unknown region must fall back to the full page');
      const bad = await (await req.get(base + '/projects/P-102', {headers: {'X-Fragment-Target': '<x>'}})).text();
      assert(bad.startsWith('<!doctype html>'), 'invalid region id must fall back to the full page');
    });
    await test('SV-3 headers on 303, 404 and 422 responses', async () => {
      const r303 = await req.post(base + '/projects/P-102/notes', {headers: {Origin: base}, form: form('ok'), maxRedirects: 0});
      assert(r303.status() === 303 && r303.headers().location === '/projects/P-102?saved=1', '303 ' + r303.status() + ' ' + r303.headers().location);
      checkHeaders(r303, '303');
      const r404 = await req.get(base + '/nothing');
      assert(r404.status() === 404, '404 status'); checkHeaders(r404, '404');
      const r422 = await req.post(base + '/projects/P-102/notes', {headers: {Origin: base}, form: form('   ')});
      assert(r422.status() === 422, '422 status'); checkHeaders(r422, '422');
      const js = await req.get(base + '/kit.js');
      assert(js.headers()['content-type'].startsWith('text/javascript'), 'kit.js content-type');
    });
    await test('SV-4 CSRF: forged token, Origin null, foreign Origin and cross-site metadata → 403', async () => {
      const cases = [
        ['forged token', {Origin: base}, form('x', 'wrong')],
        ['Origin: null', {Origin: 'null'}, form('x')],
        ['foreign Origin', {Origin: external}, form('x')],
        ['Sec-Fetch-Site: cross-site', {Origin: base, 'Sec-Fetch-Site': 'cross-site'}, form('x')],
        ['non-ASCII token', {Origin: base}, form('x', 'invalid-⚠')],
      ];
      for (const [label, headers, body] of cases) {
        const r = await req.post(base + '/projects/P-102/notes', {headers, form: body, maxRedirects: 0});
        assert(r.status() === 403, label + ' → ' + r.status());
      }
      const ok = await req.post(base + '/projects/P-102/notes', {headers: {Origin: base, 'Sec-Fetch-Site': 'same-origin'}, form: form('valid'), maxRedirects: 0});
      assert(ok.status() === 303, 'valid write → ' + ok.status());
      const fresh = await browser.newContext();
      const noSession = await fresh.request.post(base + '/projects/P-102/notes', {headers: {Origin: base}, form: form('x'), maxRedirects: 0});
      await fresh.close();
      assert(noSession.status() === 403, 'write without session → ' + noSession.status());
    });
    await test('SV-5 422 returns the whole form with values, aria-invalid and role=alert', async () => {
      const r = await req.post(base + '/projects/P-102/notes', {headers: {Origin: base, 'X-Fragment-Target': 'project-panel'}, form: form('   ')});
      const body = await r.text();
      assert(r.status() === 422, 'status ' + r.status());
      assert(body.includes('role="alert"') && body.includes('aria-invalid="true"') && body.includes('autofocus') && body.includes('>   </textarea>'), 'form state missing');
      assert(body.includes('name="csrf"') && body.includes('<section id="project-panel"'), 'form incomplete');
    });
    await test('SV-6 script and handler payloads come back encoded everywhere', async () => {
      const r = await req.post(base + '/projects/P-102/notes', {headers: {Origin: base}, form: form(payload)});
      const body = await r.text();
      assert(r.status() === 200 && r.url().includes('saved=1'), 'redirect not followed');
      assert(body.includes('&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;'), 'payload not encoded');
      assert(!body.includes('<script>alert') && !body.includes('<img src=x'), 'raw payload leaked');
      const fragment = await (await req.get(base + '/projects/P-102', {headers: {'X-Fragment-Target': 'project-panel'}})).text();
      assert(!fragment.includes('<img src=x'), 'raw payload leaked in fragment');
    });
    await test('mobile viewport, RTL and no horizontal overflow', async () => {
      await apiPage.setViewportSize({width: 390, height: 844});
      await apiPage.goto(base + '/projects/P-102');
      assert(await apiPage.locator('html').getAttribute('dir') === 'rtl', 'wrong direction');
      const overflow = await apiPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 2, 'horizontal overflow ' + overflow);
    });
    if (backend === 'node' && name === 'chromium') {
      await apiPage.setViewportSize({width: 1280, height: 840});
      await apiPage.goto(base + '/projects/P-102');
      await apiPage.screenshot({path: path.join(root, 'evidence-desktop.png'), fullPage: true});
      await apiPage.setViewportSize({width: 390, height: 844});
      await apiPage.screenshot({path: path.join(root, 'evidence-mobile.png'), fullPage: true});
    }
    await api.close();
  } finally { await browser.close(); }
}

// RT-1 size gate, recorded once.
const kitSource = fs.readFileSync(path.join(root, 'public/kit.js'));
report.kit = {raw: kitSource.length, gzip: zlib.gzipSync(kitSource, {level: 9}).length, limit: 5120};
record('-', '-', 'RT-1 kit.js ≤ 5 KB gzip', report.kit.gzip <= report.kit.limit, report.kit.gzip + ' bytes gzip');

const external = await startExternal();
try {
  for (const backend of pickSet('KIT_BACKENDS', ['node', 'python'])) {
    const server = await startBackend(backend);
    try {
      for (const name of pickSet('KIT_ENGINES', Object.keys(engines))) {
        const engine = engines[name];
        try { await suite(name, engine, backend, server.base, external.base); }
        catch (e) { record(backend, name, 'browser-launch/environment', false, String(e.message).slice(0, 500)); }
      }
    } finally { server.child.kill(); }
  }
} finally {
  external.close();
  report.results = checks;
  report.counts.pass = checks.filter(x => x.status === 'PASS').length;
  report.counts.fail = checks.filter(x => x.status === 'FAIL').length;
  fs.writeFileSync(path.join(root, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({kit: report.kit, counts: report.counts, versions: report.versions, failures: checks.filter(x => x.status === 'FAIL'), evidence: 'browser-results.json'}, null, 2));
}
if (report.counts.fail) process.exitCode = 1;
