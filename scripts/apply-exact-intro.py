"""Install only the owner-approved startup intro into the existing auth screen.
The source archive is not replaced, and production authentication stays intact.
"""
from pathlib import Path
import base64
import hashlib
import re

repo = Path(__file__).resolve().parents[1]
app = repo / 'app' / 'src'
assets = repo / 'assets' / 'approved-intro'
def read(name):
    return (assets / name).read_text(encoding='utf-8')
def replace_once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError(f'Expected exactly one integration anchor: {old[:100]}')
    return text.replace(old, new, 1)

css, splash, door, motion = (read(n) for n in ('intro.css', 'splash.html', 'door.html', 'motion.js'))
logo = re.search(r'data:image/png;base64,([A-Za-z0-9+/=]+)', splash)
assert logo and hashlib.sha256(base64.b64decode(logo[1])).hexdigest() == 'b4bebe4fd7309829abf2fbf731e8d20a5888bfc8ee6648db669ef9662271240d', 'Approved logo must be byte-for-byte identical'
assert 'width:98px;height:98px' in css and 'timer=setTimeout(()=>door(run),2720)' in motion
# Preserve every visual rule and pose calculation. Only adapt the preview's
# replay button and completion signalling to the real application lifecycle.
motion = replace_once(motion, "$('motionReplay').disabled=false;", "if(finishIntro){const done=finishIntro;finishIntro=null;done();}")
motion = replace_once(motion, "$('motionReplay').disabled=true;", "")
motion = replace_once(motion, "let token=0, timer=0, fallback=0;", "let finishIntro=null, onReveal=null;let token=0, timer=0, fallback=0;")
motion = replace_once(motion, "root.classList.remove('intro-wait');const start=performance.now();", "root.classList.remove('intro-wait');onReveal?.();const start=performance.now();")
old = "$('motionReplay').textContent='↻ Replay intro';$('motionReplay').addEventListener('click',play);"
motion = replace_once(motion, old, "")
# Keep the preview and production font-readiness behavior aligned. The
# captured completion callback also guards against late font settlement.
motion = replace_once(
    motion,
    "const fontsReady=document.fonts?.ready;if(fontsReady === undefined)play();else void fontsReady.then(play,play);",
    """window.startApprovedIntro = reveal => new Promise(resolve=>{
      finishIntro=resolve;onReveal=reveal;
      const begin=()=>{if(finishIntro===resolve)play();};
      const fontsReady=document.fonts?.ready;
      if(fontsReady===undefined)begin();else void fontsReady.then(begin,begin);
    });window.cancelApprovedIntro=clean;""",
)
html = (app/'auth-screen.html').read_text(encoding='utf-8')
html = replace_once(html, '</head><body>', '<style id="approved-intro-css">'+css+'</style></head><body>'+splash)
html = replace_once(html, '<div class="scene" id="scene">', '<div class="scene" id="scene">'+door)
html = replace_once(html, '</body></html>', '<script>'+motion+'</script></body></html>')
(app/'auth-screen.html').write_text(html, encoding='utf-8')
auth = (app/'auth.js').read_text(encoding='utf-8')
auth = replace_once(auth, 'frame.srcdoc = screen;', """frame.srcdoc = document.querySelector('#agentoffice-loading-intro[data-approved-intro]') ? screen.replace('<html lang="en">','<html lang="en" class="intro-wait">') : screen;""")
(app/'auth.js').write_text(auth, encoding='utf-8')
loading = (app/'loading-intro.js').read_text(encoding='utf-8')
anchor = "  const selected=Object.hasOwn(COPY,mode)?mode:'signin';"
lifecycle = """
  // Startup is the approved combined intro, inside the actual login iframe.
  // Other lifecycle animations remain unchanged.
  if(mode==='startup'){
    const root=document.querySelector('#app');
    const marker=document.createElement('div');
    marker.id='agentoffice-loading-intro';
    marker.dataset.mode='startup';
    marker.dataset.approvedIntro='true';
    marker.dataset.phase='preparing';
    marker.hidden=true;
    marker.setAttribute('aria-hidden','true');
    document.body.append(marker);
    root.inert=true;
    delete root.dataset.introOutcome;
    delete root.dataset.introMotion;
    let watchdog;
    const bounded=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(Error('Approved intro deadline exceeded')),ms)})]).finally(()=>clearTimeout(watchdog));
    let frame;
    (async()=>{
      try{
        await bounded(Promise.resolve().then(onComplete),8000);
        frame=root.querySelector('iframe');
        if(!frame?.contentWindow?.startApprovedIntro)throw Error('Approved intro integration missing');
        root.dataset.introOutcome='ready';
        root.dataset.introMotion=frame.contentWindow.matchMedia('(prefers-reduced-motion: reduce)').matches?'reduced-or-unavailable':'crossfade';
        await bounded(frame.contentWindow.startApprovedIntro(()=>{marker.dataset.phase='revealing'}),7000);
      }catch(error){
        root.dataset.introOutcome='error';
        console.error('Approved intro failed:',error);
      }finally{
        try{(frame||root.querySelector('iframe'))?.contentWindow?.cancelApprovedIntro?.()}catch{}
        marker.remove();root.inert=false;
      }
    })();
    return;
  }
"""
loading = replace_once(loading, anchor, lifecycle + anchor)
(app/'loading-intro.js').write_text(loading, encoding='utf-8')
print('Installed original approved intro assets and unchanged motion poses')
