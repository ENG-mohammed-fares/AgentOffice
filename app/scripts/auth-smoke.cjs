'use strict';
const {app, BrowserWindow, ipcMain} = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(),'agentoffice-auth-check-'));
app.setPath('userData',profile);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  // This fixture is outside the packaged application. Mail and Google are simulated here.
  let issued=false;
  require('../electron/auth.cjs').registerAuth(ipcMain,{
    configured:true,async sendCode(email){assert.equal(email,'qa@example.test');issued=true},
    async verifyCode(email,code){if(!issued||email!=='qa@example.test'||code!=='123456') throw Error('Invalid or expired code');issued=false},
    async google(){return {id:'google:test',name:'Google Tester',email:'other@example.test',guest:false}},
    async github(){return {id:'github:test',name:'GitHub Tester',email:'dev@example.test',guest:false}},
    cancelGoogle(){}
  });
  // Deliberately use a fixture version different from the build to catch hard-coded labels.
  ipcMain.handle('agentoffice:version',()=>({version:'9.8.7'}));
  ipcMain.handle('agentoffice:update-status',()=>({state:'idle',message:'Ready'}));
  const win = new BrowserWindow({show:false,width:1100,height:700,webPreferences:{
    preload:path.join(root,'electron','preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false
  }});
  const read = code => win.webContents.executeJavaScript(code);
  const run = code => read('(()=>{const d=document.querySelector("iframe").contentDocument;const el=id=>d.getElementById(id);'+code+'})()');
  async function until(code,label) {
    const start = Date.now();
    while (!(await read(code))) {
      if (Date.now()-start>20000) {const state=await read('JSON.stringify({mode:document.querySelector("#agentoffice-loading-intro")?.dataset.mode,phase:document.querySelector("#agentoffice-loading-intro")?.dataset.phase,outcome:document.querySelector("#app")?.dataset.introOutcome,motion:document.querySelector("#app")?.dataset.introMotion,authReady:document.querySelector("#app iframe")?.dataset.authReady,inert:document.querySelector("#app")?.inert})');throw Error('Timed out: '+label+' '+state)}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }
  const authReady = async () => {
    await until('!document.querySelector("#agentoffice-loading-intro") && document.querySelector("#app iframe")?.dataset.authReady === "true" && document.querySelector("#app iframe")?.contentDocument?.getElementById("download")?.hidden','desktop login');
    assert.equal(await read('document.querySelector("#app").inert'),false,'login is interactive');
    assert.equal(await read('document.querySelector("#app").dataset.introOutcome'),'ready','destination must be ready before intro reveal');
    assert.equal(await read('document.querySelector("#app").dataset.introMotion'),await read('matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced-or-unavailable" : "crossfade"'),'expected transition mode');
  };
  const workspace = async () => {
    await until('Boolean(document.querySelector("#agentoffice-loading-intro"))','post-sign-in intro');
    assert.equal(await read('Boolean(document.querySelector("#sign-out"))'),false,'workspace must not precede intro');
    assert.equal(await read('document.querySelector("#agentoffice-loading-intro").getAttribute("sandbox")'),'allow-scripts');
    const start=Date.now();
    // Reject spoofed completion messages from the parent window.
    await read('window.postMessage("agentoffice:intro-complete","*")');
    await new Promise(resolve=>setTimeout(resolve,250));
    assert.equal(await read('Boolean(document.querySelector("#agentoffice-loading-intro"))'),true);
    await until('Boolean(document.querySelector("#sign-out"))','workspace after intro');
    assert.ok(Date.now()-start>=2500,'intro should play for about three seconds');
    assert.equal(await read('Boolean(document.querySelector("#agentoffice-loading-intro"))'),false,'intro must be removed');
  };
  const transition = mode => until('document.querySelector("#agentoffice-loading-intro")?.dataset.mode === '+JSON.stringify(mode),mode+' intro');
  const logout = async () => {await read('document.querySelector("#sign-out").click()');await transition('logout');await authReady()};
  await win.loadFile(path.join(root,'dist','index.html'));
  await transition('startup');
  await authReady();
  assert.equal(await read('document.querySelector("#app").inert'),false,'login becomes interactive after crossfade');
  await until('document.querySelector("iframe")?.contentDocument?.getElementById("installedVersion")?.textContent === "9.8.7"','runtime installed version');
  assert.equal(await run('return el("installedVersionLabel").textContent.trim()'),'Version');
  await run('el("language").click();el("theme").click();el("signupTab").click()');
  assert.equal(await run('return d.documentElement.dir'), 'rtl');
  assert.equal(await run('return el("installedVersionLabel").textContent.trim()'),'الإصدار');
  assert.equal(await run('return el("installedVersion").textContent'),'9.8.7');
  assert.equal(await run('return d.documentElement.dataset.theme'), 'light');
  await run('el("name").value="Test User";el("email").value="qa@example.test";el("password").value="testing-10";el("confirm").value="different";el("authForm").requestSubmit()');
  assert.equal(await run('return el("confirm").getAttribute("aria-invalid")'),'true');
  await run('el("confirm").value=el("password").value;el("authForm").requestSubmit()');
  await workspace(); await logout();
  assert.equal(await run('return d.documentElement.lang'),'ar');
  await until('document.querySelector("iframe")?.contentDocument?.getElementById("installedVersion")?.textContent === "9.8.7"','version after logout');
  await run('el("email").value="qa@example.test";el("password").value="wrong-guess";el("authForm").requestSubmit()');
  await until('document.querySelector("iframe")?.contentDocument.querySelector("#formStatus.error")','rejected credentials');
  assert.equal(await read('Boolean(document.querySelector("#agentoffice-loading-intro"))'),false);
  await run('el("password").value="testing-10";d.querySelector(".remember input").checked=true;el("authForm").requestSubmit()');
  await workspace(); await logout();
  assert.equal(await run('return el("email").value'),'qa@example.test');
  await run('el("forgot").click();el("resetForm").requestSubmit()');
  await until('document.querySelector("iframe").contentDocument.querySelector("#resetCodeRow").hidden===false','email sent');
  await run('el("resetCode").value="111111";el("resetForm").requestSubmit()');
  await until('document.querySelector("iframe").contentDocument.querySelector("#resetStatus.error")','invalid OTP rejected');
  await run('el("resetCode").value="123456";el("resetForm").requestSubmit()');
  await until('document.querySelector("iframe").contentDocument.querySelector("#resetPasswordRow").hidden===false','verified OTP');
  await run('el("resetNew").value=el("resetConfirm").value="replacement-secret";el("resetForm").requestSubmit()');
  await transition('password');
  await authReady();
  assert.equal(await run('return el("email").value'),'qa@example.test');
  await until('document.querySelector("iframe")?.contentDocument?.querySelector("#recovery")?.hidden','password changed');
  await run('el("password").value="testing-10";el("authForm").requestSubmit()');
  await until('document.querySelector("iframe").contentDocument.querySelector("#formStatus.error")','old password rejected');
  await run('el("password").value="replacement-secret";el("authForm").requestSubmit()');
  await workspace();await logout();
  await run('el("google").click()');await workspace();
  assert.equal(await read('document.querySelector(".rail-person strong").textContent'),'Google Tester');
  await logout();
  await run('el("github").click()');await workspace();
  assert.equal(await read('document.querySelector(".rail-person strong").textContent'),'GitHub Tester');
  await logout();
  await run('el("guest").click()'); await workspace();
  assert.equal(await read('document.querySelector(".rail-person strong").textContent'),'Guest workspace');
  console.log('Verified reset UI including old password rejection, Google workspace entry with fixture provider, local accounts, guest, Arabic and theme on Windows.');
  app.exit(0);
}).catch(err=>{console.error(err);app.exit(1)});
