// Authored floor coordinates are converted to Three.js X/Z. Chair geometry
// remains independently movable; never translate a static environment batch.
const PULL=.55, RISE=.38, WALK=.78, DESK_TUCK=.16;
const clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>{const q=clamp(n);return q*q*(3-2*q);};
const point=(x,z)=>({x,z});
const plus=(p,f,d)=>point(p.x+f.x*d,p.z+f.z*d);
const mix=(a,b,t)=>point(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
/**
 * Maps authored Blender station coordinates to desk and conference seats in Three.js.
 * @param {number[][]} stations - Station x/y in metres and heading in radians.
 * @returns {object[]} Independent seat plans with world X/Z coordinates.
 */
export function seatingPlan(stations){
  return stations.map(([x,y,a],i)=>{
    const forward=point(-Math.sin(a),-Math.cos(a));
    const local=(lx,ly)=>point(x+Math.cos(a)*lx-Math.sin(a)*ly,-(y+Math.sin(a)*lx+Math.cos(a)*ly));
    const desk={id:'desk_'+i,at:plus(point(x,-y),forward,-.91+DESK_TUCK),forward,keyboard:local(-.19,-.19),mouse:local(.16,-.20)};
    const row=Math.floor(i/2),right=i%2===1;
    const meeting={id:'meeting_'+i,at:point(right?6.76:4.34,.97-row*1.08),forward:point(right?-1:1,0)};
    return {desk,meeting};
  });
}
/** Returns two symmetrical wrist targets over the existing desk-mat mouse surface. */
export function mouseSurfaceTargets(mouse,halfSpan=.09){
  if(!mouse||!Number.isFinite(mouse.x)||!Number.isFinite(mouse.z)||!Number.isFinite(halfSpan)||halfSpan<=0||halfSpan>.18)throw Error('Invalid mouse surface');
  return [point(mouse.x-halfSpan,mouse.z),point(mouse.x+halfSpan,mouse.z)];
}
/**
 * Computes a chair translation relative to its exported geometry, including desk tuck.
 * @param {object} seat - Seat identifier and forward direction.
 * @param {number} amount - Pull progress, clamped to [0, 1].
 * @returns {{x:number,z:number}} World-space displacement in metres.
 */
export function chairOffset(seat,amount){return plus(point(0,0),seat.forward,(seat.id.startsWith('desk_')?DESK_TUCK:0)-PULL*clamp(amount));}
/** Returns the authored standing clearance point in world metres for a pulled chair. */
export function standingPoint(seat){return plus(plus(seat.at,seat.forward,-PULL),seat.forward,RISE);}
function sidePoint(seat){
  const p=standingPoint(seat);
  return seat.id.startsWith('desk_')?point(p.x+.68,p.z):point(p.x,p.z+.53);
}
// Door is at x=3.05,z=2.25. Keep the approach on the correct side of
// the glass, and use the corridor south of the conference table.
/**
 * Builds authored waypoints through the glass doorway between assigned seats.
 * This is not a general obstacle-avoidance or collision-detection system.
 * @param {object} desk - Assigned desk seat.
 * @param {object} meeting - Assigned conference seat.
 * @returns {{x:number,z:number}[]} Ordered world-space waypoints.
 */
export function meetingRoute(desk,meeting){
  const d=sidePoint(desk),m=sidePoint(meeting);
  const aisle=desk.at.z+1.05;
  const outer=meeting.at.x<5?3.48:7.45;
  return [d,point(d.x,aisle),point(2.08,aisle),point(2.08,2.25),
    point(3.48,2.25),point(outer,2.25),point(outer,m.z),m,standingPoint(meeting)];
}
function yawFor(f){return Math.atan2(f.x,f.z);}
function turn(current,target,dt){
  const delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));
  return current+Math.max(-dt*4,Math.min(dt*4,delta));
}
/**
 * Coordinates chair translation, pose changes and waypoint travel for one avatar.
 * Mutates the supplied position and rotation; update receives elapsed seconds,
 * clamped to 0.1 to avoid large simulation jumps. Contact remains a visual review item.
 * @param {object} options - Assigned seat plan, mutable transforms and pose/chair callbacks.
 * @returns {object} Motion controller with activity and meeting requests and phase queries.
 */
