// Verify the actual deployment bundle, including DOCX/XLSX, before publishing it.
import assert from 'node:assert/strict';
import pg from 'pg';
import {token,seal} from './security.mjs';
const secret='bundle-test-secret-'.repeat(3),key=Buffer.alloc(32,9).toString('base64'),password='bundle-test-admin-123456';
Object.assign(process.env,{APP_SECRET:secret,DATA_KEY:key,ADMIN_PASSWORD:password,PUBLIC_URL:'https://bundle.example',DEMO_MODE:'true'});
delete process.env.TELEGRAM_BOT_TOKEN;
const {default:app}=await import('./dist/index.mjs');
let cookie='';
async function request(path,method='GET',data){
 const init={method,headers:{cookie,Origin:'https://bundle.example'}};
 if(data){init.body=new URLSearchParams(data);init.headers['Content-Type']='application/x-www-form-urlencoded';}
 const r=await app.fetch(new Request('https://bundle.example'+path,init));
 if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
 return r;
}
const login=await request('/admin/login');assert.equal(login.status,200);
const csrf=(await login.text()).match(/name="csrf-token" content="([^"]+)"/)[1];
assert.equal((await request('/admin/login','POST',{csrf,password})).status,303);
const dashboard=await request('/admin');assert.equal(dashboard.status,200);
assert.ok((await dashboard.text()).includes('Заявки и поездки'));
const db=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1}),id=token();
try{
 const car=(await db.query("SELECT data FROM rental_cars WHERE id='rio'")).rows[0].data;
 const personal={name:'Клиент Проверки',birth:'1990-01-01',phone:'+79991234567',passport:'0000000000',passport_by:'Учебный орган',passport_date:'2010-01-01',address:'Вымышленный адрес',license:'0000000000',license_date:'2020-01-01',license_until:'2040-01-01',experience:'5'};
 await db.query("INSERT INTO rental_bookings(id,car_id,car_snapshot,start_at,end_at,days,total,status,expires,personal) VALUES($1,'rio',$2,now()+interval '2 days',now()+interval '3 days',1,2300,'confirmed',now()+interval '30 minutes',$3)",[id,car,seal(personal,key)]);
 const doc=await request('/admin/'+id+'/contract.docx');assert.equal(doc.status,200,await doc.clone().text());assert.ok((await doc.arrayBuffer()).byteLength>1000);
 const report=await request('/admin/report.xlsx');assert.equal(report.status,200,await report.clone().text());assert.ok((await report.arrayBuffer()).byteLength>1000);
 console.log('PASS: deployment bundle renders admin and exports DOCX/XLSX.');
}finally{await db.query('DELETE FROM rental_bookings WHERE id=$1',[id]);await db.end();}
process.exit(0);
