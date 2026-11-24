'use strict';
// Legacy device-local accounts and external identity/recovery bridge. No cloud data sync yet.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

function registerAuth(ipcMain, provider=require('./identity.cjs').createProvider(), {accountFile,now=Date.now}={}) {
let session = null;
const attempts = new Map();
const FILE = () => accountFile || path.join(require('electron').app.getPath('userData'), 'local-accounts.json');
let authGeneration=0,authenticationPending=null;
const authenticate=async fn=>{
  if(authenticationPending)throw Error('Sign-in already open');
  const flight={generation:authGeneration};authenticationPending=flight;
  try{
    const user=await fn();
    if(flight.generation!==authGeneration)throw Error('Authentication superseded');
    session=user;return user;
  }finally{if(authenticationPending===flight)authenticationPending=null}
};
function invalidateAuth(){authGeneration++;authenticationPending=null;provider.cancelGoogle?.()}

function normalEmail(v) { return typeof v === 'string' ? v.trim().toLowerCase() : ''; }
function validEmail(v) { return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function safeUser(account) { return { id: account.id, name: account.name, email: account.email, guest: false }; }
function passwordRule(password) { return typeof password === 'string' && password.length >= 10 && password.length <= 1024; }
async function readAccounts() {
  try {
    const data = JSON.parse(await fs.readFile(FILE(), 'utf8'));
    if (!data || !Array.isArray(data.accounts)) throw new Error('Local account database is invalid.');
    return data;
  } catch (e) {
    if (e.code === 'ENOENT') return { version: 1, accounts: [] };
    throw e;
  }
}
async function saveAccounts(data) {
  const file = FILE();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + crypto.randomBytes(5).toString('hex') + '.tmp';
  try { await fs.writeFile(temp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' }); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }).catch(() => {}); }
}
function blockCheck(email) {
  const record = attempts.get(email);
  if (!record) return;
  if (record.until > now()) throw new Error('Too many attempts. Try again in a few minutes.');
  if (record.until) attempts.delete(email);
}
function recordFailure(email) {
  const state = attempts.get(email) || { count: 0, until: 0 };
  state.count += 1;
  if (state.count >= 7) { state.count = 0; state.until = now() + 120000; }
  attempts.set(email, state);
}
async function signUp(payload) {
  const name = String(payload?.name || '').trim();
  const email = normalEmail(payload?.email);
  const password = payload?.password;
  if (name.length < 2 || name.length > 80) throw new Error('Name must be between 2 and 80 characters.');
  if (!validEmail(email)) throw new Error('Enter a valid email address.');
  if (!passwordRule(password)) throw new Error('Password must contain between 10 and 1024 characters.');
  const db = await readAccounts();
  if (db.accounts.some(a => a.email === email)) throw new Error('An account with this email already exists on this computer.');
  const salt = crypto.randomBytes(24).toString('hex');
  const digest = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const account = { id: crypto.randomUUID(), email, name, salt, digest: digest.toString('hex'), createdAt: new Date().toISOString() };
  db.accounts.push(account);
  await saveAccounts(db);
  return safeUser(account);
}
async function signIn(payload) {
  const email = normalEmail(payload?.email);
  const password = payload?.password;
  if (!validEmail(email) || !passwordRule(password)) throw new Error('Incorrect email or password.');
  blockCheck(email);
  const db = await readAccounts();
  const account = db.accounts.find(a => a.email === email);
  // Run scrypt even when no user is found to reduce account-enumeration timing.
  const salt = account?.salt || '000000000000000000000000000000000000000000000000';
  const expected = account?.digest || '00'.repeat(64);
  const actual = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const candidate = Buffer.from(expected, 'hex');
  if (!account || candidate.length !== actual.length || !crypto.timingSafeEqual(candidate, actual)) {
    recordFailure(email);
    throw new Error('Incorrect email or password.');
  }
  attempts.delete(email);
  return safeUser(account);
}
  let recovery=null;
  let writes=Promise.resolve();
  let activeAuth=0;
  const write=fn=>{const result=writes.then(fn);writes=result.catch(()=>{});return result};
  const channels=(name,fn)=>ipcMain.handle('agentoffice:auth:'+name,async(_event,payload)=>{
    activeAuth++;
    try { return await fn(payload); } finally { activeAuth--; }
  });
  channels('identity-status',()=>provider.configured);
  channels('google',()=>authenticate(()=>provider.google()));
  channels('github',()=>authenticate(()=>provider.github()));
  channels('cancel-google',()=>{invalidateAuth();return true});
  channels('request-code',async payload=>{
    if(!provider.configured)throw Error('Identity not configured');
    const email=normalEmail(payload?.email);
    if(!validEmail(email))throw Error('Enter a valid email address');
    if(recovery?.email===email && now()<recovery.sent+60000)throw Error('Too many attempts');
    const flow={email,sent:now(),tries:0,checking:false,ready:false};
    recovery=flow;
    try {
      const account=(await readAccounts()).accounts.find(a=>a.email===email);
      if(account){flow.accountId=account.id;flow.digest=account.digest;await provider.sendCode(email)}
      if(recovery===flow)flow.ready=true;
    }catch(err){if(recovery===flow)recovery=null;throw err}
    return true;
  });
  channels('verify-code',async payload=>{
    const flow=recovery,token=payload?.code;
    if(!flow?.ready||flow.grant||flow.checking||flow.tries>=5||now()-flow.sent>=600000||
       normalEmail(payload?.email)!==flow.email||!/^\d{6,10}$/.test(String(token)))throw Error('Invalid or expired code');
    flow.tries++;flow.checking=true;
    try {
      if(!flow.accountId)throw Error('Invalid or expired code');
      await provider.verifyCode(flow.email,String(token));
      if(recovery!==flow||now()-flow.sent>=600000)throw Error('Invalid or expired code');
      flow.grant=crypto.randomBytes(32).toString('hex');flow.expires=now()+300000;
      return flow.grant;
    } finally {flow.checking=false}
  });
  channels('reset-password',payload=>write(async()=>{
    const flow=recovery;
    if(!flow?.grant||flow.grant!==payload?.grant||now()>=flow.expires)throw Error('Invalid or expired code');
    if(!passwordRule(payload.password))throw Error('Password must contain between 10 and 1024 characters.');
    const db=await readAccounts(), account=db.accounts.find(a=>a.id===flow.accountId&&a.email===flow.email&&a.digest===flow.digest);
    if(!account)throw Error('Invalid or expired code');
    account.salt=crypto.randomBytes(24).toString('hex');
    account.digest=(await scrypt(payload.password,account.salt,64,{N:16384,r:8,p:1})).toString('hex');
    if(recovery!==flow||now()>=flow.expires)throw Error('Invalid or expired code');
    recovery=null;
    await saveAccounts(db);attempts.delete(account.email);
    if(session?.id===account.id)session=null;
    return true;
  }));
  ipcMain.handle('agentoffice:auth:current', () => session);
  channels('signup', payload => authenticate(()=>write(()=>signUp(payload))));
  channels('signin', payload => authenticate(()=>write(()=>signIn(payload))));
  channels('guest', () => { invalidateAuth();session = { id: 'guest', name: 'Guest', guest: true, email: null }; return session; });
  channels('logout', () => { invalidateAuth();session = null; recovery=null; return true; });
  return { canAutoRestart: () => session === null && activeAuth === 0 && (!recovery || now()-recovery.sent >= 600000) };
}
module.exports = { registerAuth };
