from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
assets=root/'assets'/'phone-auth'
for name, replacements in json.loads((assets/'patches.json').read_text(encoding='utf-8')).items():
    path=root/'app'/name
    text=path.read_text(encoding='utf-8')
    for old,new in replacements:
        if text.count(old)!=1: raise RuntimeError('Phone auth anchor mismatch: '+name+' '+old[:80])
        text=text.replace(old,new,1)
    if name=='src/auth-screen.html':
        text=text.replace('</head><body>','<style>.phone-choice{display:flex;justify-content:space-between;align-items:center;gap:8px}.phone-choice #phoneLogin{margin:0;margin-inline-start:auto;background:none;border:0;color:var(--orange);font-size:13px;min-height:32px;white-space:normal;text-align:end}.phone-choice #phoneLogin:hover:not(:disabled){text-decoration:underline;text-underline-offset:3px}</style></head><body>',1)
        assert text.count('</body></html>')==1
        text=text.replace('</body></html>','<script>'+(assets/'phone-ui.js').read_text(encoding='utf-8')+'</script></body></html>',1)
    if name=='scripts/identity.test.cjs': text+='\n'+(assets/'tests.cjs').read_text(encoding='utf-8')
    path.write_text(text,encoding='utf-8')
print('Applied phone OTP integration and GitHub provider diagnostics')

# Verify the phone entry is discoverable even with the default disabled SMS
# provider, and that no SMS action is available until explicitly configured.
smoke_path=root/'app'/'scripts'/'auth-smoke.cjs'
smoke=smoke_path.read_text(encoding='utf-8')
anchor="  const deviceLang=await run('return d.documentElement.lang');"
if smoke.count(anchor)!=1: raise RuntimeError('Phone UX smoke anchor mismatch')
extra="""  assert.equal(await run('return !el("phoneLogin").hidden && el("phoneLogin").closest(".phone-choice")!==null'),true,'phone alternative is visible beside email');
  await run('el("phoneLogin").click()');
  assert.equal(await run('return !el("phonePanel").hidden && el("loginPanel").hidden'),true,'phone form opens');
  assert.equal(await run('return el("phoneNext").disabled && el("phoneNotice").textContent.trim().length>0'),true,'SMS remains unavailable without configuration');
  await run('el("phoneBack").click()');
  assert.equal(await run('return el("phonePanel").hidden && !el("loginPanel").hidden'),true,'return to email sign-in');
"""
smoke_path.write_text(smoke.replace(anchor,extra+anchor,1),encoding='utf-8')
