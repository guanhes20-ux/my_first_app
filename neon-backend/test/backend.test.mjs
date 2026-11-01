import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import {createApp} from '../app.mjs';
import {configuration,seal,unseal,hash,readSession,signSession} from '../security.mjs';
import {migrate} from '../migrate.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:10});
const config=configuration({APP_SECRET:'test-secret-'.repeat(4),DATA_KEY:Buffer.alloc(32,7).toString('base64'),ADMIN_PASSWORD:'test-admin-password-12345',PUBLIC_URL:'https://renta.example',DEMO_MODE:'true',TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_WEBHOOK_SECRET:'test-webhook-secret-'.repeat(2)});
let messages=[],sendFails=false;
const app=createApp({pool,config,send:async(method,payload)=>{if(sendFails)throw Error('send failed');messages.push(payload);if(method==='getMe')return {username:config.bot};if(method==='getWebhookInfo')return {url:config.publicUrl+'/telegram/webhook'};}});
before(async()=>migrate(pool));
beforeEach(async()=>{await pool.query('TRUNCATE rental_bookings,rental_webhook_updates,rental_rate_limits');messages=[];sendFails=false;});
after(async()=>pool.end());
function browser(){
 let cookie='';
 return {async req(path,method='GET',data,headers={}){
  const init={method,headers:{cookie,Origin:config.publicUrl,...headers}};
  if(data!==undefined){
   if(headers['Content-Type']==='application/json')init.body=JSON.stringify(data);
   else{init.body=new URLSearchParams(data);init.headers['Content-Type']='application/x-www-form-urlencoded';}
  }
  const response=await app.fetch(new Request(config.publicUrl+path,init));
  const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
  return response;
 }};
}
async function csrf(client,path='/'){const r=await client.req(path);assert.equal(r.status,200,await r.clone().text());const html=await r.text();return html.match(/(?:name="csrf" type="hidden"|type="hidden" name="csrf") value="([^"]+)"/)?.[1]??html.match(/name="csrf-token" content="([^"]+)"/)[1];}
function dates(shift=0){const start=new Date(Date.now()+(2+shift)*86400000);return {start:start.toISOString(),end:new Date(+start+25*3600000).toISOString()};}
async function book(client,car='rio',data=dates()){const c=await csrf(client);return client.req('/api/bookings','POST',{car_id:car,...data},{'Content-Type':'application/json','X-CSRF-Token':c});}
function ident(data){return new URL(data.telegram_url).searchParams.get('start');}
async function webhook(update,secret=config.webhookSecret){return browser().req('/telegram/webhook','POST',update,{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret});}
const message=(id,uid,text)=>({update_id:id,message:{from:{id:uid},chat:{id:uid,type:'private'},text}});
async function claim(id,uid=123,update=1){assert.equal((await webhook(message(update,uid,'/start '+id))).status,200);return new URL(messages.at(-1).reply_markup.inline_keyboard[0][0].url).pathname;}
const personal=()=>({name:'Тестовый Клиент',birth:'1990-01-01',phone:'+79991234567',passport:'0000000000',passport_by:'Учебный орган',passport_date:'2010-01-01',address:'Вымышленный адрес',license:'0000000000',license_date:'2020-01-01',license_until:'2040-01-01',experience:'5',consent:'on',terms:'on',fake:'on'});
async function login(client){const c=await csrf(client,'/admin/login');assert.equal((await client.req('/admin/login','POST',{csrf:c,password:config.password})).status,303);return csrf(client,'/admin');}
test('catalogue and templates render without exposing private car fields',async()=>{
 const client=browser(),r=await client.req('/api/cars'),cars=await r.json();
 assert.equal(cars.length,6);assert.ok(cars.every(c=>!('vin'in c)&&!('plate'in c)));
 const html=await (await client.req('/')).text();assert.ok(html.includes('hero-title-coral'));assert.ok(!html.includes('{%'));
 assert.equal((await client.req('/privacy')).status,200);
});
test('price, overlap, adjacent periods and simultaneous bookings',async()=>{
 const a=browser(),b=browser();const data=dates();
 const responses=await Promise.all([book(a,'rio',data),book(b,'rio',data)]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const saved=await responses.find(r=>r.status===200).json();assert.equal(saved.days,2);assert.equal(saved.total,4600);
 assert.equal((await book(a,'rio',{start:data.end,end:new Date(+new Date(data.end)+86400000).toISOString()})).status,200);
 assert.equal((await book(a,'k5',data)).status,200);
});
test('invalid dates, missing CSRF and cross-origin requests are rejected',async()=>{
 const client=browser();await csrf(client);
 assert.equal((await client.req('/api/bookings','POST',{}, {'Content-Type':'application/json'})).status,400);
 const c=await csrf(client);
 assert.equal((await client.req('/api/bookings','POST',{car_id:'rio',...dates()},{'Content-Type':'application/json','X-CSRF-Token':c,Origin:'https://evil.test'})).status,403);
 assert.equal((await book(client,'rio',{start:'2026-01-01',end:'2026-01-02'})).status,400);
 assert.equal((await book(client,'rio',{start:'2030-02-01T10:00:00Z',end:'2030-02-01T10:30:00Z'})).status,400);
});
test('expired holds release availability',async()=>{
 const client=browser(),id=ident(await (await book(client)).json());
 await pool.query("UPDATE rental_bookings SET expires=now()-interval '1 minute' WHERE id=$1",[id]);
 assert.equal((await book(client)).status,200);
 await webhook(message(2,123,'/start '+id));assert.match(messages[0].text,/недоступна/);
});
test('webhook secret enforced before body processing',async()=>{
 assert.equal((await webhook(message(1,123,'/start'),'bad')).status,403);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM rental_webhook_updates')).rows[0].n,0);
});
test('claim ownership, group rejection and webhook replay',async()=>{
 const client=browser(),id=ident(await (await book(client)).json());
 const path=await claim(id);assert.match(path,/^\/application\//);
 await webhook(message(1,123,'/start '+id));assert.equal(messages.length,1);
 await webhook(message(2,456,'/start '+id));assert.match(messages.at(-1).text,/недоступна/);
 await webhook({update_id:3,message:{from:{id:789},chat:{id:789,type:'group'},text:'/start '+id}});assert.equal(messages.length,2);
 const row=(await pool.query('SELECT form_token_hash FROM rental_bookings WHERE id=$1',[id])).rows[0];
 assert.equal(row.form_token_hash,hash(path.split('/').at(-1)));
});
test('failed Telegram delivery retries stored reply without rotating form token',async()=>{
 const client=browser(),id=ident(await (await book(client)).json()),update=message(5,123,'/start '+id);
 sendFails=true;assert.equal((await webhook(update)).status,500);
 const original=(await pool.query('SELECT form_token_hash FROM rental_bookings WHERE id=$1',[id])).rows[0].form_token_hash;
 sendFails=false;assert.equal((await webhook(update)).status,200);
 assert.equal((await pool.query('SELECT form_token_hash FROM rental_bookings WHERE id=$1',[id])).rows[0].form_token_hash,original);
});
test('consent, encryption, single-use form, admin, DOCX and XLSX',async()=>{
 const client=browser(),id=ident(await (await book(client)).json()),path=await claim(id);
 const form=personal();form.csrf=await csrf(client,path);const noConsent={...form};delete noConsent.consent;
 const invalid=await client.req(path,'POST',noConsent);assert.match(await invalid.text(),/Подтвердите/);
 assert.equal((await client.req(path,'POST',form)).status,200);
 assert.equal((await client.req(path)).status,404);
 const row=(await pool.query('SELECT * FROM rental_bookings WHERE id=$1',[id])).rows[0];
 assert.equal(row.status,'submitted');assert.ok(!row.personal.includes(form.passport));assert.equal(unseal(row.personal,config.key).name,form.name);
 assert.equal((await browser().req('/admin/report.xlsx')).status,303);
 const admin=browser(),c=await login(admin);
 assert.equal((await admin.req('/admin/'+id+'/confirm','POST',{csrf:c})).status,303);
 const doc=await admin.req('/admin/'+id+'/contract.docx');assert.equal(doc.status,200);
 const zip=await JSZip.loadAsync(await doc.arrayBuffer()),xml=await zip.file('word/document.xml').async('string');
 assert.ok(xml.includes('Экземпляр 1 из 2')&&xml.includes('Экземпляр 2 из 2'));assert.equal(xml.split('Тестовый Клиент').length-1,2);
 const report=await admin.req('/admin/report.xlsx'),wb=new ExcelJS.Workbook();await wb.xlsx.load(await report.arrayBuffer());
 assert.equal(wb.getWorksheet('Заявки').getCell('B2').value,form.name);
 assert.equal(wb.getWorksheet('Статистика').getCell('B5').value,4600);
 assert.equal((await admin.req('/admin/'+id+'/delete','POST',{csrf:c})).status,303);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM rental_bookings')).rows[0].n,0);
});
test('car tariff snapshot remains stable for existing booking',async()=>{
 const client=browser(),id=ident(await (await book(client)).json());
 await pool.query("UPDATE rental_cars SET data=jsonb_set(data,'{price}','9999') WHERE id='rio'");
 try{const row=(await pool.query('SELECT * FROM rental_bookings WHERE id=$1',[id])).rows[0];assert.equal(row.car_snapshot.price,2300);assert.equal(row.total,4600);}
 finally{await pool.query("UPDATE rental_cars SET data=jsonb_set(data,'{price}','2300') WHERE id='rio'");}
});
test('delete is scoped to the Telegram owner and retains confirmed bookings',async()=>{
 const client=browser(),first=ident(await (await book(client)).json()),second=ident(await (await book(client,'k5')).json());
 await claim(first,123,1);await claim(second,456,2);
 await pool.query("UPDATE rental_bookings SET status='confirmed' WHERE id=$1",[second]);
 await webhook(message(3,123,'/delete'));
 const rows=(await pool.query('SELECT id FROM rental_bookings')).rows;assert.deepEqual(rows.map(r=>r.id),[second]);
});
test('session tampering, expired cookies and encryption tampering fail closed',()=>{
 const s={sid:'abc',csrf:'def',admin:true,exp:Date.now()+100000};
 const cookie=signSession(s,config.secret);
 assert.equal(readSession('renta_session='+cookie,config.secret).admin,true);
 assert.equal(readSession('renta_session='+cookie+'x',config.secret),null);
 assert.equal(readSession('renta_session='+signSession({...s,exp:0},config.secret),config.secret),null);
 const ciphertext=seal({name:'test'},config.key);
 assert.throws(()=>unseal(ciphertext.replace(/.$/,ciphertext.endsWith('A')?'B':'A'),config.key));
});
test('login rotates CSRF and requires it for admin mutations',async()=>{
 const admin=browser(),old=await csrf(admin,'/admin/login');
 await admin.req('/admin/login','POST',{csrf:old,password:config.password});
 assert.equal((await admin.req('/admin/logout','POST',{csrf:old})).status,400);
 const c=await csrf(admin,'/admin');assert.equal((await admin.req('/admin/logout','POST',{csrf:c})).status,303);
 assert.equal((await admin.req('/admin')).status,303);
});

test('admin can configure webhook without exposing the bot token',async()=>{
 const admin=browser(),c=await login(admin);
 const denied=await admin.req('/admin/telegram/setup','POST',{csrf:'invalid'});
 assert.equal(denied.status,400);assert.equal(messages.length,0);
 const response=await admin.req('/admin/telegram/setup','POST',{csrf:c});
 assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes('Telegram подключён'));assert.ok(!html.includes(config.botToken));
 const setup=messages.find(p=>p.secret_token);
 assert.equal(setup.url,config.publicUrl+'/telegram/webhook');assert.equal(setup.secret_token,config.webhookSecret);assert.equal(setup.drop_pending_updates,false);
});
