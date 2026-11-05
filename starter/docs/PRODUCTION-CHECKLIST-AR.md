# بوابة النشر الإنتاجي — لا تخلط بين Starter وProduction App

## المنجز فعليًا
- Frontend مستقل عن لغة Backend بعقد HTML ثابت، بدون bundler أو Framework.
- CSP افتراضي يمنع `unsafe-inline`، مع `script-src 'self'`.
- ترميز HTML المشتق من المستخدم بواسطة الخادمين، ورفض طلبات POST بلا CSRF صالح؛ ورفض الأصول الأجنبية الصريحة وSec-Fetch-Site غير المسموح. **بعض المتصفحات ترسل Origin: null عند POST من نموذج نُقل من iframe**؛ لذلك لا يعتمد الأمان على Origin وحده إطلاقًا، بل على رمز CSRF مرتبط بالجلسة والتحقق من metadata عند توفرها.
- `HttpOnly; SameSite=Lax` للجلسة؛ `Secure` عند ضبط `PUBLIC_ORIGIN=https://...`.
- عدم وجود ملفات أو روابط لأصول CDN خارجية.
- إرجاع HTTP 422/403/404 عبر HTML fragments ذات معرّفات واضحة.
- Design Token lint وفحوص browsers حقيقية، مع توثيق الحدود.

## المطلوب قبل الإنتاج (Blocking)
1. **مصادقة وصلاحيات:** مستخدمون فعليون وRBAC لكل مشروع، واختبارات IDOR والطلبات غير المصرح بها. حاليًا الجلسة مؤقتة للجميع.
2. **بيانات دائمة:** SQLite للمشاريع الفردية أو PostgreSQL/MariaDB عند الحاجة، مع migrations وbackup/restore وconcurrent writes. بيانات المثال في الذاكرة وتزول بعد إعادة التشغيل.
3. **Session Store:** تخزين جلسات دائم ودوران/انتهاء وإبطال جلسات وتسجيل خروج؛ لا تستخدم Map/dict ضمن ذاكرة العملية لإنتاج متعدد العمال.
4. **HTTPS وReverse Proxy:** إعداد TLS وشهادة، `PUBLIC_ORIGIN=https://yourdomain`، cookies Secure، حماية DDoS/rate limiting، headers وفق التهديد.
5. **CSP والتقارير:** راجع CSP لكل صفحات المحتوى والأصول، وأضف reporting/monitoring، ولا تستخدم `unsafe-inline` للحل السريع.
6. **أمن الخادم:** CSRF وOrigin مع كل endpoint مغير للحالة، output encoding لكل حقل، حجم request، validation، security logs دون بيانات سرية، وحماية رفع الملفات إن وجد.
7. **QA شامل:** WCAG 2.2 يدوي/آلي، اختلافات Firefox/WebKit، إدارة back/forward، انقطاع الشبكة، redirect، تحميل ملفات، أداء على هاتف ضعيف.
8. **العمليات:** اختبارات CI، observability، health endpoint، إيقاف graceful، سجل الأخطاء، النسخ الاحتياطية، restore rehearsal، خطة rollback، version pinning.
9. **تقييم الفكرة:** إذا أصبح التطبيق متطلبًا فيه realtime أو offline أو interactivity عالية، أعِد تقييم htmz بدل إضافة نظام تعقيد تدريجي.

## إعداد Public Origin
يمكن تشغيل المحول Node/Python محليًا دون إعداد. خلف Reverse Proxy اضبط `PUBLIC_ORIGIN=https://app.example.com` ليقارن Origin المرسل بنطاق عام موثوق، ويفعّل Secure في Cookie. لا تعتمد على `X-Forwarded-*` غير الموثوقة. هذا الإعداد لا ينفذ TLS ولا يصنع نظام مصادقة بذاته.

## نتيجة الاعتماد
PASS كأساس Prototype/Starter وBackend contract، و**NOT YET PRODUCTION-READY** كتطبيق عام متعدد المستخدمين أو مالي/حساس دون تنفيذ البنود أعلاه.
