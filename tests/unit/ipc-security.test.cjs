'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isTrustedPage,trustedIpc,workspaceUrl}=require('../../app/electron/ipc-security.cjs');
test('only the expected page and its hash routes are trusted',()=>{
 const expected='file:///C:/AgentOffice/dist/index.html';
 assert.equal(isTrustedPage(expected+'#login',expected),true);
 for(const candidate of ['file:///C:/secret.html','https://example.test','file:///C:/AgentOffice/dist/index.html?x=1','invalid'])assert.equal(isTrustedPage(candidate,expected),false);
 assert.equal(isTrustedPage('http://localhost:5173.evil.test','http://localhost:5173/'),false);
 assert.equal(isTrustedPage('http://127.0.0.1:5173@evil.test/','http://127.0.0.1:5173/'),false);
});
test('IPC rejects foreign windows, subframes and navigated renderers',()=>{
 const expected='file:///app/dist/index.html',frame={url:expected};
 const contents={mainFrame:frame},win={isDestroyed:()=>false,webContents:contents};
 let handler;trustedIpc({handle(_name,fn){handler=fn}},()=>win,expected).handle('test',(_event,payload)=>payload);
 assert.equal(handler({sender:contents,senderFrame:frame},42),42);
 for(const event of [{sender:{},senderFrame:frame},{sender:contents,senderFrame:{url:expected}},{sender:contents,senderFrame:null}])assert.throws(()=>handler(event),/Untrusted/);
 frame.url='https://example.test';assert.throws(()=>handler({sender:contents,senderFrame:frame}),/Untrusted/);
});
test('development renderer must be loopback and unauthenticated',()=>{
 assert.equal(workspaceUrl('/tmp/index.html','http://127.0.0.1:5173'),'http://127.0.0.1:5173/');
 assert.match(workspaceUrl('/tmp/index.html'),/^file:/);
 for(const url of ['https://evil.test','http://localhost.evil.test','http://user@localhost:5173'])assert.throws(()=>workspaceUrl('/tmp/index.html',url),/Invalid/);
});
