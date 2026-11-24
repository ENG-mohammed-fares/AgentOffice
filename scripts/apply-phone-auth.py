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
        text=text.replace('</head><body>','<style>#phoneLogin{background:var(--surface);color:var(--text);border:1px solid var(--border);margin-top:8px;min-height:44px}</style></head><body>',1)
        assert text.count('</body></html>')==1
        text=text.replace('</body></html>','<script>'+(assets/'phone-ui.js').read_text(encoding='utf-8')+'</script></body></html>',1)
    if name=='scripts/identity.test.cjs': text+='\n'+(assets/'tests.cjs').read_text(encoding='utf-8')
    path.write_text(text,encoding='utf-8')
print('Applied phone OTP integration and GitHub provider diagnostics')
