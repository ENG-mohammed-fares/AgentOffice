byId('language').onclick=()=>{languageChoice=lang==='en'?'device':'en';save(languageChoiceKey,languageChoice);lang=languageChoice==='en'?'en':deviceLanguage();render()};
window.addEventListener('languagechange',()=>{if(languageChoice==='device'){lang=deviceLanguage();render()}});
// One full-document transition means both panels share the same clock.
async function changeTheme(next,event,systemChange=false){
  if(themeChanging)return;
  const target=effectiveTheme(next);
  const apply=()=>{themeMode=next;theme=target;if(!systemChange)save(themeKey,next);render()};
  if(target===theme){apply();return}
  const root=document.documentElement,button=byId('theme'),r=button.getBoundingClientRect();
  const x=event?.detail?event.clientX:r.left+r.width/2,y=event?.detail?event.clientY:r.top+r.height/2;
  const radius=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
  themeChanging=true;root.classList.add('theme-switching');
  // Disable per-element transitions before taking either snapshot.
  void root.offsetWidth;
  try{
    if(motion.matches||!document.startViewTransition){apply();return}
    const transition=document.startViewTransition(apply);
    try{
      await transition.ready;
      const reveal=root.animate({clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${radius}px at ${x}px ${y}px)`]},
        {duration:550,easing:'cubic-bezier(.22,1,.36,1)',fill:'both',pseudoElement:'::view-transition-new(root)'});
      await reveal.finished;
    }catch{transition.skipTransition()}
    await transition.finished.catch(()=>{});
  }finally{root.classList.remove('theme-switching');themeChanging=false;if(themeMode==='system'&&effectiveTheme('system')!==theme)changeTheme('system',null,true)}
}
byId('theme').onclick=event=>{
  // Normal click changes appearance immediately; Shift+click returns to System.
  changeTheme(event.shiftKey?'system':theme==='dark'?'light':'dark',event);
};
byId('theme').addEventListener('contextmenu',event=>{event.preventDefault();changeTheme('system',event)});
themeMedia.addEventListener('change',()=>{if(themeMode==='system')changeTheme('system',null,true)});