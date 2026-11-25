// Pure, deterministic policies; no DOM or GPU required for unit tests.
export function makeFrameScheduler(request,cancel,draw){
  let id=null,paused=false,disposed=false;
  const schedule=()=>{if(paused||disposed||id!==null)return;id=request(t=>{id=null;if(!paused&&!disposed)draw(t);});};
  const stop=()=>{if(id!==null){cancel(id);id=null;}};
  return {request:schedule,pause(){paused=true;stop()},resume(){if(disposed)return;paused=false;schedule()},dispose(){disposed=true;stop()}};
}
export function makeResolutionController(maxRatio){
  const max=Math.max(.5,maxRatio),min=Math.min(max,Math.max(.55,max*.55));
  let ratio=max,ema=0,slow=0,fast=0,cooldown=0;
  const reset=()=>{ema=slow=fast=cooldown=0;};
  return {get ratio(){return ratio},sample(ms){
    if(!Number.isFinite(ms)||ms<=0||ms>250){reset();return false;}
    ema=ema?ema*.85+ms*.15:ms;
    if(cooldown>0){cooldown--;return false;}
    slow=ema>24?slow+1:0;fast=ema<15?fast+1:0;
    const old=ratio;
    if(slow>=6){ratio=Math.max(min,ratio*.82);slow=fast=0;cooldown=8;}
    else if(fast>=45){ratio=Math.min(max,ratio*1.12);slow=fast=0;cooldown=15;}
    return Math.abs(ratio-old)>1e-6;
  },restore(){const changed=ratio!==max;ratio=max;reset();return changed;}};
}
