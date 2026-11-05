# المعمارية — HTML أولًا، Backend قابل للاستبدال

> **تنبيه (المرحلة 1):** عقد الإطار المخفي الموصوف أدناه **استُبدل** بموجب ADR-001 بعقد «صفحات كاملة + طبقة Fetch اختيارية». العقد الساري هو `docs/CONTRACT-AR.md`. تبقى هذه الوثيقة سجلًا تاريخيًا لأسباب القرار ولم تعد تصف الكود.

## لماذا لا نضيف Framework؟
htmz يقوم على أن المتصفح أصلًا يفهم الروابط والنماذج وتحميل وثائق HTML. إضافة SPA Router أو virtual DOM أو client-state manager تذهب في عكس هذا المبدأ. بدلًا منها نستخدم **عقد HTML fragments** صريحًا.

## العقد
1. صفحة `GET /` تعيد HTML صالحًا مستقلًا يتضمن `<iframe name="htmz" hidden>` وملف `runtime.js` الخارجي.
2. الروابط `<a href="/project?id=P-101#project-panel" target="htmz">...` والنماذج `<form action="/notes#project-panel" method="post" target="htmz">...` تستخدم بروتوكول HTTP العادي.
3. يستقبل الخادم GET/POST **بدون إرسال fragment** (`#project-panel` لا يصل إلى الخادم).
4. يعيد الخادم جزء HTML له عنصر جذري واحد **معرّف `id` مطابق بالضبط** للجزء الموجود في URL. مثال:
   ```html
   <section id="project-panel" class="ds-card"><h2>تفاصيل المشروع</h2></section>
   ```
5. Runtime صغير، من ملف JS خارجي وليس inline، يقرأ موقع iframe، يتحقق من Same-Origin وID مقبول، ثم يستبدل العنصر باستخدام `replaceWith`. لا يستهلك JSON API ولا يحتاج template compiler.
6. يجب أن يعيد الخادم أخطاء التحقق والصلاحيات بنفس هيئة العنصر المطلوب مع `data-result="error"`؛ Runtime لا يستطيع قراءة HTTP status من iframe.
7. يُظهر التطبيق تقدم التحميل وإشعارات قارئ الشاشة. يمكن أن تضع المنطقة `data-focus-on-swap` وعنوانًا `data-focus tabindex="-1"` لنقل التركيز بعد الاستبدال.

## قيود موثقة
- هذا العقد **أضيق** من htmz الأصلي: يدعم `#id` فقط وليس أي CSS selector؛ هذا مقصود لخفض الغموض، ولا يعني أنه بديل مطابق 100% لكل امتدادات htmz.
- HTML المرسل في iframe **محتوى نشط** قبل استبداله؛ لا تعرض HTML غير موثوق. عالج XSS على الخادم، واضبط CSP وتحقق من الصلاحيات.
- عدم تغير عنوان الصفحة العليا تلقائيًا لا يصلح لتطبيق يعتمد على deep-linking أو سجل متصفح متقدم دون طبقة اختيارية مستقلة.
- iframe قد لا يكون مناسبًا لبعض التدفقات (ملفات كبيرة، رفع متعدد الخطوات، API ثنائي الاتجاه، realtime). لا تحاول إجبار كل تطبيق عليه.
- `runtime.js` ليس sanitizer ولا CSRF middleware ولا نظام مصادقة.

## استبدال Backend
التطبيقان `backends/node/server.mjs` و`backends/python/server.py` يخدمان **نفس ملفات الواجهة**: `public/index.html`، `public/runtime.js`، `public/design.css`، `projects.json`. مسارات العقد: `/`, `/projects`, `/project`, `/tab`, `/notes`.

يمكن استخدام Frappe أو Django أو Flask أو Laravel أو Go بدل التنفيذين بشرط احترام الروابط والأهداف والترميز واستجابات الخطأ. هذه قابلية على مستوى البروتوكول مثبتة بتجربتين؛ **ليست Connector جاهزًا** لكل إطار.

## الفصل بين الطبقات
- Minimal Core upstream موجود في جذر الـFork دون تعديل؛ وله نسخ safe منفصلة.
- `starter/public/runtime.js` هو **Adapter اختياري** لبيئة CSP وعقد الإنتاج المقترح.
- CSS Design System مستقل تمامًا عن اسم الـBackend.
- خادما Node/Python مجرد مراجع تشغيلية، لا يستوردهما Runtime.
