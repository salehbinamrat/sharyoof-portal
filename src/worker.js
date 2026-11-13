const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const JSON_RESPONSE = (data, status=200, headers={}) => new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...headers}});
const enc = new TextEncoder();
const kinds = new Set(['program','hotspot','video']);
const filenameSafe = s => String(s||'').replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,90);
const hex = b => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const compare = (a,b) => {if (a.length!==b.length) return false; let x=0;for(let i=0;i<a.length;i++)x|=a[i]^b[i];return x===0};
const b64 = data => btoa(String.fromCharCode(...data));
const unb64 = s => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
const base64url = b => b64(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode64url = s => unb64(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));
export function validUrl(value){if(!value)return true;try{const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && value.length<=1800}catch{return false}}
export function validateItem(v){
 if(!v||typeof v!=='object'||!kinds.has(v.type))return 'نوع المحتوى غير صالح';
 if(typeof v.title!=='string'||v.title.trim().length<2||v.title.length>120)return 'اسم المحتوى غير صالح';
 if(typeof v.summary!=='string'||v.summary.length>3000)return 'الوصف طويل جدا';
 if(v.cover&&!validUrl(v.cover))return 'رابط الصورة غير صالح';
 if(v.slug && !/^[a-z0-9-]{2,100}$/.test(v.slug))return 'المعرف يجب أن يكون إنجليزيا';
 if(v.payload===null||typeof v.payload!=='object'||Array.isArray(v.payload))return 'البيانات غير صالحة';
 if(JSON.stringify(v.payload).length>14000)return 'بيانات المحتوى كبيرة';
 for(const [key,value] of Object.entries(v.payload)){
  if(/(?:url|link|download|video|image)/i.test(key) && typeof value==='string' && value && !validUrl(value))return 'رابط غير صالح: '+key;
 }
 return '';
}
export async function verifyPassword(password, stored){
 if(typeof stored!=='string'||!stored.includes(':'))return false;
 try{const [sa,ha]=stored.split(':');const salt=unb64(sa), expected=unb64(ha);if(salt.length!==16||expected.length!==32)return false;
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const actual=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:210000,salt},key,256));return compare(actual,expected);
 }catch{return false}
}
async function hmac(secret, message){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(message)))}
async function sessionToken(secret){const body=base64url(enc.encode(JSON.stringify({sub:'admin',exp:Math.floor(Date.now()/1000)+8*3600})));return body+'.'+base64url(await hmac(secret,body))}
async function authenticated(req,env){if(!env.SESSION_SECRET)return false;const cookie=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sharyoof_session='));if(!cookie)return false;
 const token=cookie.substring('sharyoof_session='.length), p=token.split('.');if(p.length!==2||p[0].length>500||p[1].length>100)return false;
 try{const sig=decode64url(p[1]);if(!compare(sig,await hmac(env.SESSION_SECRET,p[0])))return false;const body=JSON.parse(new TextDecoder().decode(decode64url(p[0])));return body.sub==='admin'&&body.exp>Math.floor(Date.now()/1000)}catch{return false}}
