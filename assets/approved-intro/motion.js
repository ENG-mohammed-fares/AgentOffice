(()=>{
const $=id=>document.getElementById(id), root=document.documentElement, scene=$('scene'), form=document.querySelector('.auth .form'), reduce=matchMedia('(prefers-reduced-motion: reduce)');
let token=0, timer=0, fallback=0;const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x)};
const keys=['--intro-robot-x','--intro-robot-y','--intro-robot-scale','--intro-robot-opacity','--intro-tilt','--intro-form','--intro-form-y','--intro-form-scale','--intro-form-blur','--intro-brand','--intro-chips'];
function attrs(id,a){for(const [k,v] of Object.entries(a))$(id).setAttribute(k,String(v))}
function set(k,v){root.style.setProperty(k,v)}
function clean(){++token;clearTimeout(timer);clearTimeout(fallback);root.classList.remove('motion-playing','intro-wait','intro-crossfade');$('doorMotion').style.opacity='0';form.inert=false;for(const k of keys)root.style.removeProperty(k);$('motionReplay').disabled=false;}
function pose(t){
  const open=ease((t-.03)/.31),entry=ease((t-.20)/.56),reveal=ease((t-.54)/.38),fade=ease((t-.58)/.38),armIn=ease(t/.10)*(1-ease((t-.27)/.20));
  const wscene=scene.clientWidth, x=(.47*wscene)*(1-entry), y=(.065*wscene)*(1-entry)-Math.sin(entry*Math.PI)*4;
  set('--intro-robot-x',x+'px');set('--intro-robot-y',y+'px');set('--intro-robot-scale',.33+.67*entry);set('--intro-robot-opacity',ease((t-.08)/.15));set('--intro-tilt',(-4*Math.sin(entry*Math.PI))+'deg');
  set('--intro-form',reveal);set('--intro-form-y',((1-reveal)*12)+'px');set('--intro-form-scale',.985+.015*reveal);set('--intro-form-blur',((1-reveal)*2)+'px');set('--intro-brand',reveal);set('--intro-chips',reveal);
  $('doorMotion').style.opacity=1-fade;attrs('doorGlow',{opacity:open});
  const theta=open*Math.PI*.475,w=124*Math.cos(theta),skew=31*Math.sin(theta),dx=391-w,dy=118+skew,b=321-skew*.32;
  attrs('doorLeaf',{d:`M391 118 L${dx} ${dy} L${dx} ${b} L391 321 Z`});attrs('doorInset',{d:`M${391-w*.88} ${dy+12} L${391-w*.12} 132 L${391-w*.12} 305 L${391-w*.88} ${b-12} Z`});const hx=dx+w*.15,hy=219+skew*.25;attrs('doorHandleBase',{cx:hx,cy:hy});attrs('doorHandle',{d:`M${hx} ${hy} h${Math.min(14,w*.22)}`});
  const sx=200+(x/wscene)*400+35*(.33+.67*entry),sy=200+(y/wscene)*400+50*(.33+.67*entry);const arm=`M${sx} ${sy} Q${(sx+hx)/2} ${sy+15} ${hx} ${hy}`;
  for(const id of ['motionArmEdge','motionArm'])attrs(id,{d:arm,opacity:armIn});attrs('motionHand',{cx:hx,cy:hy,opacity:armIn});
}
function door(run){if(run!==token)return;if(reduce.matches){clean();return;}pose(0);root.classList.add('motion-playing','intro-crossfade');root.classList.remove('intro-wait');const start=performance.now();function tick(now){if(run!==token)return;if(reduce.matches){clean();return;}const t=(now-start)/1000;pose(Math.min(t,.96));if(t<.96)requestAnimationFrame(tick);else clean();}requestAnimationFrame(tick);}
function play(){if(reduce.matches){clean();return;}clearTimeout(timer);clearTimeout(fallback);const run=++token;root.classList.remove('intro-crossfade','motion-playing');root.classList.remove('intro-wait');void $('startupIntro').offsetWidth;root.classList.add('intro-wait');form.inert=true;$('motionReplay').disabled=true;pose(0);root.classList.add('motion-playing');timer=setTimeout(()=>door(run),2720);fallback=setTimeout(()=>{if(run===token)clean()},4500);}
$('motionReplay').textContent='↻ Replay intro';$('motionReplay').addEventListener('click',play);reduce.addEventListener('change',()=>{if(reduce.matches)clean()});window.addEventListener('keydown',e=>{if(e.key==='Escape'&&(root.classList.contains('intro-wait')||root.classList.contains('motion-playing')))clean()});const fontsReady=document.fonts?.ready;if(fontsReady === undefined)play();else void fontsReady.then(play,play);
})();