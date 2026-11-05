<div dir="rtl" lang="ar">

# الملحق A1 — سجل إعادة التشغيل والفحوص المستقلة

> كل ما في هذا الملحق أُنتج يوم 2026-11-05 على Windows 11 بـ Node v24.18.0 وPython 3.14.6 وPlaywright 1.62.1. أُجريت كل عمليات التشغيل على **نسخة من الشجرة المُلتزَمة** (`git archive HEAD`) في مجلد مؤقت، مع ربط `node_modules` بوصلة (junction)، حتى لا تتغير شجرة العمل الأصلية. متغير البيئة `PLAYWRIGHT_BROWSERS_PATH` أشار إلى محركات المختبر المحلية.

## 1. إعادة تشغيل حزمة الفرع الهندسي (`fork/tests/run.mjs`)

| النسخة | Chromium (Chrome 140.0.7339.208) | Firefox 153.0 | WebKit 26.5 | المجموع |
|---|---|---|---|---|
| `original` (`htmz.html`) | 17/19 | 17/19 | 17/19 | 51/57 |
| `safe` (`htmz.safe.html`) | 19/19 | 19/19 | 19/19 | 57/57 |

الفشلان في النسخة الأصلية لكل محرك (كما هو متوقع ومُوثَّق): `invalid selector does not crash` و`cross-origin navigation does not crash`، وكلاهما استثناء غير ملتقط في الكونسول وليس كسرًا وظيفيًا. رسائل الأخطاء الحرفية:

</div>

```text
Chromium: Failed to execute 'querySelector' on 'Document': '#%5B' is not a valid selector.
Chromium: Failed to read a named property 'hash' from 'Location': Blocked a frame with origin "http://127.0.0.1:50066" from accessing a cross-origin frame.
Firefox:  Document.querySelector: '#%5B' is not a valid selector
Firefox:  Permission denied to access property "hash" on cross-origin object
WebKit:   '#%5B' is not a valid selector.
WebKit:   Blocked a frame with origin "http://127.0.0.1:50066" from accessing a cross-origin frame.
```

<div dir="rtl" lang="ar">

## 2. إعادة تشغيل حزمة Starter Kit (`starter/package.json` → `verify`)

| الفحص | النتيجة |
|---|---|
| `tools/design-check.mjs` | PASS؛ 48 رمزًا، 130 مرجعًا، أزواج التباين: text/surface 14.94، muted/surface 4.76، primary/primary-soft 6.25، on-dark/header 14.57، success/success-soft 5.87، error/error-soft 6.84 |
| `tests/browser.mjs` | 108 PASS / 0 FAIL (Node وPython × Chromium 151.0.7922.34 وFirefox 153.0 وWebKit 26.5 × 18 فحصًا) |
| `tests/scaffold.mjs` | PASS؛ 6 فحوص (generator, locale, manifests, files, no-overwrite, guide)؛ المجلد المؤقت `generated/qa-…` أُنشئ ثم حُذف داخل النسخة المؤقتة |

## 3. إعادة تشغيل توصيف التاريخ وفحوص الأمان (`fork/tests/history.mjs` و`probes.mjs`)

- **التاريخ:** في المحركات الثلاثة، بعد تحميل `one` ثم `two` في `#slot`: `history.back()` يُظهر `one`، و`history.forward()` يُظهر `two`، وعنوان الصفحة العليا لم يتغير. مطابق للأدلة المُلتزَمة.
- **فحوص الأمان (Chrome 140):** `activeSameOriginHTML.observed = true`؛ `focusOnReplacedNode: before "inside-focus", after ""`؛ `duplicateIDs.count = 2`؛ `cspInlineHandler.originalSlotText = "CSP"`. مطابق.

## 4. الفحوص المستقلة الجديدة

### 4.1 السكربت

شُغّل من داخل نسخة `starter/` المؤقتة بأمر `node tests/_independent-probes.tmp.mjs <path>` ثم حُذف. لم يُضَف إلى المستودع كملف تنفيذي عمدًا؛ هو هنا للتوثيق وإمكانية إعادة الإنتاج.

</div>

