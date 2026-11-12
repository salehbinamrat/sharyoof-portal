# بوابة شريوف — Sharyoof Portal

موقع عربي متجاوب للبرامج وصفحات الهوتسبوت والفيديوهات مع لوحة إدارة آمنة. مشروع مستقل تماما عن مستودعات تطبيقات ويندوز.

## البنية
- `public/` الواجهة العامة ولوحة الإدارة على الهاتف والكمبيوتر.
- `src/worker.js` واجهات API الآمنة وجلسات الإدارة.
- `migrations/` جداول Cloudflare D1.
- `.github/workflows/ci.yml` مسارا فحص متوازيان، ثم نشر بعد نجاح الاثنين.

## Cloudflare: الإعداد الأولي (ضروري قبل النشر)
1. افتح حسابك في Cloudflare، وأنشئ قاعدة بيانات D1 باسم `sharyoof-portal-db`.
2. انسخ معرف قاعدة البيانات إلى `wrangler.toml` بدلا من القيمة الصفرية.
3. نفذ `npm install`، ثم `npx wrangler d1 migrations apply sharyoof-portal-db --remote`.
4. أنشئ كلمة مرور مسؤول قوية، واستخدم `npm run admin:hash` لتوليد قيمة PBKDF2. لا تضع كلمة المرور أو التجزئة في GitHub.
5. أضف أسرار Worker: `ADMIN_PASSWORD_HASH` من الخطوة السابقة و`SESSION_SECRET` (نص عشوائي طويل) باستخدام `npx wrangler secret put SECRET_NAME`.
6. للنشر الآلي: أضف `CLOUDFLARE_ACCOUNT_ID` و`CLOUDFLARE_API_TOKEN` إلى GitHub Actions Secrets. الرمز يحتاج صلاحيات Workers Scripts Edit وD1 Edit المناسبة فقط.
7. نفذ `npm run deploy` أو ارفع التغيير إلى main بعد نجاح المسارين.
8. خيار رفع الصور من لوحة الإدارة يتطلب السر `GH_TOKEN` بتصريح Contents:write لمستودع هذا الموقع وحده. بدون الرمز تعمل روابط الصور الخارجية وتظل خاصية الرفع معطلة بوضوح.

## إدارة الملفات
- رفع الصور المباشر عبر اللوحة متاح حتى 700KB للصورة ويرفعها إلى مجلد `public/media` في المستودع.
- ملفات EXE وZIP الكبيرة: ارفعها إلى GitHub Releases ثم ألصق رابط HTTPS في حقول روابط التنزيل داخل لوحة الإدارة. رفع البرامج الكبيرة مباشرة من الواجهة غير مدعوم في هذه النسخة ولا يوهمك الموقع بعكس ذلك.
- فيديوهات YouTube تُضاف عبر الرابط.
- لا تُدرج بيانات خاصة أو أسرار أو أكواد ترخيص داخل الملفات العامة.

## التطوير والاختبار
```
npm install
npm run check
npm test
npx wrangler dev
```

## حدود النسخة
هذه نسخة أولية جاهزة للمصدر والاختبار؛ يحتاج تشغيلها على الإنترنت إلى ربط حساب Cloudflare وD1 والأسرار. جميع أقسام المحتوى فارغة حتى ينشر المدير عناصر حقيقية. لوحة التحكم `/#admin` تتطلب اعتماداً من الخادم، ولا يوجد اسم مستخدم/كلمة مرور افتراضيان.

## تشخيص دخول الإدارة والنشر

- عند إعادة تعيين كلمة مرور الإدارة شغّل `npm run admin:hash`. ضع **القيمة فقط** بعد علامة `=` في سر `ADMIN_PASSWORD_HASH` داخل **Worker → Settings → Runtime variables and secrets → Production**. لا تنسخ اسم المفتاح أو علامة المساواة داخل السر.
- لا تخلط بين أسرار **Builds** وأسرار **Runtime**. الأولى لا تصل إلى طلبات تسجيل الدخول على Worker.
- `GET /api/health` يعيد `configured:true` عندما يتوفر `ADMIN_USER` و`SESSION_SECRET` وتكون صيغة `ADMIN_PASSWORD_HASH` صحيحة (ملح 16 بايت وتجزئة 32 بايت). هذه النتيجة لا تثبت تطابق كلمة المرور التي تُدخلها.
- بعد خمس محاولات فاشلة يمنع تسجيل الدخول مؤقتا لمدة 15 دقيقة. لا تعاود التجربة خلال الحظر.
- `keep_vars = true` في `wrangler.toml` يحافظ على المتغيرات المخزنة في لوحة Cloudflare عند نشر الكود من Wrangler.
- نشر GitHub Actions يتطلب إضافة `CLOUDFLARE_API_TOKEN` و`CLOUDFLARE_ACCOUNT_ID` إلى **GitHub → Settings → Secrets and variables → Actions**. رمز **Cloudflare Builds** لا يُنسخ تلقائيا إلى GitHub Secrets.
- لا ترفع كلمة المرور أو التجزئة أو رمز Cloudflare أو مفتاح الجلسة إلى GitHub. بعد نجاح تسجيل الدخول يجب تغيير بيانات الدخول التي سبق نشرها في محادثات أو صور.
- اضبط أمر بناء Cloudflare Workers Builds لتنفيذ `npm run check && npm test` قبل `npx wrangler deploy`، ولا تعتمد نشر إنتاج مستقلين متزامنين من GitHub Actions وCloudflare Builds دون تنسيق.
