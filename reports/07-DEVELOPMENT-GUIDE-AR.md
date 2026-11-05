# دليل التشغيل والتطوير على Windows

## المواقع
- المختبر: C:\projects\htmz-lab
- المرجع الأصلي غير المعدّل: C:\projects\htmz-lab\upstream
- نسخة التطوير: C:\projects\htmz-lab\fork
- التقارير: C:\projects\htmz-lab\fork\reports
- الأدلة: C:\projects\htmz-lab\fork\evidence
- النسختان: htmz.html (الأصل)، htmz.safe.html (المحسّن)
- الفرع: feat/htmz-engineering-improvements

## المتطلبات
Git وNode.js وnpm وChrome؛ Playwright 1.62.1 للاختبار فقط. تم تثبيت Firefox وWebKit في مجلد محلي مستقل داخل المختبر.

## خطوات PowerShell
    cd C:\projects\htmz-lab\fork
    npm ci
    $env:PLAYWRIGHT_BROWSERS_PATH='C:\projects\htmz-lab\browsers'
    npx.cmd playwright install firefox webkit
    npm.cmd run baseline
    npm.cmd test
    node tests/demo.mjs
    node tests/probes.mjs
    node tests/history.mjs
    npm.cmd run benchmark

توقع أن يعيد baseline رمز خروج 1: هذا دليل على إخفاقات الأصل الموثقة وليس فشل تجهيز. لتشغيل فحص Chrome فقط:

    npm.cmd test -- --browsers=chromium

## بدء التطبيق المحلي
    cd C:\projects\htmz-lab\fork
    npm.cmd run demo

افتح في المتصفح:
- http://127.0.0.1:4177/demo
- http://127.0.0.1:4177/demo?variant=original
- http://127.0.0.1:4177/demo?variant=safe

توقّف عن الخادم بالضغط على Ctrl+C في نفس نافذة PowerShell. لا يلزم Docker ولا قاعدة بيانات؛ ملاحظات المشاريع اصطناعية ومخزنة مؤقتًا في ذاكرة الخادم وتُعاد عند إعادة التشغيل.

## تعديل المصدر
حافظ على htmz.html وhtmz.dev.html كمرجع ثابت. عدّل htmz.safe.html وhtmz.safe.dev.html معًا عند تغيير المنطق، ثم أضف اختبارًا يثبت السيناريو وشغّل npm test. لا تدمج في master ولا تفتح PR للمشروع الأصلي دون موافقة مستقلة.

## أدلة الأخطاء
انظر أدلة JSON في evidence؛ ملفات PNG تجسد جلسة حقيقية من Playwright. اختبر خادمك عبر localhost فقط، ولا تضع بيانات حقيقية أو HTML غير موثوق.