```js
// Independent probes run against the committed starter (scratch copy). Read-only w.r.t. the repo.
import {spawn} from 'node:child_process';
import {chromium, firefox, webkit} from 'playwright';
const kit = process.argv[2];
const child = spawn(process.execPath, ['backends/node/server.mjs'], {cwd: kit, env: {...process.env, PORT: '0'}, stdio: ['ignore','pipe','pipe']});
const base = await new Promise((ok, no) => { let log=''; child.stdout.on('data', c => { log += c; const m = log.match(/HTMZ_STARTER_READY (http:\/\/127\.0\.0\.1:\d+)/); if (m) ok(m[1]); }); child.stderr.on('data', c => log += c); setTimeout(() => no(Error('timeout '+log)), 10000); });
const out = {base, engines: {}};
try {
  for (const [name, engine] of Object.entries({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true});
    const r = {version: browser.version()};
    // Probe A: JavaScript disabled — what happens when the user clicks an htmz link?
    {
      const ctx = await browser.newContext({javaScriptEnabled: false});
      const page = await ctx.newPage();
      await page.goto(base + '/');
      const before = await page.locator('#project-panel h2').innerText();
      await page.locator('#project-list a[href*="P-102"]').click();
      await page.waitForTimeout(800);
      const after = await page.locator('#project-panel h2').innerText();
      const frameUrl = await page.locator('iframe[name=htmz]').evaluate(f => f.contentWindow?.location?.href).catch(e => 'ERR ' + e.message);
      r.noJs = {panelBefore: before, panelAfter: after, topUrl: page.url(), hiddenFrameUrl: frameUrl, userSawChange: before !== after};
      await ctx.close();
    }
    // Probe B: headers actually sent by the POST form (SSR form, then the transplanted one).
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const posts = [];
      page.on('request', req => { if (req.method() === 'POST') posts.push({url: req.url(), origin: req.headers()['origin'] ?? '(absent)', secFetchSite: req.headers()['sec-fetch-site'] ?? '(absent)', secFetchDest: req.headers()['sec-fetch-dest'] ?? '(absent)', referer: req.headers()['referer'] ?? '(absent)'}); });
      await page.goto(base + '/');
      await page.locator('#project-panel textarea').fill('probe one');
      await page.locator('#project-panel button[type=submit]').click();
      await page.waitForFunction(() => document.querySelector('#project-panel')?.textContent.includes('تم حفظ'));
      await page.locator('#project-panel textarea').fill('probe two');
      await page.locator('#project-panel button[type=submit]').click();
      await page.waitForFunction(() => document.querySelector('#project-panel textarea')?.value === 'probe two');
      r.postHeaders = posts;
      // Probe C: open a fragment URL directly, as a user would via "open in new tab"
      const res = await page.goto(base + '/project?id=P-102');
      r.directFragment = {status: res.status(), hasHtmlRoot: await page.evaluate(() => !!document.querySelector('link[rel=stylesheet]')), bodyStart: (await res.text()).slice(0, 80)};
      // Probe D: Back button after two fragment loads (starter runtime)
      await page.goto(base + '/');
      await page.locator('#project-list a[href*="P-102"]').click();
      await page.waitForFunction(() => document.querySelector('#project-panel h2')?.textContent.includes('تحديث'));
      await page.locator('#project-list a[href*="P-103"]').click();
      await page.waitForFunction(() => document.querySelector('#project-panel h2')?.textContent.includes('تصميم'));
      const urlBefore = page.url();
      await page.goBack().catch(()=>{});
      await page.waitForTimeout(700);
      r.backButton = {urlBefore, urlAfterBack: page.url(), panelAfterBack: await page.locator('#project-panel h2').innerText().catch(()=>'(none)'), statusText: await page.locator('#ds-status').innerText().catch(()=>'')};
      await ctx.close();
    }
    await browser.close();
    out.engines[name] = r;
  }
} finally { child.kill(); }
console.log(JSON.stringify(out, null, 2));
```

<div dir="rtl" lang="ar">

### 4.2 النتائج الخام (مختصرة بلا تغيير في القيم)

