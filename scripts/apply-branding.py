"""Apply the approved robot logo + release version to extracted AgentOffice source.

Called on GitHub Actions before running Vite / Electron Builder.
"""
from __future__ import annotations

import base64
import io
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'app'
ASSET = ROOT / 'assets' / 'agentoffice-icon.webp.b64'
VERSION = (ROOT / 'release-version.txt').read_text(encoding='utf-8').strip()
assert VERSION.count('.') == 2 and all(v.isdigit() for v in VERSION.split('.')), 'Invalid release version'
assert (APP / 'package.json').is_file(), 'AgentOffice source has not been extracted'

raw = base64.b64decode(ASSET.read_text(encoding='ascii').strip(), validate=True)
image = Image.open(io.BytesIO(raw)).convert('RGBA')
assert image.size == (256, 256), f'Expected 256x256 icon, got {image.size}'
(APP / 'build').mkdir(exist_ok=True)
(APP / 'public').mkdir(exist_ok=True)
image.resize((512,512), Image.Resampling.LANCZOS).save(APP / 'build' / 'icon.png', optimize=True)
image.resize((512,512), Image.Resampling.LANCZOS).save(APP / 'public' / 'icon.png', optimize=True)
image.save(APP / 'build' / 'icon.ico', format='ICO', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

package_path = APP / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = VERSION
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

main = APP / 'src' / 'main.js'
text = main.read_text(encoding='utf-8')
original = '<div class="brand-icon">A</div>'
if not (original in text or 'alt="AgentOffice logo"' in text or 'src="./icon.png"' in text):
    raise RuntimeError('App branding anchor not found')
text = text.replace(original, '<div class="brand-icon"><img src="./icon.png" alt="AgentOffice logo"></div>')
text = text.replace('3D Desktop v1.1.0', '3D Desktop v' + VERSION)
main.write_text(text, encoding='utf-8')

css = APP / 'src' / 'style.css'
style = css.read_text(encoding='utf-8')
if '/* AgentOffice approved orange brand icon */' not in style and '.shell-brand' not in style:
    style += '\n/* AgentOffice approved orange brand icon */\n.brand-icon{background:transparent!important;color:inherit!important;overflow:hidden}.brand-icon img{display:block;width:100%;height:100%;object-fit:contain}\n'
css.write_text(style, encoding='utf-8')

html = APP / 'index.html'
markup = html.read_text(encoding='utf-8')
if 'href="./icon.png"' not in markup:
    markup = markup.replace('</head>', '  <link rel="icon" type="image/png" href="./icon.png" />\n</head>')
html.write_text(markup, encoding='utf-8')

config = APP / 'electron-builder.config.cjs'
settings = config.read_text(encoding='utf-8')
if "'build/icon.png'" not in settings:
    settings = settings.replace("'electron/**/*',", "'electron/**/*',\n    'build/icon.png',")
config.write_text(settings, encoding='utf-8')

print(f'Updated AgentOffice v{VERSION}: Windows ICO, app PNG, sidebar logo, favicon')
