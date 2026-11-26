// Authored floor coordinates are converted to Three.js X/Z. Chair geometry
// remains independently movable; never translate a static environment batch.
const PULL=.55, RISE=.38, WALK=.78, DESK_TUCK=.16, ACCEL=1.6, HEADING_TOLERANCE=.001;
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
    const desk={id:'desk_'+i,at:plus(point(x,-y),forward,-.91+DESK_TUCK),forward,keyboard:point(x-.19,-y+.19)};
    const row=Math.floor(i/2),right=i%2===1;
    const meeting={id:'meeting_'+i,at:point(right?6.76:4.34,.97-row*1.08),forward:point(right?-1:1,0)};
    return {desk,meeting};
  });
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
  // Rear desk route avoids the planter at (2.25, 4.58) in build_scene.py.
  // Conservative planter proxy radius .27 m plus estimated avatar radius .22 m.
  const west=desk.id==='desk_6'
    ? [point(1.60,aisle),point(1.60,3.85),point(2.08,3.85)]
    : [point(2.08,aisle)];
  return [d,point(d.x,aisle),...west,point(2.08,2.25),
    point(3.48,2.25),point(outer,2.25),point(outer,m.z),m,standingPoint(meeting)];
}
function yawFor(f){return Math.atan2(f.x,f.z);}
/** Returns the shortest signed angle between headings, in radians. */
function angleDelta(current,target){
  return Math.atan2(Math.sin(target-current),Math.cos(target-current));
}
/** Advances heading at no more than four radians per second. */
function turn(current,target,dt){
  const delta=angleDelta(current,target);
  return current+Math.max(-dt*4,Math.min(dt*4,delta));
}
/**
 * Advances one waypoint in world metres with bounded turning and linear acceleration.
 * Stop before changing direction at a corner; never translate while misaligned.
 * @param {object} position - Current X/Z position.
 * @param {number} yaw - Current heading in radians.
 * @param {object} target - Next X/Z waypoint.
 * @param {number} speed - Current travel speed in metres per second.
 * @param {number} dt - Elapsed simulation seconds (at most 0.1).
 * @returns {object} Next position, heading, speed and arrival/pose flags.
 */
export function advanceWalk(position,yaw,target,speed,dt){
  const distance=dist(position,target);
  if(distance<=1e-5)return {position:target,yaw,speed:0,arrived:true,walking:false};
  const heading=yawFor(point(target.x-position.x,target.z-position.z));
  const nextYaw=turn(yaw,heading,dt);
  if(Math.abs(angleDelta(yaw,heading))>HEADING_TOLERANCE)
    return {position,yaw:nextYaw,speed:0,arrived:false,walking:false};
  const nextSpeed=Math.min(WALK,speed+ACCEL*dt,Math.sqrt(2*ACCEL*distance));
  const step=Math.min(distance,nextSpeed*dt);
  const arrived=step>=distance-1e-5;
  return {position:arrived?target:mix(position,target,step/distance),yaw:nextYaw,
    speed:arrived?0:nextSpeed,arrived,walking:true};
}
/**
 * Coordinates chair translation, pose changes and waypoint travel for one avatar.
 * Mutates the supplied position and rotation; update receives elapsed seconds,
 * clamped to 0.1 to avoid large simulation jumps. Contact remains a visual review item.
 * @param {object} options - Assigned seat plan, mutable transforms and pose/chair callbacks.
 * @returns {object} Motion controller with activity and meeting requests and phase queries.
 */
export function createSeatedMotion({plan,position,rotation,setPose,setChair,groundY=0}){
  let seat=plan.desk,desired=seat,phase='seated',clock=0,activity='idle',route=[],cursor=0,arrivalPull=0,travelSpeed=0;
  const setPosition=p=>{position.x=p.x;position.z=p.z;position.y=groundY;};
  const pulls=new Map([[plan.desk.id,0],[plan.meeting.id,0]]);
  const setOffset=(s,n)=>{pulls.set(s.id,n);setChair(s.id,chairOffset(s,n));};
  const seatedPose=()=>seat===plan.meeting?'seatedMeeting':activity==='working'?'seatedTyping':'sitting';
  function enter(next){phase=next;clock=0;travelSpeed=0;}
  // Both corridor travel and final approach use the same heading and speed rules.
  function walkTo(target,dt){
    const next=advanceWalk(position,rotation.y,target,travelSpeed,dt);
    rotation.y=next.yaw;travelSpeed=next.speed;setPosition(next.position);
    setPose(next.walking?'walking':'idle');
    return next.arrived;
  }
  function completeSeat(){setPosition(seat.at);rotation.y=yawFor(seat.forward);setOffset(seat,0);setPose(seatedPose());enter('seated');}
  completeSeat();
  return {
    get phase(){return phase;},get location(){return seat.id;},get typing(){return phase==='seated'&&seat===plan.desk&&activity==='working';},
    requestMeeting(value){desired=value?plan.meeting:plan.desk;},
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
        if(clock>=.8){
          const corridor=meetingRoute(plan.desk,plan.meeting).slice(0,-1);
          route=seat===plan.desk?corridor:corridor.reverse();
          cursor=0;setPose('walking');enter('walk');
        }
      }else if(phase==='walk'){
        if(cursor<route.length&&walkTo(route[cursor],dt))cursor++;
        if(cursor===route.length){
          seat=seat===plan.desk?plan.meeting:plan.desk;
          arrivalPull=pulls.get(seat.id)??0;setPose('idle');enter('prepare-chair');
        }
      }else if(phase==='prepare-chair'){
        setOffset(seat,arrivalPull+(1-arrivalPull)*ease(clock/.65));
        if(clock>=.65){setPose('walking');enter('approach-seat');}
      }else if(phase==='approach-seat'){
        if(walkTo(standingPoint(seat),dt)){setPose('idle');enter('align');}
      }else if(phase==='align'){
        rotation.y=turn(rotation.y,yawFor(seat.forward),dt);
        if(clock>=.9&&Math.abs(angleDelta(rotation.y,yawFor(seat.forward)))<=HEADING_TOLERANCE){setPose('sitting');enter('lower');}
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
  return {request(value){target=Boolean(value);},
    update(dt){
      if(active?.phase==='seated')active=null;
      if(!active){
        active=records.find(r=>r.location.startsWith('meeting_')!==target)||null;
        active?.requestMeeting(target);
      }
      active?.update(dt);
    }};
}
