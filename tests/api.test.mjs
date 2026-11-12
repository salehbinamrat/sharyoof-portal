import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync} from 'node:crypto';
import fs from 'node:fs';
import worker from '../src/worker.js';
const schema=fs.readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8');
const salt=Buffer.alloc(16,7), password='a-strong-private-password-123';
const stored=`${salt.toString('base64')}:${pbkdf2Sync(password,salt,210000,32,'sha256').toString('base64')}`;
function env(){
 const db=new DatabaseSync(':memory:');db.exec(schema);
 const binding={prepare(sql){const stmt=db.prepare(sql);let params=[];const q={bind(...xs){params=xs;return q},first(){return stmt.get(...params)},all(){return{results:stmt.all(...params)}},run(){const r=stmt.run(...params);return{meta:{changes:r.changes}}}};return q}};
 return {DB:binding,ASSETS:{fetch:async()=>new Response('OK')},ADMIN_USER:'admin',ADMIN_PASSWORD_HASH:stored,SESSION_SECRET:'test-long-secret-at-least-32-bytes'};
}
async function call(e,path,method='GET',body,cookie){return worker.fetch(new Request('https://portal.example'+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined}),e)}
test('Protected admin, draft/public lifecycle, settings and sign out',async()=>{
 const e=env();
 assert.equal((await call(e,'/api/admin/session')).status,401);
 assert.equal((await call(e,'/api/login','POST',{username:'admin',password:'wrong'})).status,401);
 const login=await call(e,'/api/login','POST',{username:'admin',password});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.ok(cookie.startsWith('sharyoof_session='));
 const entity={type:'program',title:'اختبار برنامج',summary:'وصف للاختبار',cover:'',payload:{version:'1.0.0',x64i:'https://github.com/test/valid.exe'},published:false};
 const created=await call(e,'/api/admin/items','POST',entity,cookie);
 assert.equal(created.status,201);
 const id=(await created.json()).id;
 assert.equal((await (await call(e,'/api/items')).json()).items.length,0);
 const modified=await call(e,'/api/admin/items/'+id,'PUT',{...entity,published:true},cookie);
 assert.equal(modified.status,200);
 const listed=(await (await call(e,'/api/items')).json()).items;
 assert.equal(listed.length,1);assert.equal(listed[0].title,entity.title);
 assert.equal((await call(e,'/api/admin/items/'+id,'DELETE',undefined,cookie)).status,200);
 assert.equal((await (await call(e,'/api/items')).json()).items.length,0);
 assert.equal((await call(e,'/api/admin/settings','PUT',{siteTitle:'بوابة شريوف',contact:'https://example.com'},cookie)).status,200);
 assert.equal((await call(e,'/api/logout','POST',undefined,cookie)).status,200);
});
test('Login attempts are limited after five failures',async()=>{
 const e=env();for(let i=0;i<5;i++)assert.equal((await call(e,'/api/login','POST',{username:'admin',password:'wrong'})).status,401);
 assert.equal((await call(e,'/api/login','POST',{username:'admin',password})).status,429);
});
test('Payload guard and non-existing records',async()=>{
 const e=env();const login=await call(e,'/api/login','POST',{username:'admin',password});const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await call(e,'/api/admin/items','POST',{type:'program',title:'abc',summary:'',payload:{download:'javascript:evil()'}},cookie)).status,400);
 assert.equal((await call(e,'/api/admin/items/nothing','DELETE',undefined,cookie)).status,404);
 assert.equal((await call(e,'/api/admin/upload','POST',undefined,cookie)).status,503);
});
