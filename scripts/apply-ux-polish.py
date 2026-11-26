"""Apply authentication UX polish while retaining all production providers."""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parents[1]
assets = root / 'assets' / 'approved-preferences'
path = root / 'app' / 'src' / 'auth-screen.html'
def once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError(f'Expected exactly one UX anchor: {old[:100]}')
    return text.replace(old, new, 1)
html = path.read_text(encoding='utf-8')
html = once(html, '</head><body>', '<style id="auth-ux-polish">'+(assets/'ux-polish.css').read_text(encoding='utf-8')+'</style></head><body>')
for old, new in json.loads((assets/'ux-polish-patches.json').read_text(encoding='utf-8')):
    html = once(html, old, new)
assert html.count('id="github"') == 1 and "byId('github').onclick=()=>signInOAuth('github');" in html
assert html.count('id="google"') == 1 and "byId('google').onclick=()=>signInOAuth('google');" in html
assert 'id="motionReplay"' not in html, 'Preview-only replay must not be in production'
assert "byId('download').hidden=!!session?.auth;" in html
path.write_text(html, encoding='utf-8')
test = root / 'app' / 'scripts' / 'auth-smoke.cjs'
smoke = test.read_text(encoding='utf-8')
anchor = "  const deviceLang=await run('return d.documentElement.lang');"
extra = """  assert.equal(await run('return !!el("github") && el("github").getBoundingClientRect().height>0'),true,'GitHub sign-in is visible');
  assert.equal(await run('return !!el("google") && el("google").getBoundingClientRect().height>0'),true,'Google sign-in is visible');
  assert.equal(await run('return el("download").hidden && !el("motionReplay")'),true,'desktop-only UI');
  assert.equal(await run('return el("guestNote").textContent.trim().length>0'),true,'guest explanation');
  await run('el("email").value="bad";el("email").dispatchEvent(new d.defaultView.Event("blur"))');
  assert.equal(await run('return el("email").getAttribute("aria-invalid")'),'true','invalid email marked on blur');
  await run('el("email").value="";el("email").dispatchEvent(new d.defaultView.Event("input"))');
  assert.equal(await run('return el("email").hasAttribute("aria-invalid")'),false,'editing clears stale validation');
"""
smoke = once(smoke, anchor, extra + anchor)
test.write_text(smoke, encoding='utf-8')
print('Applied authentication UX polish; Google and GitHub remain available')
