# HTMZ Kit — Backend Agnostic + Design System

هذه **حزمة بداية** لبناء تطبيقات ويب صغيرة وسريعة بلغة HTML عادية: الخادم يُصيّر صفحات كاملة لكل عنوان، وطبقة تحسين اختيارية واحدة (`public/kit.js`، أقل من 5 كيلوبايت gzip) تستبدل منطقة محددة بالمعرّف عبر Fetch. مع Design System صارم. ليست نسخة من React أو Vue أو HTMX. **لا توجد اعتماديات تشغيل JavaScript.**

## ماذا يعمل؟
- كل مسار صفحة HTML كاملة مرسومة بواسطة الخادم؛ التطبيق كله يعمل بلا JavaScript (روابط عادية، نماذج عادية، POST ثم 303).
- تحديث جزئي اختياري بسمة واحدة `data-target="#id"` على الرابط أو النموذج: `kit.js` تجلب الصفحة (أو الجزء إن أعاده الخادم مع `X-Fragment-Target`) وتستبدل العنصر بالمعرّف، مع `pushState` وإعادة الجلب عند الرجوع وإدارة التركيز وحالة خطأ مع إعادة محاولة. العقد الكامل في `docs/CONTRACT-AR.md`.
- واجهة عربية RTL ومكونات CSS دلالية مبنية على 48 Design Tokens مع فحص تباين ألوان النص.
- نموذج تجريبي لإدارة المشاريع مع بحث GET وتفاصيل وتبويبات وحفظ ملاحظات POST.
- استجابات 403/404/422 صفحات كاملة تحمل المنطقة نفسها، فتُعرض داخل المنطقة مع الطبقة وكصفحة بدونها؛ 5xx والشبكة والمهلة تعطي حالة خطأ داخل المنطقة.
- CSP صارم بلا `unsafe-inline`، `Referrer-Policy: strict-origin-when-cross-origin`، رفض `Origin: null`، رمز CSRF مرتبط بالجلسة، وفحص `Sec-Fetch-Site`.
- تنفيذان فعليان للعقد: Node.js وPython، كلاهما بالمكتبة القياسية فقط.

## تشغيل Node.js

```powershell
cd C:\projects\htmz-lab\fork\starter
node backends/node/server.mjs
```
افتح http://127.0.0.1:4188/

## تشغيل Python

```powershell
cd C:\projects\htmz-lab\fork\starter
python backends/python/server.py
```
افتح http://127.0.0.1:4189/

لا يلزم `npm install` للتشغيل؛ Playwright موجود فقط لاختبارات المتصفحات.

## معرض نظام التصميم
- http://127.0.0.1:4188/design-system.html (Node)
- http://127.0.0.1:4189/design-system.html (Python)

## إنشاء تطبيق جديد — مولّد فعلي بلا اعتماديات
من داخل `starter` نفّذ:
```powershell
node tools/create-app.mjs my-portal
```
سينشئ مجلدًا جديدًا في `C:\projects\htmz-lab\generated\my-portal` (إذا لم يكن موجودًا)، مع الواجهة ونظام التصميم وتنفيذَي Backend. لا يستبدل ملفات قديمة إطلاقًا.

لتحديد موقع واسم عرض عربي:
```powershell
node tools/create-app.mjs my-portal C:\projects\htmz-lab\generated\my-portal "بوابة المشاريع"
```

لتشغيل التطبيق الجديد: ادخل مجلده وشغّل `node backends/node/server.mjs` أو `python backends/python/server.py`. عدّل `public/index.html` و`projects.json` ثم استبدل Backend التجريبي بخادم الإنتاج الخاص بك عند اللزوم.

## الاختبار
```powershell
cd C:\projects\htmz-lab\fork\starter
npm ci --ignore-scripts
$env:PLAYWRIGHT_BROWSERS_PATH='C:\projects\htmz-lab\browsers'
npx.cmd playwright install chromium firefox webkit
npm run verify  # Design Tokens + Size Gate + Browser Suite (RT-1..13, SV-1..7 × 3 engines × 2 backends) + Generator Safety
```

اقرأ `docs/CONTRACT-AR.md` (العقد الحالي) و`docs/DESIGN-SYSTEM-AR.md` و`docs/PRODUCTION-CHECKLIST-AR.md`. الوثيقة `docs/ARCHITECTURE-AR.md` تصف عقد الإطار المخفي القديم وتبقى كسجل فقط.

**تحذير الإنتاج:** المثال لا يتضمن حسابات مستخدمين أو قاعدة بيانات دائمة أو TLS/Proxy أو إدارة جلسات موزعة أو نسخًا احتياطية. الجاهزية للإنتاج تخص التطبيق المتكامل وليس مجرد نجاح Runtime.