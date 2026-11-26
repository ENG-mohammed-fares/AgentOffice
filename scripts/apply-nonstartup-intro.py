"""Use the owner's original loading intro for non-startup transitions only."""
from pathlib import Path
import re
import base64

repo = Path(__file__).resolve().parents[1]
src = repo / 'app' / 'src'
def once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError(f'Expected exactly one transition anchor: {old[:120]}')
    return text.replace(old, new, 1)

# This reference is the original approved HTML. Keep its art, logo, geometry,
# animation curves and timing intact. Only the production completion bridge,
# preview-only replay control and accessibility handling are adapted.
original = (repo / 'assets' / 'approved-intro' / 'AgentOffice-Loading-Intro-Preview.html').read_text(encoding='utf-8')
assert 'width:min(21vw,40vh)' in original and 'const stops=[[.72,0],[1,.22],[1.7,.52],[2.4,.88],[2.82,1],[3,1]]' in original
assert 'Loading agents</span>' in original
logo = re.search(r'<img class="logo" alt="AgentOffice logo" src="data:image/([^;]+);base64,([A-Za-z0-9+/=]+)"', original)
assert logo and len(base64.b64decode(logo[2], validate=True)) > 10000
screen = once(original, '<button id="replay">Replay intro</button>', '')
screen = once(screen, "$('#replay').onclick=play;", '')
screen = once(screen, "window.dispatchEvent(new Event('agentoffice:intro-complete'))", "window.dispatchEvent(new Event('agentoffice:intro-complete'));parent.postMessage('agentoffice:intro-complete','*')")
# Reduced motion keeps the three-second progress duration without moving the art.
screen = once(screen, 'render(t);if(t<3)', "render(matchMedia('(prefers-reduced-motion: reduce)').matches?(t<2.64?2.4:3):t);if(t<3)")
assert logo[0] in screen, 'Original embedded logo must not change'
(src / 'loading-intro.html').write_text(screen, encoding='utf-8')

path = src / 'loading-intro.js'
loader = path.read_text(encoding='utf-8')
# The startup route is implemented separately by apply-exact-intro.py.
# Check that it is present before switching the other modes to the original.
assert "if(mode==='startup')" in loader and 'startApprovedIntro' in loader
loader = once(loader, "signin:['Preparing workspace','Loading team','Ready']", "signin:['Preparing workspace','Loading agents','Ready']")
loader = once(loader, ".replace('Loading team</span>',second+'</span>')", ".replace('Loading agents</span>',second+'</span>')")
path.write_text(loader, encoding='utf-8')
print('Installed original three-second loading intro for sign-in, sign-out and password reset; startup and login UI preserved')
