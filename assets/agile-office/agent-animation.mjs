// Animation and movement are independent of the agent execution engine.
export const AGENT_STATES=Object.freeze(['idle','walking','working','thinking','reviewing','meeting','talking','error','completed','sitting','seatedTyping','seatedMeeting']);
const loops=new Set(['idle','walking','working','thinking','reviewing','meeting','talking','sitting','seatedTyping','seatedMeeting']);
const stateClips=Object.freeze({idle:'Idle',walking:'Walk',working:'Typing',thinking:'Thinking',reviewing:'Review',meeting:'Meeting',talking:'Talk',error:'Error',completed:'Celebrate',sitting:'Sitting',seatedTyping:'SeatedTyping',seatedMeeting:'SeatedMeeting'});
/**
 * Adds subtle, deterministic secondary motion to joints found static by the 1.6.18 rig audit.
 * Source clips remain authoritative for keyed joints; this only addresses neck, shoulders,
 * wrists, thumbs, toe bases and eye joints with small local rotations after mixer evaluation.
 */
function createProceduralJointMotion(root){
  const entries=[];
  if(typeof root?.traverse!=='function')return {count:0,update(){}};
  const rules=[[/thumb/i,'thumb'],[/toe.?base/i,'toe'],[/neck/i,'neck'],[/shoulder/i,'shoulder'],[/(hand|wrist)/i,'wrist'],[/eye/i,'eye']];
  root.traverse(bone=>{
    if(!bone.isBone)return;
    const match=rules.find(([pattern])=>pattern.test(bone.name||''));
    if(!match)return;
    const phase=[...(bone.name||'')].reduce((sum,char)=>sum+char.charCodeAt(0),0)*.071;
    entries.push({bone,base:bone.quaternion.clone(),kind:match[1],phase});
  });
  let elapsed=0;
  return {count:entries.length,update(dt,state){
    elapsed+=dt;
    const activity=state==='walking'?1.35:state==='thinking'?.8:state==='talking'?1.15:1;
    for(const item of entries){
      const wave=Math.sin(elapsed*(item.kind==='thumb'?3.1:1.15)+item.phase);
      const fine=Math.sin(elapsed*2.05+item.phase*.7);
      let x=0,y=0,z=0;
      switch(item.kind){
        case 'neck':x=.012*wave*activity;y=.016*fine*activity;z=.008*wave;break;
        case 'shoulder':x=.012*wave*activity;y=.006*fine;z=.014*fine*activity;break;
        case 'wrist':x=.018*wave*activity;y=.008*fine;z=.014*fine*activity;break;
        case 'thumb':x=(.045+.018*wave)*activity;z=.012*fine;break;
        case 'toe':x=.012*wave*activity;break;
        case 'eye':y=.006*wave;break;
      }
      item.bone.quaternion.copy(item.base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z,'XYZ')));
    }
  }};
}
/**
 * Creates a skeletal animation state controller using the supplied mixer.
 * @param {object} options - Root, clips, mixer, loop constants, fade seconds and forbidden root tracks.
 * @returns {object} State, supported states, update and idempotent disposal interface.
 * @throws {Error} On invalid configuration or duplicate/missing required clips.
 */
export function createAgentAnimator({root,clips,mixer,loopRepeat,loopOnce,fade=.2,rootTracks=[]}){
  if(!root||!Array.isArray(clips)||!mixer||!Number.isFinite(fade)||fade<0||fade>1)throw Error('Invalid animation configuration');
  const byName=new Map();
  for(const clip of clips){
    if(!clip?.name||byName.has(clip.name)||!Number.isFinite(clip.duration)||clip.duration<=0)throw Error('Invalid or duplicate animation clip');
    if(!Array.isArray(clip.tracks))throw Error('Invalid animation tracks');
    // Retargeting and root-motion removal belong to the asset pipeline.
    if(clip.tracks.some(t=>rootTracks.includes(t.name)))throw Error('Root translation must be removed before playback');
    byName.set(clip.name,clip);
  }
  if(!byName.has('Idle'))throw Error('Missing required Idle clip');
  const actions=new Map();
  const jointMotion=createProceduralJointMotion(root);
  let current=null,state='idle',disposed=false;
  function switchTo(next){
    if(disposed||!AGENT_STATES.includes(next))return false;
    const clip=byName.get(stateClips[next]);
    // Never claim that an unsupported movement or action has played.
    if(!clip)return false;
    if(current&&state===next)return true;
    let action=actions.get(next);
    if(!action){action=mixer.clipAction(clip,root);actions.set(next,action);}
    action.reset();
    action.enabled=true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.setLoop(loops.has(next)?loopRepeat:loopOnce,loops.has(next)?Infinity:1);
    action.clampWhenFinished=!loops.has(next);
    action.play();
    if(current&&current!==action&&fade>0)action.crossFadeFrom(current,fade,false);
    else if(current&&current!==action)current.stop();
    current=action;state=next;
    return true;
  }
  const finished=event=>{if(!disposed&&event.action===current&&!loops.has(state))switchTo('idle');};
  mixer.addEventListener('finished',finished);
  switchTo('idle');
  return {
    get state(){return state;},
    get proceduralJointCount(){return jointMotion.count;},
    supports(next){return AGENT_STATES.includes(next)&&byName.has(stateClips[next]);},
    setState:switchTo,
    update(seconds){if(!disposed&&Number.isFinite(seconds)&&seconds>0){const dt=Math.min(seconds,.1);mixer.update(dt);jointMotion.update(dt,state);}},
    dispose(){if(disposed)return;disposed=true;mixer.removeEventListener('finished',finished);mixer.stopAllAction();mixer.uncacheRoot(root);actions.clear();}
  };
}
// Coordinates are Three.js world X/Z, not Blender's Z-up coordinates.
// A route must be supplied by a navigation layer; no obstacle avoidance is claimed.
/**
 * Moves a mutable position along supplied X/Z waypoints at a bounded simulation step.
 * @param {object} options - Position, heading callback and speed in metres per second.
 * @returns {object} Route, movement, stop and update controls.
 * @throws {Error} If configuration or a supplied route is invalid.
 */
export function createRouteFollower({position,face,speed=1.1}){
  if(!position||!Number.isFinite(position.x)||!Number.isFinite(position.z)||typeof face!=='function'||!Number.isFinite(speed)||speed<=0)throw Error('Invalid movement configuration');
  let route=[],index=0;
  return {
    get moving(){return index<route.length;},
    setRoute(points){
      if(!Array.isArray(points)||points.length>128||points.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.z)))throw Error('Invalid route');
      route=points.map(({x,z})=>({x,z}));index=0;
    },
    stop(){route=[];index=0;},
    update(seconds){
      if(!Number.isFinite(seconds)||seconds<=0)return;
      let remaining=speed*Math.min(seconds,.1);
      while(index<route.length&&remaining>0){
        const point=route[index],dx=point.x-position.x,dz=point.z-position.z,distance=Math.hypot(dx,dz);
        if(distance<=1e-6){position.x=point.x;position.z=point.z;index++;continue;}
        face(Math.atan2(dx,dz));
        if(remaining>=distance){position.x=point.x;position.z=point.z;remaining-=distance;index++;}
        else{position.x+=dx/distance*remaining;position.z+=dz/distance*remaining;remaining=0;}
      }
    }
  };
}
/** Maps an assigned in-progress task to a visual activity state; no task execution occurs. */
export function taskActivity(tasks,role){
  if(!Array.isArray(tasks)||typeof role!=='string')return 'idle';
  return tasks.some(t=>t?.owner===role&&t.status==='In progress')?'working':'idle';
}