| المحرك | A: بلا JS — تغيّر اللوحة؟ | A: عنوان الإطار المخفي | B: `Origin` في POST | B: `Sec-Fetch-Site` / `Sec-Fetch-Dest` | C: الرابط المباشر | D: العنوان بعد الرجوع | D: اللوحة بعد الرجوع |
|---|---|---|---|---|---|---|---|
| Chromium 151.0.7922.34 | لا (`userSawChange: false`) | `/project?id=P-102#project-panel` | `null` | غير مُبلَّغ عنها من Playwright في Chromium | 200، بلا `<link rel=stylesheet>`، يبدأ بـ `<section id="project-panel"` | `/` (لم يتغير) | «تحديث مركز الخدمات» + إعلان «تم تحديث المحتوى.» |
| Firefox 153.0 | لا | نفسه | `null` (في الإرسالين) | `same-origin` / `iframe` | نفسه | `/` | نفسه |
| WebKit 26.5 | لا | نفسه | `null` (في الإرسالين) | `same-origin` / `iframe` | نفسه | `/` | نفسه |

### 4.3 تفسير `Origin: null`

مواصفة Fetch، القسم 3.2 «append a request Origin header»، الخطوة 4: لطلب طريقته ليست GET ولا HEAD ونمطه ليس `cors`، إذا كانت سياسة المُحيل `no-referrer` «Set serializedOrigin to `null`». الخادمان يرسلان `Referrer-Policy: no-referrer` على الصفحة الرئيسية، فكل POST منها يحمل `Origin: null` بغض النظر عن الإطار. المصدر: <span dir="ltr">https://fetch.spec.whatwg.org/#append-a-request-origin-header</span>. توثيق MDN يذكر الحالة نفسها ضمن قائمة حالات `null`: <span dir="ltr">https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin</span>.

## 5. حالة Git وقت المراجعة

| البند | القيمة |
|---|---|
| upstream (`Kalabasa/htmz`) | `941cd22426e138e1897f9f3bc78992066c079cf6` (master)، 63 التزامًا، 101 ملف |
| الفرع `feat/htmz-engineering-improvements` | `d91896374e88db0fda201d3ace2c8ceb7abb7a5c` |
| الفرع `feat/backend-agnostic-design-system` | `66d4de65d455cb00ee753cbc581b19a2c3118993` (الأساس لهذا الفرع التوثيقي) |
| شجرة العمل قبل البدء | نظيفة (`git status --porcelain` فارغ) |
| حماية الفرع `master` في التفريعة | غير مفعّلة (API: «Branch not protected»)؛ لم يُمس |
| أحجام الملفات (بايت خام / gzip بـ Node zlib) | `htmz.html` 168/155؛ `htmz.safe.html` 221/192؛ `starter/public/runtime.js` 2365/1132؛ `starter/public/design.css` 8330/2059 |

## 6. المراجع الخارجية الرئيسية

- htmz: <span dir="ltr">https://github.com/Kalabasa/htmz</span> و<span dir="ltr">https://leanrada.com/htmz/</span>
- القضايا: <span dir="ltr">https://github.com/Kalabasa/htmz/issues/28</span> (التاريخ)، <span dir="ltr">https://github.com/Kalabasa/htmz/issues/27</span> (إعادة التوجيه)، <span dir="ltr">https://github.com/Kalabasa/htmz/issues/2</span> (بلا تاريخ)، <span dir="ltr">https://github.com/Kalabasa/htmz/pull/37</span> (رموز الحالة)
- WHATWG: <span dir="ltr">https://github.com/whatwg/html/issues/6501</span>؛ <span dir="ltr">https://fetch.spec.whatwg.org/</span>
- MDN iframe: <span dir="ltr">https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe</span>
- Baseline: <span dir="ltr">https://web.dev/baseline</span>؛ <span dir="ltr">https://webstatus.dev/</span>؛ <span dir="ltr">https://bcd.developer.mozilla.org/</span>
- Interop 2026: <span dir="ltr">https://webkit.org/blog/17818/announcing-interop-2026/</span>
- حصص المتصفحات: <span dir="ltr">https://gs.statcounter.com/</span>
- GitHub Markdown: <span dir="ltr">https://github.com/github/markup</span>

</div>