export function createSeatedMotion({plan,position,rotation,setPose,setChair,groundY=0}){
  let seat=plan.desk,desired=seat,phase='seated',clock=0,activity='idle',route=[],cursor=0,arrivalPull=0,travelAllowed=false;
  const setPosition=p=>{position.x=p.x;position.z=p.z;position.y=groundY;};
  const pulls=new Map([[plan.desk.id,0],[plan.meeting.id,0]]);
  const setOffset=(s,n)=>{pulls.set(s.id,n);setChair(s.id,chairOffset(s,n));};
  const seatedPose=()=>seat===plan.meeting?'seatedMeeting':activity==='working'?'seatedTyping':'sitting';
  function enter(next){phase=next;clock=0;}
  function completeSeat(){setPosition(seat.at);rotation.y=yawFor(seat.forward);setOffset(seat,0);setPose(seatedPose());enter('seated');}
  completeSeat();
  return {
    get phase(){return phase;},get location(){return seat.id;},get atDesk(){return phase==='seated'&&seat===plan.desk;},get typing(){return phase==='seated'&&seat===plan.desk&&activity==='working';},get needsTravel(){return phase==='waiting-travel'&&seat!==desired;},get corridorClear(){return phase==='walk'&&cursor>=5;},get corridorReserved(){return travelAllowed&&phase==='walk'&&cursor<5;},
    requestMeeting(value){desired=value?plan.meeting:plan.desk;},
    setTravelAllowed(value){travelAllowed=Boolean(value);},
    setActivity(value){activity=value;if(phase==='seated')setPose(seatedPose());},
    update(seconds){
      if(!Number.isFinite(seconds)||seconds<=0)return;
      const dt=Math.min(seconds,.1);clock+=dt;
      if(phase==='seated'){
        if(seat!==desired){setPose('sitting');enter('pull');}
      }else if(phase==='pull'){
        const t=ease(clock/.65);setOffset(seat,t);setPosition(plus(seat.at,seat.forward,-PULL*t));
        if(clock>=.65){setPose('idle');enter('rise');}
      }else if(phase==='rise'){
        setPosition(mix(plus(seat.at,seat.forward,-PULL),standingPoint(seat),ease(clock/.8)));
        if(clock>=.8){setPose('idle');enter('waiting-travel');}
      }else if(phase==='waiting-travel'){
        if(seat===desired){setPose('walking');enter('approach-seat');}
        else if(travelAllowed){
          const corridor=meetingRoute(plan.desk,plan.meeting).slice(0,-1);
          route=seat===plan.desk?corridor:corridor.reverse();
          cursor=0;setPose('walking');enter('walk');
        }
      }else if(phase==='walk'){
        let remaining=WALK*dt;
        while(cursor<route.length&&remaining>0){
          const target=route[cursor],d=dist(position,target);
          if(d<1e-5){cursor++;continue;}
          rotation.y=turn(rotation.y,yawFor(point(target.x-position.x,target.z-position.z)),dt);
          const step=Math.min(remaining,d);setPosition(mix(position,target,step/d));remaining-=step;
          if(step>=d-1e-5)cursor++;
        }
        if(cursor===route.length){
          seat=seat===plan.desk?plan.meeting:plan.desk;
          arrivalPull=pulls.get(seat.id)??0;setPose('idle');enter('prepare-chair');
        }
      }else if(phase==='prepare-chair'){
        setOffset(seat,arrivalPull+(1-arrivalPull)*ease(clock/.65));
        if(clock>=.65){setPose('walking');enter('approach-seat');}
      }else if(phase==='approach-seat'){
        const target=standingPoint(seat),d=dist(position,target);
        if(d<=WALK*dt){setPosition(target);setPose('idle');enter('align');}
        else{rotation.y=turn(rotation.y,yawFor(point(target.x-position.x,target.z-position.z)),dt);setPosition(mix(position,target,WALK*dt/d));}
      }else if(phase==='align'){
        rotation.y=turn(rotation.y,yawFor(seat.forward),dt);
        if(clock>=.9){rotation.y=yawFor(seat.forward);setPose('sitting');enter('lower');}
      }else if(phase==='lower'){
        setPosition(mix(standingPoint(seat),plus(seat.at,seat.forward,-PULL),ease(clock/.8)));
        if(clock>=.8)enter('push');
      }else if(phase==='push'){
        const t=1-ease(clock/.65);setOffset(seat,t);setPosition(plus(seat.at,seat.forward,-PULL*t));
        if(clock>=.65)completeSeat();
      }
    }
  };
}
// One mover at a time through the narrow glass doorway; others stay seated.
// Each avatar owns its own chair, so queued agents cannot share seats.
/**
 * Serializes travel through the narrow doorway and supports requests to return to desks.
 * @param {object[]} records - Per-avatar seated motion controllers.
 * @returns {object} Meeting request and frame-update interface.
 */
export function createMeetingQueue(records){
  let target=false,active=null;
  return {
    request(value){
      target=Boolean(value);
      for(const record of records)record.requestMeeting(target);
    },
    update(dt){
      if(active?.corridorClear){active.setTravelAllowed(false);active=null;}
      if(!active){
        active=records.find(record=>record.needsTravel)||null;
        active?.setTravelAllowed(true);
      }
      // Everyone prepares, stands, and seats independently. Only the doorway segment
      // is reserved, and the next mover may enter as soon as the previous one clears it.
      for(const record of records)record.update(dt);
      if(active?.corridorClear){active.setTravelAllowed(false);active=null;}
    }
  };
}
