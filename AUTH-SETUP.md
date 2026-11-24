# تفعيل البريد وGoogle وGitHub في AgentOffice 1.6

يعمل الدخول المحلي والضيف فور التثبيت. يحتوي إصدار 1.6.0 على إعدادات Supabase العامة المخصصة لـ AgentOffice. يلزم تفعيل مزودي OAuth وإعداد إعادة التوجيه وSMTP في لوحة Supabase؛ لا تُضمّن مفاتيح OAuth السرية داخل التطبيق.

1. أنشئ مشروعًا من [لوحة Supabase](https://supabase.com/dashboard/projects). من **Connect / API Keys** انسخ **Project URL** و**Publishable key** الذي يبدأ بـ `sb_publishable_`.
2. في **Authentication → Email** فعّل مزوّد Email وتأكيد البريد، واسمح بإنشاء مستخدمين جدد. يستخدم التطبيق التحقق من ملكية البريد حتى للحسابات المحلية الموجودة قبل هذه النسخة. يتطلب بريد المستخدمين خارج فريق المشروع مزوّد SMTP. أضف بياناته في لوحة Supabase.
3. في **Email Templates** ضع الرمز `{{ .Token }}` في قالبَي **Confirm signup** و**Magic link**. مثلًا «رمز التحقق لمكتب AgentOffice هو {{ .Token }}». اضبط صلاحية الرمز على 600 ثانية وطوله على 6 أرقام، وفاصل الإرسال على 60 ثانية. اضبط حدود الإرسال حسب سعة مزوّد البريد.
4. من **Authentication → Providers → Google** انسخ رابط callback. في Google Cloud جهّز شاشة الموافقة وأنشئ OAuth client من نوع **Web application**، وضع رابط Supabase نفسه في **Authorized redirect URIs**. أدخل Client ID وClient Secret داخل لوحة Supabase وفعّل Google. إذا كان تطبيق Google في وضع الاختبار أضف حسابات المختبرين.
5. في **Authentication → URL Configuration → Redirect URLs** أضف `http://127.0.0.1:*/agentoffice/google/*`. هذا عنوان عودة التطبيق على جهاز المستخدم. يختار التطبيق منفذًا ومسارًا عشوائيين في كل عملية دخول، ويستخدم PKCE.
6. أنشئ GitHub OAuth App مع رابط callback نفسه في Supabase، ثم أدخل Client ID وClient Secret في مزود GitHub وفعّله. أضف `http://127.0.0.1:*/agentoffice/github/*` إلى Redirect URLs. لا يحتاج تسجيل الدخول إلى صلاحيات المستودعات.
7. لتجاوز إعدادات المشروع المضمّنة على جهاز التجربة، اضبط القيمتين العامتين في PowerShell، ثم أغلق AgentOffice كليًا وافتحه من جلسة جديدة.

```powershell
[Environment]::SetEnvironmentVariable('AGENTOFFICE_SUPABASE_URL', 'https://PROJECT_REF.supabase.co', 'User')
[Environment]::SetEnvironmentVariable('AGENTOFFICE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_REPLACE_ME', 'User')
```

لإصدار الشركة، يضع مسؤول الإصدار القيمتين العامتين في `electron/identity-config.json` ضمن حزمة المصدر ويعيد البناء. تبقى أسرار Google وSMTP في لوحة المزوّد.

**اختبار التفعيل** أنشئ حسابًا محليًا ببريد تملكه، ثم اطلب الرمز من الجهاز نفسه وغيّر كلمة المرور. افتح بعدها «المتابعة باستخدام Google» واختر حسابك في المتصفح. أول دخول بـGoogle يفتح مساحة محلية مستقلة مرتبطة بهوية Google. للدخول إلى مشاريع حسابك المحلي القديم استخدم بريده وكلمة مروره. تظل المشاريع والمهام على كل جهاز.

المراجع الرسمية: [إرسال رمز](https://supabase.com/docs/guides/auth/auth-email-passwordless) · [إعداد البريد](https://supabase.com/docs/guides/auth/auth-smtp) · [إعداد Google](https://supabase.com/docs/guides/auth/social-login/auth-google).

اختبر زر GitHub بحساب حقيقي أيضًا. مساحات Google وGitHub والمحلية منفصلة حفاظًا على بيانات المشاريع. لا تُرسل مفاتيح Client Secret إلى المستودع.
