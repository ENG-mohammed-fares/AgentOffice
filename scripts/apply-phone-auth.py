from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
assets=root/'assets'/'phone-auth'
# Phone sign-in is deferred. Keep the backend and its isolated fixture tests,
# but ship neither the phone entry nor the phone form or UI script.
for name, replacements in json.loads((assets/'patches.json').read_text(encoding='utf-8')).items():
    path=root/'app'/name
    text=path.read_text(encoding='utf-8')
    for old,new in replacements:
        if name=='src/auth-screen.html' and ('id="phoneLogin"' in new or 'id="phonePanel"' in new):
            continue
        if text.count(old)!=1: raise RuntimeError('Auth anchor mismatch: '+name+' '+old[:80])
        text=text.replace(old,new,1)
    if name=='src/auth-screen.html':
        assert text.count('</body></html>')==1
        text=text.replace('</body></html>',"""<script>
Object.assign(words.en,{githubDisabled:'GitHub sign-in is not enabled on the identity service.'});
Object.assign(words.ar,{githubDisabled:'تسجيل الدخول عبر GitHub غير مفعّل في خدمة الهوية.'});
</script></body></html>""",1)
    if name=='scripts/identity.test.cjs': text+='\n'+(assets/'tests.cjs').read_text(encoding='utf-8')
    path.write_text(text,encoding='utf-8')
print('Phone OTP deferred; GitHub provider diagnostics retained')

smoke_path=root/'app'/'scripts'/'auth-smoke.cjs'
smoke=smoke_path.read_text(encoding='utf-8')
anchor="  const deviceLang=await run('return d.documentElement.lang');"
if smoke.count(anchor)!=1: raise RuntimeError('Auth smoke anchor mismatch')
extra="""  assert.equal(await run('return el("phoneLogin")===null && el("phonePanel")===null && el("phoneForm")===null'),true,'deferred phone sign-in is absent');
"""
smoke_path.write_text(smoke.replace(anchor,extra+anchor,1),encoding='utf-8')
