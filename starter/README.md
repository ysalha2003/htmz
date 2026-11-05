# HTMZ Kit — Backend Agnostic + Design System

هذه **حزمة بداية** لبناء تطبيقات ويب صغيرة وسريعة بلغة HTML عادية، مع Design System صارم وRuntime متناهٍ في البساطة. ليست نسخة من React أو Vue أو HTMX. **لا توجد اعتماديات تشغيل JavaScript.**

## ماذا يعمل؟
- صفحة HTML أولية مرسومة بواسطة الخادم (SSR)؛ لا تحتاج JavaScript لرؤية الصفحة الأولى.
- تحديث أجزاء HTML بواسطة iframe وروابط ونماذج `target="htmz"`.
- واجهة عربية RTL ومكونات CSS دلالية مبنية على 48 Design Tokens مع فحص تباين ألوان النص.
- نموذج تجريبي لإدارة المشاريع مع بحث GET وتفاصيل وتبويبات وحفظ ملاحظات POST.
- استجابات أخطاء 403/404/422 تعيد HTML صالحًا للعقد نفسه.
- CSP يمنع JavaScript وCSS المضمّنَيْن، مع حارس معرفات الأهداف، وإدارة تركيز اختيارية، وحالة تحميل `aria-live`.
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
npm run verify  # Design Tokens + 108 Browser Checks + Generator Safety
```

اقرأ `docs/ARCHITECTURE-AR.md` و`docs/DESIGN-SYSTEM-AR.md` و`docs/PRODUCTION-CHECKLIST-AR.md`.

**تحذير الإنتاج:** المثال لا يتضمن حسابات مستخدمين أو قاعدة بيانات دائمة أو TLS/Proxy أو إدارة جلسات موزعة أو نسخًا احتياطية. الجاهزية للإنتاج تخص التطبيق المتكامل وليس مجرد نجاح Runtime.