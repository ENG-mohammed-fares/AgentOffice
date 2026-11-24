"""Integrate approved language/theme behavior without replacing authentication."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
assets = root / 'assets' / 'approved-preferences'
app = root / 'app'
def read(name):
    return (assets / name).read_text(encoding='utf-8')
def once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError(f'Expected exactly one preferences anchor: {old[:90]}')
    return text.replace(old, new, 1)
def pattern(text, regex, new):
    text, n = re.subn(regex, lambda _: new, text)
    if n != 1:
        raise RuntimeError(f'Expected exactly one preferences pattern: {regex}')
    return text

path = app / 'src' / 'auth-screen.html'
html = path.read_text(encoding='utf-8')
html = once(html, '</head><body>', '<style id="auth-preferences-style">'+read('preferences.css')+'</style></head><body>')
html = pattern(html, r'<button id="theme"[^>]*>.*?</button>', read('theme-button.html'))
html = once(html, "let lang=saved('agentoffice:auth-language')==='ar'?'ar':'en';\nlet theme=saved('agentoffice:auth-theme')==='light'?'light':'dark';", read('preferences.js'))
html = once(html, "document.documentElement.dir=lang==='ar'?'rtl':'ltr';", "document.documentElement.dir=rtlLanguages.has(lang)?'rtl':'ltr';")
old = """  byId('language').textContent=lang==='ar'?'EN':'عربي';
  byId('language').setAttribute('aria-label',lang==='ar'?'Switch to English':'التبديل إلى العربية');
  byId('theme').setAttribute('aria-label',t(theme==='dark'?'light':'dark'));"""
html = once(html, old, read('render-preferences.js'))
old = """byId('language').onclick=()=>{lang=lang==='ar'?'en':'ar';save('agentoffice:auth-language',lang);render()};
byId('theme').onclick=()=>{theme=theme==='dark'?'light':'dark';save('agentoffice:auth-theme',theme);render()};"""
html = once(html, old, read('theme-transition.js'))
# Preserve all existing authentication messages, including keys added since the
# preview, by falling back to English when a translation is unavailable.
html = once(html, 'const t = key => words[lang][key];', 'const t = key => words[lang][key] ?? words.en[key] ?? key;')
path.write_text(html, encoding='utf-8')

# Exercise the new preferences in the real Electron authentication smoke test.
# The CI runner's default locale can be English; simulate a device language in
# this fixture only, never in the production code.
test = app / 'scripts' / 'auth-smoke.cjs'
smoke = test.read_text(encoding='utf-8')
old = """  assert.equal(await run('return el("installedVersionLabel").textContent.trim()'),'Version');
  await run('el("language").click();el("theme").click();el("signupTab").click()');
  assert.equal(await run('return d.documentElement.dir'), 'rtl');
  assert.equal(await run('return el("installedVersionLabel").textContent.trim()'),'الإصدار');
  assert.equal(await run('return el("installedVersion").textContent'),'9.8.7');
  assert.equal(await run('return d.documentElement.dataset.theme'), 'light');"""
new = """  const deviceLang=await run('return d.documentElement.lang');
  assert.equal(await run('return el("theme").dataset.mode'),'system','default follows device theme');
  const initialTheme=await run('return d.documentElement.dataset.theme');
  const oppositeTheme=initialTheme==='dark'?'light':'dark';
  await run('el("theme").click()');
  await until('document.querySelector("iframe")?.contentDocument?.documentElement.dataset.theme === '+JSON.stringify(oppositeTheme)+' && !document.querySelector("iframe")?.contentDocument?.documentElement.classList.contains("theme-switching")','synchronized theme transition');
  assert.equal(await run('return el("theme").dataset.mode'),oppositeTheme);
  await run('el("theme").dispatchEvent(new d.defaultView.MouseEvent("click",{shiftKey:true,bubbles:true}))');
  await until('document.querySelector("iframe")?.contentDocument?.getElementById("theme")?.dataset.mode === "system" && !document.querySelector("iframe")?.contentDocument?.documentElement.classList.contains("theme-switching")','return to system theme');
  await run('Object.defineProperty(d.defaultView.navigator,"language",{value:"ar",configurable:true});d.defaultView.dispatchEvent(new d.defaultView.Event("languagechange"))');
  assert.equal(await run('return d.documentElement.lang'),'ar');
  assert.equal(await run('return d.documentElement.dir'),'rtl');
  assert.equal(await run('return el("installedVersionLabel").textContent.trim()'),'الإصدار');
  await run('el("language").click()');
  assert.equal(await run('return d.documentElement.lang'),'en');
  assert.equal(await run('return el("installedVersionLabel").textContent.trim()'),'Version');
  await run('el("language").click()');
  assert.equal(await run('return d.documentElement.lang'),'ar');
  for(const locale of ['fr','de','es','he','ja']){
    await run('Object.defineProperty(d.defaultView.navigator,"language",{value:'+JSON.stringify(locale)+',configurable:true});d.defaultView.dispatchEvent(new d.defaultView.Event("languagechange"))');
    assert.equal(await run('return d.documentElement.lang'),locale==='ja'?'en':locale);
    assert.equal(await run('return d.documentElement.dir'),locale==='he'?'rtl':'ltr');
  }
  await run('delete d.defaultView.navigator.language;d.defaultView.dispatchEvent(new d.defaultView.Event("languagechange"));el("signupTab").click()');
  assert.equal(await run('return d.documentElement.lang'),deviceLang);
  assert.equal(await run('return el("installedVersion").textContent'),'9.8.7');"""
smoke = once(smoke, old, new)
smoke = once(smoke, "assert.equal(await run('return d.documentElement.lang'),'ar');\n  await until(", "assert.equal(await run('return d.documentElement.lang'),deviceLang);\n  await until(")
test.write_text(smoke, encoding='utf-8')
print('Applied approved device-language preferences and synchronized theme transition; updated Electron assertions')
