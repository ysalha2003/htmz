# مختبر تطوير htmz

هذا Fork من https://github.com/Kalabasa/htmz، هدفه إضافة حراسة صغيرة لأخطاء المتصفح مع الإبقاء على htmz الأصلي كما هو.

## ابدأ
    npm ci
    npm run demo

ثم http://127.0.0.1:4177/demo

لتشغيل جميع اختبارات المتصفح على Windows، جهّز Firefox وWebKit ثم نفّذ:

    $env:PLAYWRIGHT_BROWSERS_PATH='C:\projects\htmz-lab\browsers'
    npx.cmd playwright install firefox webkit
    npm test
    node tests/demo.mjs

## الملفات المهمة
- htmz.html وhtmz.dev.html: الأصل (لا تعديل).
- htmz.safe.html: النواة المحسنة (221 بايت).
- htmz.safe.dev.html: نسخة مقروءة من الحراسة.
- tools/server.mjs: خادم Node داخلي يعرض التطبيق وFixtures.
- optional/feedback.js: مؤشر تحميل اختياري.
- reports/: ثمانية تقارير باللغة العربية.
- evidence/: نتائج اختبارات المتصفح والحجم والأداء وتجارب الأمان.

اقرأ reports/01-EXECUTIVE-SUMMARY-AR.md للقرار، وreports/07-DEVELOPMENT-GUIDE-AR.md للتشغيل الكامل، وreports/05-SECURITY-REVIEW-AR.md لحدود الثقة والأمان.

## HTMZ Kit — تطوير جديد Backend Agnostic
المجلد starter/ يحتوي تطبيقًا أوليًا بواجهات HTML موحدة وDesign System صارم وBackend Node.js أو Python، ومولّدًا لإنشاء تطبيق مستقل. ابدأ من starter/README.md، ثم اقرأ starter/docs/RELEASE-REVIEW-AR.md. لا تخلط بين نواة htmz الأصلية وتجربة Starter Kit الأعلى منها.

**تنبيه:** اجتياز الاختبارات لا يعني أن htmz آمن لمعالجة HTML غير موثوق أو متوافق مع كل إعدادات CSP أو جاهز للنشر الإنتاجي دون مراجعة التطبيق.
