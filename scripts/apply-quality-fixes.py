"""Apply reviewed quality fixes after all immutable-baseline overlays."""
from pathlib import Path
import re
import shutil

def apply(root):
    app = root / "app"
    def replace(name, old, new):
        target = app / name
        text = target.read_text(encoding="utf-8")
        if text.count(old) != 1:
            raise RuntimeError("Quality-fix anchor mismatch: " + name + " " + old[:60])
        target.write_text(text.replace(old, new, 1), encoding="utf-8")


    # Bound validation work and avoid ambiguous backtracking over attacker input.
    replace("electron/auth.cjs",
            r"v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)",
            r"v.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(v)")
    replace("electron/identity.cjs",
            r"!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)",
            r"(email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email))")
    replace("electron/main.cjs", "if(result?.downloadPromise)",
            "if(result && result.downloadPromise !== undefined)")
    replace("electron/main.cjs", "if (devUrl) mainWindow.loadURL(devUrl);",
            "if (devUrl) mainWindow.loadURL(devUrl).catch(error => console.error('Window load failed:', error));")
    replace("electron/main.cjs", "else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));",
            "else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch(error => console.error('Window load failed:', error));")
    replace("electron/main.cjs", "\n});\napp.on('second-instance'",
            "\n}).catch(error => { console.error('Application startup failed:', error); app.quit(); });\napp.on('second-instance'")
    replace("src/loading-intro.js", "    (async()=>{", "    void (async()=>{")
    replace("src/loading-intro.js",
            "event.data==='agentoffice:intro-complete')finish();",
            "event.data==='agentoffice:intro-complete')void finish();")
    replace("src/loading-intro.html", "<html>", '<html lang="en">')
    replace("src/auth-screen.html", '<label class="remember">',
            '<label class="remember" for="remember-email">')
    replace("src/auth-screen.html", '<input type="checkbox" >',
            '<input id="remember-email" type="checkbox" >')

    # A static stylesheet requires no inline CSP exception.
    startup = app / "electron/startup-update.html"
    markup = startup.read_text(encoding="utf-8")
    style = re.search(r"<style>(.*?)</style>", markup, re.S)
    if not style:
        raise RuntimeError("Startup stylesheet missing")
    (app / "electron/startup-update.css").write_text(style[1], encoding="utf-8")
    markup = markup.replace(style[0], '<link rel="stylesheet" href="./startup-update.css">')
    markup = markup.replace("style-src 'unsafe-inline'", "style-src 'self'")
    startup.write_text(markup, encoding="utf-8")

    # These old dashboard modules are unreachable after the verified office port.
    # Keep the immutable archive, remove only dead prepared copies.
    for name in ("studio.js", "icons.js"):
        assert name not in (app / "src/main.js").read_text(encoding="utf-8")
        (app / "src" / name).unlink()

    shutil.copyfile(root / 'scripts/main-lifecycle.test.cjs', app / 'scripts/main-lifecycle.test.cjs')
    shutil.copyfile(root / 'scripts/renderer-lifecycle.test.mjs', app / 'scripts/renderer-lifecycle.test.mjs')

    # Instrument only the smoke harness, never the shipped application.
    shutil.copyfile(root / "scripts/coverage-tools/collect-renderer.cjs",
                    app / "scripts/collect-renderer.cjs")
    replace("scripts/auth-smoke.cjs", "  win.webContents.on('render-process-gone'",
            "  const finishCoverage = await require('./collect-renderer.cjs').start(win.webContents);\n  win.webContents.on('render-process-gone'")
    replace("scripts/auth-smoke.cjs", "  clearTimeout(watchdog);\n  app.exit(0);",
            "  await finishCoverage();\n  clearTimeout(watchdog);\n  app.exit(0);")
    print("Applied bounded validation, explicit async handling, startup CSP and harness-only execution coverage")

if __name__ == "__main__":
    apply(Path(__file__).resolve().parents[1])
