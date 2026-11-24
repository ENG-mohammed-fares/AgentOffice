import screen from './loading-intro.html?raw';

// Full-window animation is reserved for authentication lifecycle transitions.
const COPY={
  startup:['Starting AgentOffice','Preparing sign in','Ready'],
  signin:['Preparing workspace','Loading team','Ready'],
  logout:['Signing out','Returning to sign in','Signed out'],
  password:['Updating account','Returning to sign in','Password updated']
};
export function mountLoadingIntro({mode='signin',onComplete}) {
  const selected=Object.hasOwn(COPY,mode)?mode:'signin';
  const [first,second,final]=COPY[selected];
  const markup=screen.replace('Preparing workspace</span>',first+'</span>')
    .replace('Loading team</span>',second+'</span>')
    .replace('</svg>Ready</span>','</svg>'+final+'</span>');
  const root=document.querySelector('#app');
  const crossfade=selected!=='signin';
  const frame=document.createElement('iframe');
  frame.id='agentoffice-loading-intro';
  frame.dataset.mode=selected;
  frame.title='AgentOffice — '+first;
  frame.setAttribute('sandbox','allow-scripts');
  frame.style.cssText='display:block;width:100%;height:100dvh;border:0;background:#151618';
  if(crossfade){
    frame.style.cssText+=';position:fixed;inset:0;z-index:2147483647;opacity:1';
    frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
    root.inert=true;
    delete root.dataset.introOutcome;
    delete root.dataset.introMotion;
  }
  let done=false;
  let timer;
  const finish=async()=>{
    if(done)return;
    done=true;
    clearTimeout(timer);
    window.removeEventListener('message',receive);
    if(!crossfade){if(frame.parentNode===root)onComplete();return}
    if(!frame.isConnected){root.inert=false;return}
    // Keep the same loaded iframe on top while the destination renders behind it.
    // Moving an iframe between parents would reload its document.
    frame.dataset.phase='preparing';
    let timeout;
    try{
      root.dataset.introOutcome=await Promise.race([
        Promise.resolve().then(onComplete).then(()=> 'ready'),
        new Promise(resolve=>{timeout=setTimeout(()=>resolve('timeout'),2000)})
      ]);
    }catch(err){root.dataset.introOutcome='error';console.error('Intro destination failed:',err)}
    finally{clearTimeout(timeout)}
    try{
      if(frame.isConnected && !matchMedia('(prefers-reduced-motion: reduce)').matches){
        frame.dataset.phase='revealing';
        root.dataset.introMotion='crossfade';
        const animation=frame.animate([{opacity:1},{opacity:0}],{
          duration:480,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'
        });
        let fallback;
        try{await Promise.race([animation.finished,new Promise(resolve=>{fallback=setTimeout(resolve,650)})])}
        catch{}finally{clearTimeout(fallback)}
      }else root.dataset.introMotion='reduced-or-unavailable';
    }finally{frame.remove();root.inert=false}
  };
  function receive(event){
    if(event.source===frame.contentWindow && event.origin==='null' && event.data==='agentoffice:intro-complete')finish();
  }
  window.addEventListener('message',receive);
  // Fail open to the workspace if animation rendering is unavailable or stalled.
  timer=setTimeout(finish,5500);
  frame.srcdoc=markup;
  if(crossfade){
    root.replaceChildren();
    document.body.append(frame);
  }else root.replaceChildren(frame);
}
