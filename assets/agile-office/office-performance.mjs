// Pure, deterministic policies; no DOM or GPU required for unit tests.
export function makeFrameScheduler(request,cancel,draw){
  let id=null,paused=false,disposed=false;
  const schedule=()=>{if(paused||disposed||id!==null)return;id=request(t=>{id=null;if(!paused&&!disposed)draw(t);});};
  const stop=()=>{if(id!==null){cancel(id);id=null;}};
  return {request:schedule,pause(){paused=true;stop()},resume(){if(disposed)return;paused=false;schedule()},dispose(){disposed=true;stop()}};
}
// Default arguments retain the historical policy for existing callers and its
// differential contract. The office opts into the more conservative motion policy.
export function makeResolutionController(maxRatio,{stable=false}={}){
  const max=Math.max(.5,maxRatio),min=Math.min(max,Math.max(.55,max*(stable?.70:.55)));
  let ratio=max,ema=0,slow=0,fast=0,cooldown=0;
  const reset=()=>{ema=slow=fast=cooldown=0;};
  return {get ratio(){return ratio},sample(ms){
    if(!Number.isFinite(ms)||ms<=0){reset();return false;}
    // Severe GPU stalls are still valid performance samples, not a reason to
    // reset the controller. Visibility / idle transitions reset separately.
    ms=Math.min(ms,250);
    ema=ema?ema*.85+ms*.15:ms;
    if(cooldown>0){cooldown--;return false;}
    slow=ema>(stable?27:24)?slow+1:0;fast=ema<(stable?13:15)?fast+1:0;
    const old=ratio;
    if(slow>=6){
      if(stable&&slow<12)return false;
      ratio=stable?Math.max(min,ratio*.90):Math.max(min,ratio*.82);slow=fast=0;cooldown=stable?24:8;
    }
    else if(fast>=45){
      if(stable&&fast<90)return false;
      ratio=Math.min(max,ratio*(stable?1.05:1.12));slow=fast=0;cooldown=stable?45:15;
    }
    return Math.abs(ratio-old)>1e-6;
  },restore(){const changed=ratio!==max;ratio=max;reset();return changed;}};
}

// Limit physical drawing-buffer pixels, not CSS or UI resolution.
export function graphicsPixelRatio(preset,dpr,width,height){
  const settings={high:[1.75,3840*2160],balanced:[1.25,2560*1440],performance:[1,1920*1080]};
  const [cap,pixels]=Object.hasOwn(settings,preset)?settings[preset]:settings.balanced;
  const area=Math.max(1,width)*Math.max(1,height);
  return Math.max(.5,Math.min(dpr||1,cap,Math.sqrt(pixels/area)));
}
export function makeFrameMetrics(limit=120){
  const samples=[];
  return {
    record(ms){if(!Number.isFinite(ms)||ms<=0)return;if(samples.length===limit)samples.shift();samples.push(ms);},
    snapshot(){
      if(!samples.length)return {fps:null,frameTimeMs:null,p95FrameIntervalMs:null,samples:0};
      const mean=samples.reduce((sum,ms)=>sum+ms,0)/samples.length;
      const sorted=[...samples].sort((a,b)=>a-b);
      return {fps:1000/mean,frameTimeMs:mean,p95FrameIntervalMs:sorted[Math.ceil(sorted.length*.95)-1],samples:samples.length};
    }
  };
}
