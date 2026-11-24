# AgentOffice Desktop — تثبيت EXE وتحديثات GitHub

## التشغيل المحلي

ثبّت Node.js 22+، ثم شغّل `RUN-DESKTOP.bat` أو نفّذ `npm install` و `npm run dev` داخل هذا المجلد.

## إصدار EXE عبر GitHub

المستودع الرسمي: https://github.com/ENG-mohammed-fares/AgentOffice

1. افتح مستودع GitHub، واجعله Public من Settings → General → Danger Zone → Change repository visibility (بعد التأكد من عدم وجود أسرار).
2. حمّل ملف `AgentOffice-Source.zip` المجهّز من ChatGPT، وارفعه إلى **جذر المستودع** عبر Code → Add file → Upload files → Commit changes.
3. ملف `.github/workflows/windows-release.yml` موجود مسبقًا داخل المستودع لإجراء البناء عند تحديث ZIP. يمكن تشغيله يدويًا من Actions أيضًا.
4. راجع تبويب Actions. إذا نجح بناء Windows، افتح Releases ونزّل `AgentOffice-Setup-1.1.0-x64.exe` وثبّته.
5. لتحديث لاحق: نرفع إصدار مصدر جديد *بنفس اسم ZIP* مع زيادة رقم `version` في `package.json` (مثل 1.1.1). عند نجاح البناء، ينشر GitHub الإصدار الجديد، ويفحص التطبيق التحديثات.

**ملاحظة:** قبل النجاح الفعلي في GitHub Actions واختبار التطبيق على Windows لا يمكن الجزم بأن التحديثات تعمل. هذا المشروع واجهة 3D تجريبية وليس وكيل AI عاملًا بعد.

**الأمان:** لا ترفع `node_modules` أو كلمات مرور أو ملفات `.env` أو مفاتيح API. التطبيق والمثبّت حاليًا غير موقّعين رقميًا، وقد يعرض Windows SmartScreen تحذيرًا. لا تتجاوز التحذيرات إن لم تكن تثق بالمصدر.
