<div dir="rtl" lang="ar">

# 03 — بحث القدرات الأصلية للمتصفحات ودعمها الفعلي

> تاريخ البحث: 2026-11-05. المصادر الأساسية: بيانات Baseline من `webstatus.dev` (وهي البيانات نفسها التي تعرضها شارات MDN)، وجداول التوافق من MDN browser-compat-data، ومواصفات WHATWG وW3C، ومدونة WebKit وإعلانات Interop. كل سطر في الجداول التالية يحمل رابط مصدره.
>
> تعريفات Baseline (المصدر: <span dir="ltr">https://web.dev/baseline</span>):
> - **متاح حديثًا (Newly available):** مدعوم في كل المتصفحات الأساسية (Chrome، Edge، Firefox، Safari على سطح المكتب والجوال).
> - **متاح على نطاق واسع (Widely available):** مرّ 30 شهرًا على تاريخ «متاح حديثًا».
> - **محدود (Limited):** غير مدعوم بعد في كل المتصفحات.
>
> قاعدة هذه الوثيقة: **لا نبني النواة إلا على ما هو «متاح على نطاق واسع»**، ونسمح بما هو «متاح حديثًا» كتحسين اختياري له بديل، ونستبعد «المحدود» من أي مسار أساسي.

## 1. خط الأساس المقترح للمتصفحات

| المتصفح | الحد الأدنى المقترح | المبرر |
|---|---|---|
| Chrome / Edge | 120 (ديسمبر 2023) | يغطي CSS Nesting الكامل و`:user-invalid` و`details name` |
| Firefox | 128 ESR (يوليو 2024) | إصدار الدعم الممتد الذي تعتمده المؤسسات |
| Safari / iOS | 17.2 (ديسمبر 2023) | يغطي Popover و`details name` وContainer Queries وDeclarative Shadow DOM و`dvh` |

هذا الخط يساوي تقريبًا «كل ما أصبح Baseline قبل بداية 2024»، ويضمن أن كل ما هو «متاح على نطاق واسع» في نوفمبر 2026 يعمل فيه. حصة iOS في الجوال عالميًا نحو 27.6% (StatCounter، أكتوبر 2026، <span dir="ltr">https://gs.statcounter.com/os-market-share/mobile/worldwide</span>)، وSafari هو الأبطأ تحديثًا، لذلك إصدار Safari هو الذي يحدد خط الأساس عمليًا.

## 2. لغة HTML الأصلية

| القدرة | المشكلة التي تحلّها | يحتاج JavaScript؟ | حالة Baseline | الحكم | المصدر |
|---|---|---|---|---|---|
| `<dialog>` | حوار مشروط مع طبقة عليا وإدارة تركيز أصلية | الفتح المشروط `showModal()` يحتاج JS، أو عبر أوامر الاستدعاء | واسع (منذ 2024-09) | **استخدم بحرية** | <span dir="ltr">https://webstatus.dev/features/dialog</span> |
| `<dialog closedby>` | إغلاق بالنقر خارج الحوار دون JS | لا | محدود (لا Safari) | بديل: معالج صغير | <span dir="ltr">https://webstatus.dev/features/dialog-closedby</span> |
| `<form method="dialog">` | زر داخل الحوار يغلقه ويعيد قيمة | لا | يُشحن مع `<dialog>` | **استخدم بحرية** | MDN `dialog` |
| `<details>` / `<summary>` | إظهار/إخفاء بلا JS (أكورديون، قوائم جوال) | لا | واسع | **استخدم بحرية** | Interop 2025 |
| `<details name>` | أكورديون حصري (عنصر واحد مفتوح) | لا | حديث (2024-09) | استخدم؛ التراجع لطيف (يُفتح أكثر من عنصر) | <span dir="ltr">https://webstatus.dev/features/details-name</span> |
| Popover API (`popover`, `popovertarget`) | قوائم وتلميحات في الطبقة العليا بإغلاق خفيف، بلا z-index | لا | حديث (2025-01؛ Safari 17) | **استخدم** للقوائم غير المشروطة | <span dir="ltr">https://webstatus.dev/features/popover</span> |
| `popover="hint"` | تلميحات لا تغلق القوائم الأخرى | لا | محدود | تجنّب في النواة | <span dir="ltr">https://webstatus.dev/features/popover-hint</span> |
| أوامر الاستدعاء `command` / `commandfor` | أزرار تفتح/تغلق الحوارات والقوائم تصريحيًا | لا | حديث جدًا (2025-12؛ Safari 26.2) | تحسين فقط مع بديل JS صغير | <span dir="ltr">https://webstatus.dev/features/invoker-commands</span> |
| `<template>` | قطع DOM خاملة قابلة للاستنساخ | الاستنساخ يحتاج JS | واسع | استخدم عند الحاجة | <span dir="ltr">https://webstatus.dev/features/template</span> |
| Declarative Shadow DOM | جذور ظل مُولَّدة من الخادم | لا | واسع (2026-08) | متاح لكن **غير ضروري** لهذا المنتج (انظر 05) | <span dir="ltr">https://webstatus.dev/features/declarative-shadow-dom</span> |
| التحقق الأصلي من النماذج | `required`, `pattern`, `type`, `min/max`… | لا (الرسائل المخصصة تحتاج JS) | واسع | **استخدم** مع إعادة التحقق في الخادم دائمًا | <span dir="ltr">https://webstatus.dev/features/constraint-validation</span> |
| `:user-valid` / `:user-invalid` | إظهار الأخطاء بعد تفاعل المستخدم فقط | لا | واسع (2026-05) | **استخدم بحرية** | <span dir="ltr">https://webstatus.dev/features/user-pseudos</span> |
| `<input type=date/time>` | منتقيات تاريخ ووقت أصلية | لا | واسع (2024-04) | استخدم مع قبول اختلاف الشكل بين المتصفحات | <span dir="ltr">https://webstatus.dev/features/input-date-time</span> |
| `<datalist>` | اقتراحات إكمال | لا | محدود | استخدم كتحسين فقط | <span dir="ltr">https://webstatus.dev/features/datalist</span> |
| `<select>` القابل للتنسيق (`appearance: base-select`) | قوائم منسدلة بتصميم كامل | لا | محدود (Safari 27 فقط) | تحسين تدريجي؛ التراجع إلى `select` العادي | <span dir="ltr">https://webstatus.dev/features/customizable-select</span> |
| `<search>` | معلم (landmark) للبحث | لا | واسع (2026-04) | **استخدم** | <span dir="ltr">https://webstatus.dev/features/search</span> |
| `formaction` / `formmethod` | أزرار متعددة في نموذج واحد بأفعال مختلفة | لا | قديم وواسع | **استخدم بحرية** | MDN `button` |
| `inert` | تعطيل شجرة فرعية وإخفاؤها عن القارئات | لا | واسع (2025-10) | **استخدم** للأدراج والخلفيات | <span dir="ltr">https://webstatus.dev/features/inert</span> |
| `loading="lazy"` | تحميل كسول للصور والإطارات | لا | واسع | استخدم (ليس لصورة LCP) | <span dir="ltr">https://webstatus.dev/features/loading-lazy</span> |
| `<iframe sandbox>` | تقييد المحتوى المضمّن | لا | واسع | لا علاقة له بالنواة بعد التخلي عن الإطار | MDN `iframe` |
| Speculation Rules | تحميل مسبق/تصيير مسبق للصفحات | لا | محدود (Chromium فقط فعليًا) | تحسين آمن وغير ضروري | <span dir="ltr">https://webstatus.dev/features/speculation-rules</span> |

### 2.1 سلوك الإطار (iframe) الذي يهم قرار htmz

- **سجل التصفح:** توثيق MDN صريح: «تصفحات كل سياق مضمّن تُسلسَل في سجل جلسة السياق الأعلى». أي أن كل تحميل داخل الإطار يضيف مدخل رجوع للتبويب كله. المصدر: <span dir="ltr">https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe</span>
- **لا حدث خطأ:** MDN: «حدث `load` يُطلق دائمًا حتى لو فشل تحميل محتوى الإطار» ولا يُطلق `error`. أي أن معالج `onload` في htmz لا يستطيع التمييز بين النجاح والفشل.
- **طلب التعديل القياسي ما زال مفتوحًا:** `whatwg/html#6501` «نمط جديد للإطارات لا يضيف إلى سجل الجلسة المشترك» (فُتح 2021-03) لم يُنفَّذ، وChrome وجد السجلات المستقلة للإطارات غير عملية. المصدر: <span dir="ltr">https://github.com/whatwg/html/issues/6501</span>
- **الخلاصة:** قيود الإطار ليست مشكلة تنفيذ يمكن إصلاحها بسكربت أذكى، بل سلوك قياسي لا توجد خطة لتغييره.

## 3. أنماط CSS الحديثة

| القدرة | المشكلة التي تحلّها | Baseline | Chrome / Firefox / Safari | الحكم | المصدر |
|---|---|---|---|---|---|
| Custom Properties | رموز التصميم (Tokens) والثيمات | واسع (2017) | 49 / 31 / 9.1 | **أساس النظام** | <span dir="ltr">https://webstatus.dev/features/custom-properties</span> |
| `@property` | رموز بأنواع وقيم افتراضية وقابلة للتحريك | حديث (2024-07) | 85 / 128 / 16.4 | استخدم عند الحاجة | <span dir="ltr">https://webstatus.dev/features/registered-custom-properties</span> |
| Cascade Layers `@layer` | ترتيب صريح للتخصيص يمنع حروب الخصوصية | واسع (2024-09) | 99 / 97 / 15.4 | **أساس النظام** | <span dir="ltr">https://webstatus.dev/features/cascade-layers</span> |
| Container Queries (الحجم) | مكوّنات تستجيب لحاويتها لا للشاشة | واسع (2025-08) | 105 / 110 / 16 | **أساس الاستجابة** | <span dir="ltr">https://webstatus.dev/features/container-queries</span> |
| وحدات الحاوية `cqi` / `cqb` | أحجام نسبية للحاوية | مع الاستعلامات | 105 / 110 / 16 | استخدم | MDN `length` |
| Container Style Queries | استعلام قيم الرموز | حديث (2026-05) | 111 / 151 / 18 | تحسين فقط | <span dir="ltr">https://webstatus.dev/features/container-style-queries</span> |
| Subgrid | محاذاة الشبكات المتداخلة (بطاقات، جداول) | واسع (2026-03) | 117 / 71 / 16 | استخدم | <span dir="ltr">https://webstatus.dev/features/subgrid</span> |
| الخصائص المنطقية (`margin-inline`, `inset-inline-start`, `text-align: start`) | RTL/LTR بلا تكرار | واسع (2024-03) | 89 / 66 / 15 | **إلزامي** (يُفرض بالفاحص) | <span dir="ltr">https://webstatus.dev/features/logical-properties</span> |
| `:has()` | تنسيق الأب حسب الأبناء (حقل فيه خطأ، صف محدد) | واسع (2026-06) | 105 / 121 / 15.4 | استخدم باعتدال | <span dir="ltr">https://webstatus.dev/features/has</span> |
| `:is()` / `:where()` | تجميع المحددات بخصوصية صفرية | واسع (2023-07) | 88 / 82 / 14 | **استخدم** | <span dir="ltr">https://webstatus.dev/features/is</span> |
| CSS Nesting (الصيغة المرنة) | تداخل بلا معالج مسبق | واسع (2026-06) | 120 / 117 / 17.2 | استخدم؛ **هذا يلغي الحاجة إلى Sass** | <span dir="ltr">https://webstatus.dev/features/nesting</span> |
| `@scope` | نطاق للأنماط | حديث (2026-03) | 143 / 146 / 26.4 | تجنّب في النواة؛ الطبقات والبادئات تكفي | <span dir="ltr">https://webstatus.dev/features/scope</span> |
| Anchor Positioning | ربط القوائم والتلميحات بعنصر بلا JS | محدود (اختلافات بين الإصدارات) | 125 / 147 / 26 (كامل: 151 / 151 / 27) | تحسين فقط | <span dir="ltr">https://webstatus.dev/features/anchor-positioning</span> |
| View Transitions (نفس المستند) | تحريك تغييرات DOM | حديث (2025-10) | 111 / 144 / 18 | تحسين؛ البديل «لا تحريك» | <span dir="ltr">https://webstatus.dev/features/view-transitions</span> |
| `@view-transition` (بين المستندات) | تحريك التنقل بين الصفحات الكاملة | محدود (لا Firefox) | 126 / — / 18.2 | تحسين خالص بلا كلفة | <span dir="ltr">https://webstatus.dev/features/cross-document-view-transitions</span> |
| Scroll-driven Animations | تحريك مرتبط بالتمرير | حديث (2026-10) | 115 / 159 / 26 | غير ضروري | <span dir="ltr">https://webstatus.dev/features/scroll-driven-animations</span> |
| `color-mix()` | اشتقاق الألوان من الرموز | واسع (2025-11) | 111 / 113 / 16.2 | **استخدم** | <span dir="ltr">https://webstatus.dev/features/color-mix</span> |
| `oklch()` | ألوان إدراكية متسقة | واسع (2025-11) | 111 / 113 / 15.4 | استخدم للوحة الألوان | <span dir="ltr">https://webstatus.dev/features/oklab</span> |
| `light-dark()` | لون واحد للوضعين | حديث (2024-05، واسع في 2026-11) | 123 / 120 / 17.5 | استخدم للوضع الداكن الاختياري | <span dir="ltr">https://webstatus.dev/features/light-dark</span> |
| `color-scheme` | ضوابط أصلية فاتحة/داكنة | واسع | 98 / 96 / 13 | **استخدم** | <span dir="ltr">https://webstatus.dev/features/color-scheme</span> |
| `prefers-reduced-motion` | احترام تفضيل تقليل الحركة | واسع | 74 / 63 / 10.1 | **إلزامي** | <span dir="ltr">https://webstatus.dev/features/prefers-reduced-motion</span> |
| `clamp()` | طباعة سائلة | واسع | 79 / 75 / 13.1 | استخدم مع `rem` لا `vw` فقط (WCAG 1.4.4) | <span dir="ltr">https://webstatus.dev/features/min-max-clamp</span> |
| `text-wrap: balance` | عناوين متوازنة | حديث (2024-05) | 114 / 121 / 17.5 | استخدم؛ يُتجاهل بأمان | <span dir="ltr">https://webstatus.dev/features/text-wrap-balance</span> |
| `field-sizing: content` | حقول تنمو مع المحتوى | حديث (2026-06) | 123 / 152 / 26.2 | تحسين | <span dir="ltr">https://webstatus.dev/features/field-sizing</span> |
| `dvh` / `svh` | ارتفاع الشاشة الحقيقي في الجوال | واسع (2025-06) | 108 / 101 / 15.4 | **استخدم** (يحل مشكلة `100vh` في iOS) | <span dir="ltr">https://webstatus.dev/features/viewport-unit-variants</span> |
| `env(safe-area-inset-*)` | هوامش الشق (notch) ومؤشر الصفحة الرئيسية | واسع | 69 / 65 / 11.1 | **استخدم** مع `viewport-fit=cover` | <span dir="ltr">https://webstatus.dev/features/safe-area-inset</span> |
| `:focus-visible` | حلقة تركيز للوحة المفاتيح فقط | واسع | 86 / 85 / 15.4 | **إلزامي** | <span dir="ltr">https://webstatus.dev/features/focus-visible</span> |
| `overscroll-behavior: contain` | منع تسلسل التمرير في الأدراج | القيم الأساسية واسعة | 63 / 59 / 16 | استخدم | <span dir="ltr">https://webstatus.dev/features/overscroll-behavior</span> |
| `@starting-style` + `transition-behavior: allow-discrete` | تحريك ظهور الحوارات والقوائم من `display:none` | حديث (2024-08) | 117 / 129 / 17.5 | استخدم؛ يُتجاهل بأمان | <span dir="ltr">https://webstatus.dev/features/starting-style</span> |
| `interpolate-size` / `calc-size()` | تحريك إلى `height: auto` | محدود (Chrome فقط) | 129 / — / — | تجنّب | <span dir="ltr">https://webstatus.dev/features/interpolate-size</span> |
| `content-visibility` | تخطي تصيير المحتوى خارج الشاشة | حديث (2025-09) | 108 / 130 / 26 | تحسين للقوائم الطويلة | <span dir="ltr">https://webstatus.dev/features/content-visibility</span> |
| `:dir()` | تنسيق حسب الاتجاه (عكس الأيقونات) | واسع (2026-06) | 120 / 49 / 16.4 | **استخدم** | <span dir="ltr">https://webstatus.dev/features/dir-pseudo</span> |
| `accent-color` | تلوين الضوابط الأصلية | محدود (تباين غير مضمون) | 93 / 92 / 26.2 | استخدم؛ يُتجاهل بأمان | <span dir="ltr">https://webstatus.dev/features/accent-color</span> |

**الاستنتاج الأهم:** كل ما يحتاجه نظام تصميم حديث (رموز، طبقات، استعلامات حاوية، تداخل، خصائص منطقية، `:has`، ألوان حديثة، تقليل الحركة، وحدات الجوال) أصبح «متاحًا على نطاق واسع». **لا حاجة إلى Sass ولا PostCSS ولا Tailwind ولا أي خطوة بناء لكتابة CSS احترافية في 2026.**

## 4. واجهات JavaScript والمتصفح

| الواجهة | المشكلة | Baseline | Chrome / Firefox / Safari | الحكم | المصدر |
|---|---|---|---|---|---|
| Fetch | طلبات HTTP بوعود | واسع | 42 / 39 / 10.1 | **أساس طبقة التحسين** (لا يرفض عند 4xx/5xx؛ افحص `response.ok`) | <span dir="ltr">https://webstatus.dev/features/fetch</span> |
| `AbortSignal.timeout()` | مهلة للطلب | واسع (2026-10) | 124 / 100 / 16 | **استخدم** | <span dir="ltr">https://webstatus.dev/features/abortsignal-timeout</span> |
| `AbortSignal.any()` | دمج إشارات الإلغاء | واسع (2026-09) | 116 / 124 / 17.4 | استخدم | <span dir="ltr">https://webstatus.dev/features/abortsignal-any</span> |
| `new FormData(form, submitter)` | تسلسل النموذج مع الزر الضاغط | 2023 في الثلاثة | 112 / 111 / 16.4 | **استخدم** (يحفظ `formaction` والأزرار المتعددة) | MDN `FormData` |
| History API | `pushState` / `popstate` | واسع | 5 / 4 / 5 | **أساس التنقل المُحسَّن** | <span dir="ltr">https://webstatus.dev/features/history</span> |
| Navigation API | اعتراض التنقل مركزيًا | حديث (2026-01؛ Safari 26.2) | 102 / 147 / 26.2 | تجنّب في النواة الآن؛ أعد التقييم في 2028 | <span dir="ltr">https://webstatus.dev/features/navigation</span> |
| `document.startViewTransition` | تحريك الاستبدال | حديث (2025-10) | 111 / 144 / 18 | تحسين مع كشف الميزة | <span dir="ltr">https://webstatus.dev/features/view-transitions</span> |
| Custom Elements (مستقلة) | مكوّنات قابلة لإعادة الاستخدام | واسع (2020) | 54 / 63 / 10.1 | اختياري للسلوكيات فقط | <span dir="ltr">https://webstatus.dev/features/autonomous-custom-elements</span> |
| Customized built-ins (`is=`) | توسيع العناصر الأصلية | محدود (لا Safari) | 67 / 63 / — | **تجنّب** | <span dir="ltr">https://webstatus.dev/features/customized-built-in-elements</span> |
| Form-associated custom elements | ضوابط نماذج مخصصة | واسع (2025-09) | 77 / 98 / 16.4 | اختياري | <span dir="ltr">https://webstatus.dev/features/form-associated-custom-elements</span> |
| IntersectionObserver | كشف الظهور (تحميل المزيد) | واسع | 58 / 55 / 12.1 | استخدم عند الحاجة | <span dir="ltr">https://webstatus.dev/features/intersection-observer</span> |
| ResizeObserver | تغيّر حجم عنصر | واسع | 64 / 69 / 13.1 | نادرًا ما يلزم مع Container Queries | <span dir="ltr">https://webstatus.dev/features/resize-observer</span> |
| `form.requestSubmit()` | إرسال مع التحقق وإطلاق الأحداث | 2022 في الثلاثة | 76 / 75 / 16 | استخدم | MDN `requestSubmit` |
| DOMParser | تحليل HTML دون تنفيذ السكربتات | واسع | 31 / 12 / 9.1 | **أساس الاستبدال الآمن** | <span dir="ltr">https://webstatus.dev/features/domparser</span> |
| `setHTMLUnsafe()` / `parseHTMLUnsafe()` | تحليل مع Declarative Shadow DOM | حديث (2025-09) | 124 / 123 / 26 | غير ضروري | <span dir="ltr">https://webstatus.dev/features/parse-html-unsafe</span> |
| Sanitizer API | إدراج HTML آمن | محدود (لا Safari) | 146 / 148 / — | **تجنّب**؛ التعقيم في الخادم | <span dir="ltr">https://webstatus.dev/features/sanitizer</span> |
| Trusted Types | قفل مصارف XSS | حديث (2026-02) | 83 / 148 / 26 | اختياري عبر CSP؛ آمن للنشر | <span dir="ltr">https://webstatus.dev/features/trusted-types</span> |
| `CSS.supports()` / `@supports` | كشف الميزات | واسع | 28 / 22 / 9 | استخدم | <span dir="ltr">https://webstatus.dev/features/supports</span> |
| ES Modules + Import Maps | وحدات بلا مُجمِّع | واسع (2025-09) | 89 / 108 / 16.4 | استخدم إن لزم تقسيم الملفات | <span dir="ltr">https://webstatus.dev/features/import-maps</span> |
| `scheduler.yield()` | تحسين INP | غير Baseline (لا Safari) | 129 / 142 / — | غير ضروري | MDN `Scheduler.yield` |
| BroadcastChannel / Web Locks | تنسيق بين التبويبات | واسع | — | غير ضروري للمنتج | webstatus |

## 5. الإجابة عن الأسئلة الثمانية لكل قدرة (ملخص)

| السؤال | الإجابة العامة |
|---|---|
| ما المشكلة؟ | معظم تفاعلات تطبيقات الأعمال (حوارات، قوائم، أكورديون، تحقق، تبويبات، تخطيط متجاوب) لها حل أصلي الآن |
| هل هي ضرورية؟ | الضروري: Forms، Dialog، Details، Popover، Layers، Container Queries، Logical Properties، Fetch، History، DOMParser. الباقي اختياري |
| هل يحلّها HTML/CSS وحدهما؟ | نعم لكل ما سبق عدا: **التحديث الجزئي للصفحة** (يحتاج إما iframe بقيوده أو JS)، والتحريك المشروط، والإكمال التلقائي الغني |
| هل تحتاج JavaScript؟ | التحديث الجزئي، `showModal()` إلى أن ينتشر `commandfor`، وإدارة التركيز بعد الاستبدال |
| هل الدعم كافٍ؟ | نعم لكل ما صُنّف «واسع». «الحديث» يُستخدم بتراجع لطيف فقط |
| كلفة الصيانة؟ | منخفضة للقدرات الأصلية؛ تنخفض مع الوقت لا ترتفع (عكس المكتبات) |
| هل يمكن جعلها اختيارية؟ | نعم: المبدأ هو «HTML يعمل، CSS يجمّل، JS يحسّن» |
| مخاوف الوصول والأمان؟ | `dialog` و`popover` و`details` تحمل دلالات وصول صحيحة بذاتها. الأمان يبقى مسؤولية الخادم (ترميز الإخراج + CSP) في كل الأحوال |

## 6. ما يغيّره هذا البحث في قرار المعمارية

1. **التحديث الجزئي للصفحة هو الحاجة الوحيدة التي لا يحلّها HTML وحده**، ولها حلان فقط: الإطار (htmz) أو Fetch + استبدال DOM. البحث يبيّن أن قيود الإطار قياسية وغير قابلة للإصلاح، بينما كل مكوّنات حل Fetch (Fetch، AbortSignal.timeout، FormData مع submitter، DOMParser، History، startViewTransition كاختيار) «متاحة على نطاق واسع».
2. **نظام التصميم لا يحتاج أي أداة بناء**: Nesting وLayers وContainer Queries وColor Functions كلها أصلية.
3. **المكوّنات التفاعلية الشائعة لا تحتاج مكتبة**: `dialog` + `popover` + `details` + التحقق الأصلي تغطي معظم احتياجات تطبيق أعمال.
4. **Web Components ليست ضرورية** لإعادة الاستخدام في معمارية مولَّدة من الخادم؛ تبقى خيارًا للسلوكيات القليلة التي تحتاج JS حقًا.
5. **Navigation API وSanitizer API وAnchor Positioning** واعدة لكنها غير جاهزة لتكون في النواة؛ يُعاد تقييمها سنويًا.

## 7. عرض Markdown على GitHub (للوثائق العربية)

اختبار عملي عبر واجهة GitHub الرسمية لتصيير Markdown (`POST /markdown` بنمط `gfm`) بتاريخ 2026-11-05، ثم تحقق بصري من الفرع المنشور:

| المدخل | النتيجة |
|---|---|
| `<div dir="rtl" lang="ar">` حول Markdown مع أسطر فارغة | **يُحفظ** وتُصيَّر Markdown داخله |
| `<span dir="ltr">` | **يُحفظ** |
| `<p dir="rtl">`, `<table dir="rtl">`, `<td dir="ltr">` | **تُحفظ** |
| `<bdi>` و`<bdo>` | **تُحذف الوسوم** ويبقى النص |
| `style` و`class` | تُحذف |
| `id` | يُعاد كتابته بسابقة `user-content-` |

القرار المطبّق في هذه الوثائق: التفاف كل وثيقة في `<div dir="rtl" lang="ar">` مع أسطر فارغة، وعزل المصطلحات اللاتينية الطويلة بـ `<span dir="ltr">`، وإخراج كتل الكود خارج الـ `div` ليبقى اتجاهها LTR طبيعيًا. ملاحظة مُتحقَّق منها بصريًا: GitHub يغلّف كل عنوان بـ `dir="auto"`، فالعنوان الذي يبدأ بكلمة لاتينية يُحاذى يسارًا رغم الـ `div`؛ لذلك تبدأ كل العناوين هنا بكلمة عربية. المصادر: <span dir="ltr">https://github.com/github/markup</span>، <span dir="ltr">https://talk.commonmark.org/t/rtl-languages-support/203</span>.

</div>