const parseJson = async req => {if(Number(req.headers.get('content-length')||0)>40000)throw Error('too_large');return await req.json()};
const err = (code,message)=>JSON_RESPONSE({error:message},code);
const validDb = env=>Boolean(env.DB);
function validStoredPasswordHash(value){
 if(typeof value!=='string')return false;
 const fields=value.split(':');
 if(fields.length!==2)return false;
 try{return unb64(fields[0]).length===16 && unb64(fields[1]).length===32;}
 catch{return false;}
}
async function api(req,env){
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(path==='/api/health')return JSON_RESPONSE({ok:true,db:validDb(env),configured:Boolean(env.ADMIN_USER&&validStoredPasswordHash(env.ADMIN_PASSWORD_HASH)&&env.SESSION_SECRET)});
 if(!validDb(env))return err(503,'قاعدة البيانات غير مرتبطة بالموقع');
 if(path==='/api/items'&&method==='GET'){
  const type=url.searchParams.get('type');if(type&&!kinds.has(type))return err(400,'تصنيف غير صحيح');
  const q=type?env.DB.prepare('SELECT * FROM items WHERE published=1 AND type=? ORDER BY updated_at DESC LIMIT 200').bind(type):env.DB.prepare('SELECT * FROM items WHERE published=1 ORDER BY updated_at DESC LIMIT 200');
  const result=await q.all();return JSON_RESPONSE({items:(result.results||[]).map(normalize)});
 }
 if(path==='/api/settings'&&method==='GET')return JSON_RESPONSE({settings:JSON.parse((await env.DB.prepare('SELECT data FROM site_settings WHERE id=1').first())?.data||'{}')});
 if(path==='/api/login'&&method==='POST'){
  if(!env.ADMIN_USER||!validStoredPasswordHash(env.ADMIN_PASSWORD_HASH)||!env.SESSION_SECRET)return err(503,'إعدادات تسجيل الدخول غير مكتملة أو رمز كلمة المرور غير صالح');
  const ip=(req.headers.get('cf-connecting-ip')||'unknown').slice(0,60);
  const now=Math.floor(Date.now()/1000);const stored=await env.DB.prepare('SELECT failures,window_start FROM login_attempts WHERE ip=?').bind(ip).first();
  if(stored&&now-stored.window_start<900&&stored.failures>=5)return err(429,'محاولات كثيرة. أعد المحاولة بعد 15 دقيقة');
  let body;try{body=await parseJson(req)}catch{return err(400,'بيانات غير صحيحة')}
  const success=body?.username===env.ADMIN_USER && typeof body.password==='string'&&body.password.length<=256&&await verifyPassword(body.password,env.ADMIN_PASSWORD_HASH);
  if(!success){await env.DB.prepare('INSERT INTO login_attempts (ip,failures,window_start) VALUES (?,1,?) ON CONFLICT(ip) DO UPDATE SET failures=CASE WHEN ?-window_start>=900 THEN 1 ELSE failures+1 END,window_start=CASE WHEN ?-window_start>=900 THEN ? ELSE window_start END').bind(ip,now,now,now,now).run();return err(401,'بيانات الدخول غير صحيحة')}
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip=?').bind(ip).run();
  const token=await sessionToken(env.SESSION_SECRET);
  return JSON_RESPONSE({ok:true},200,{'set-cookie':`sharyoof_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`});
 }
 if(path==='/api/logout'&&method==='POST')return JSON_RESPONSE({ok:true},200,{'set-cookie':'sharyoof_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
 if(!path.startsWith('/api/admin/'))return err(404,'غير موجود');
 if(!(await authenticated(req,env)))return err(401,'يجب تسجيل الدخول');
 if(path==='/api/admin/session'&&method==='GET')return JSON_RESPONSE({authenticated:true});
 if(path==='/api/admin/items'&&method==='GET'){
  const rows=await env.DB.prepare('SELECT * FROM items ORDER BY updated_at DESC LIMIT 500').all();return JSON_RESPONSE({items:(rows.results||[]).map(normalize)});
 }
 if(path==='/api/admin/items'&&method==='POST'){
  let v;try{v=await parseJson(req)}catch{return err(400,'بيانات غير صالحة')}
  const message=validateItem(v);if(message)return err(400,message);
  const id=crypto.randomUUID(),slug=v.slug||('item-'+id.slice(0,8));
  try{await env.DB.prepare('INSERT INTO items(id,type,slug,title,summary,cover,payload,published) VALUES(?,?,?,?,?,?,?,?)').bind(id,v.type,slug,v.title.trim(),v.summary.trim(),v.cover||'',JSON.stringify(v.payload||{}),v.published?1:0).run()}catch{return err(409,'هذا المعرّف مستخدم مسبقا')}
  return JSON_RESPONSE({id},201);
 }
 const match=path.match(/^\/api\/admin\/items\/([\w-]+)$/);
 if(match&&method==='PUT'){
  let v;try{v=await parseJson(req)}catch{return err(400,'بيانات غير صالحة')}
  const message=validateItem(v);if(message)return err(400,message);
  try{const r=await env.DB.prepare('UPDATE items SET type=?,slug=?,title=?,summary=?,cover=?,payload=?,published=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(v.type,v.slug||match[1],v.title.trim(),v.summary.trim(),v.cover||'',JSON.stringify(v.payload||{}),v.published?1:0,match[1]).run();return r.meta.changes?JSON_RESPONSE({ok:true}):err(404,'العنصر غير موجود')}catch{return err(409,'هذا المعرّف مستخدم مسبقا')}
 }
 if(match&&method==='DELETE'){const r=await env.DB.prepare('DELETE FROM items WHERE id=?').bind(match[1]).run();return r.meta.changes?JSON_RESPONSE({ok:true}):err(404,'العنصر غير موجود')}
 if(path==='/api/admin/settings'&&method==='PUT'){
  let body;try{body=await parseJson(req)}catch{return err(400,'بيانات غير صالحة')}
  const data={siteTitle:String(body.siteTitle||'بوابة شريوف').slice(0,90),tagline:String(body.tagline||'').slice(0,180),contact:String(body.contact||'').slice(0,200)};
  if(data.contact&&!validUrl(data.contact))return err(400,'رابط التواصل غير صالح');
  await env.DB.prepare('UPDATE site_settings SET data=?,updated_at=CURRENT_TIMESTAMP WHERE id=1').bind(JSON.stringify(data)).run();return JSON_RESPONSE({ok:true});
 }
 // Safe small media upload into the public GitHub repository (not for large application binaries).
 if(path==='/api/admin/upload'&&method==='POST'){
  if(!env.GH_TOKEN||!env.GH_REPO)return err(503,'يرجى ربط GitHub Token بالخادم لرفع الوسائط');
  const type=req.headers.get('content-type')||'';if(!type.startsWith('multipart/form-data'))return err(415,'يجب اختيار ملف');
  const form=await req.formData(),file=form.get('file');
  if(!(file instanceof File)||file.size<1||file.size>700000)return err(413,'الرفع المباشر للصور حتى 700 كيلوبايت فقط');
  const allowed={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};
  if(!allowed[file.type])return err(415,'المسموح صور PNG وJPG وWebP وGIF فقط');
  const ext=allowed[file.type],key=`public/media/${Date.now()}-${crypto.randomUUID().slice(0,8)}.${ext}`;
  const data=b64(new Uint8Array(await file.arrayBuffer()));
  const resp=await fetch(`https://api.github.com/repos/${env.GH_REPO}/contents/${key}`,{method:'PUT',headers:{'Authorization':`Bearer ${env.GH_TOKEN}`,'Accept':'application/vnd.github+json','User-Agent':'sharyoof-portal','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({message:'Add portal image',content:data})});
  if(!resp.ok)return err(502,'تعذر رفع الصورة إلى GitHub، راجع صلاحيات الرمز');
  return JSON_RESPONSE({url:`https://raw.githubusercontent.com/${env.GH_REPO}/main/${key}`,path:key});
 }
 return err(404,'غير موجود');
}
function normalize(row){return {...row,published:Boolean(row.published),payload:JSON.parse(row.payload||'{}')}}
export default {async fetch(req,env){
 try{
  const path=new URL(req.url).pathname;
  if(path.startsWith('/api/')){const res=await api(req,env);res.headers.set('x-frame-options','DENY');res.headers.set('referrer-policy','strict-origin-when-cross-origin');return res}
  const res=await env.ASSETS.fetch(req);
  const headers=new Headers(res.headers);headers.set('x-content-type-options','nosniff');headers.set('referrer-policy','strict-origin-when-cross-origin');headers.set('x-frame-options','DENY');
  return new Response(res.body,{status:res.status,headers});
 }catch(e){console.error('Request failed:',String(e));return err(500,'حدث خطأ في الخادم')}
}};
