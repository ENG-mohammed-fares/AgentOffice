'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'app/src/auth-screen.html'),'utf8');
const scripts=Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),m=>m[1]);
const intro=scripts.filter(script=>script.includes('window.startApprovedIntro ='));
assert.equal(intro.length,1,'Expected one actual installed intro script');

function setup(fonts){
  let playCount=0;
  const style={removeProperty(){}};
  const element={style,classList:{remove(){}},inert:false};
  const document={documentElement:element,getElementById:()=>element,querySelector:()=>element};
  if(fonts!==undefined)document.fonts=fonts;
  const window={addEventListener(){}};
  const media={get matches(){playCount++;return true;},addEventListener(){}};
  vm.runInNewContext(intro[0],{document,window,matchMedia:()=>media,clearTimeout});
  return {window,count:()=>playCount};
}
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('starts without the font readiness API',async()=>{
  const f=setup();
  assert.equal(f.count(),0);
  await f.window.startApprovedIntro(()=>{});
  assert.equal(f.count(),1);
});
test('waits for successful font readiness',async()=>{
  const d=deferred(),f=setup({ready:d.promise});
  const completed=f.window.startApprovedIntro(()=>{});
  assert.equal(f.count(),0);
  d.resolve();
  await completed;
  assert.equal(f.count(),1);
});
test('font rejection still completes the intro',async()=>{
  const d=deferred(),f=setup({ready:d.promise});
  const completed=f.window.startApprovedIntro(()=>{});
  d.reject(new Error('font unavailable'));
  await completed;
  assert.equal(f.count(),1);
});
test('cancellation prevents late font settlement from restarting the intro',async()=>{
  for(const reject of [false,true]){
    const d=deferred(),f=setup({ready:d.promise});
    const completed=f.window.startApprovedIntro(()=>{});
    f.window.cancelApprovedIntro();
    await completed;
    if(reject)d.reject(new Error('font unavailable'));else d.resolve();
    await turn();
    assert.equal(f.count(),0);
  }
});
