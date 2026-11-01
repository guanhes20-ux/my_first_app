import nunjucks from 'nunjucks';
import {templates} from './generated.mjs';
import {token,hash,equal,seal,unseal,signSession,readSession} from './security.mjs';
import {HttpError,period,personalData} from './validation.mjs';
import {transaction,expire} from './db.mjs';
import {handleUpdate,telegramApi,labels} from './telegram.mjs';
import {report,contract} from './documents.mjs';
const VERSION='2026-10-27-v1';
class MemoryLoader extends nunjucks.Loader{
 getSource(name){return templates[name]?{src:templates[name],path:name,noCache:true}:null;}
}
const renderer=new nunjucks.Environment(new MemoryLoader(),{autoescape:true,throwOnUndefined:false});
const localTime=value=>new Date(+new Date(value)+7200000).toISOString().replace('Z','+02:00');
export function createApp({pool,config,send=telegramApi(config.botToken)}){
 function decorate(row){return {...row,car:row.car_snapshot,personal:row.personal?unseal(row.personal,config.key):{},start:localTime(row.start_at),end:localTime(row.end_at),status_label:labels[row.status]};}
 async function limited(key,max){
  const row=(await pool.query("INSERT INTO rental_rate_limits(key,count,reset_at) VALUES($1,1,now()+interval '10 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rental_rate_limits.reset_at<now() THEN 1 ELSE rental_rate_limits.count+1 END,reset_at=CASE WHEN rental_rate_limits.reset_at<now() THEN now()+interval '10 minutes' ELSE rental_rate_limits.reset_at END RETURNING count",[key])).rows[0];
  if(row.count>max)throw new HttpError(429,'Слишком много запросов. Повторите позже.');
 }
 return {
  async fetch(request){
   const url=new URL(request.url),path=url.pathname;
   let session=readSession(request.headers.get('cookie'),config.secret);
   if(!session)session={sid:token(),csrf:token(),admin:false,exp:Date.now()+7200000};
   let newCookie=false;
   const result=(body,status=200,type='text/html; charset=utf-8')=>new Response(body,{status,headers:{'Content-Type':type}});
   const json=(data,status=200)=>result(JSON.stringify(data),status,'application/json; charset=utf-8');
   const redirect=location=>new Response(null,{status:303,headers:{Location:location}});
   const render=(name,data={})=>result(renderer.render(name,{demo:config.demo,session,...data}));
   async function body(jsonBody=false){
    const length=Number(request.headers.get('content-length')??0);
    if(length>32768)throw new HttpError(413,'Слишком большой запрос.');
    const reader=request.body?.getReader(),chunks=[];let size=0;
    if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw new HttpError(413,'Слишком большой запрос.');}chunks.push(value);}}
    const text=Buffer.concat(chunks).toString('utf8');
    try{
     if(jsonBody){const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}
     if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))throw Error();
     return Object.fromEntries(new URLSearchParams(text));
    }catch{throw new HttpError(400,'Некорректные данные запроса.');}
   }
   function csrf(provided){
    if(!equal(provided,session.csrf))throw new HttpError(400,'Обновите страницу и повторите действие.');
    const origin=request.headers.get('origin');
    if(origin&&origin!==new URL(config.publicUrl).origin)throw new HttpError(403,'Недопустимый источник запроса.');
   }
   async function route(){
    const method=request.method;
    if(path.startsWith('/static/')&&(method==='GET'||method==='HEAD')){
     const relative=path.slice(8);
     if(relative.includes('..'))throw new HttpError(404,'Не найдено.');
     return new Response(null,{status:302,headers:{Location:'https://guanhes20-ux.github.io/my_first_app/static/'+relative+url.search}});
    }
    if(path==='/health'&&method==='GET'){
     await pool.query('SELECT 1');
     return json({ok:true,service:'renta-neon-backend',demo:config.demo,telegramConfigured:!!config.botToken});
    }
    if(path==='/telegram/webhook'&&method==='POST'){
     if(!config.botToken||!config.webhookSecret)throw new HttpError(503,'Telegram ещё не настроен.');
     if(!equal(request.headers.get('X-Telegram-Bot-Api-Secret-Token'),config.webhookSecret))throw new HttpError(403,'Forbidden');
     const update=await body(true);
     if(!Number.isSafeInteger(update.update_id)||update.update_id<0)throw new HttpError(400,'Invalid update');
     await handleUpdate(pool,config,update,send);
     return json({ok:true});
    }
    if(path==='/'&&method==='GET'){newCookie=true;return render('index.html');}
    if(path==='/api/cars'&&method==='GET'){
     const rows=(await pool.query('SELECT data FROM rental_cars ORDER BY id')).rows;
     return json(rows.map(({data})=>{const {plate,vin,...car}=data;return car;}));
    }
    if(path==='/api/bookings'&&method==='POST'){
     csrf(request.headers.get('X-CSRF-Token'));
     await limited('booking:'+session.sid,20);
     const data=await body(true),p=period(data);
     if(typeof data.car_id!=='string')throw new HttpError(400,'Выберите автомобиль.');
     const booking=await transaction(pool,async client=>{
      // Every booking for this car serializes on the same row across isolates.
      const car=(await client.query('SELECT data FROM rental_cars WHERE id=$1 FOR UPDATE',[data.car_id])).rows[0]?.data;
      if(!car)throw new HttpError(400,'Выберите автомобиль.');
      await expire(client);
      const conflict=await client.query("SELECT id FROM rental_bookings WHERE car_id=$1 AND status IN ('hold','submitted','confirmed') AND start_at<$2 AND end_at>$3 LIMIT 1",[car.id,p.end,p.start]);
      if(conflict.rowCount)throw new HttpError(409,'На эти даты автомобиль уже занят. Выберите другие даты или автомобиль.');
      const id=token(),total=p.days*car.price;
      await client.query("INSERT INTO rental_bookings(id,car_id,car_snapshot,start_at,end_at,days,total,status,expires) VALUES($1,$2,$3,$4,$5,$6,$7,'hold',now()+interval '30 minutes')",[id,car.id,car,p.start,p.end,p.days,total]);
      return {telegram_url:'https://t.me/'+config.bot+'?start='+id,days:p.days,total};
     });
     return json(booking);
    }
    const application=path.match(/^\/application\/([A-Za-z0-9_-]{43})$/);
    if(application&&(method==='GET'||method==='POST')){
     const formHash=hash(application[1]);
     const booking=(await pool.query("SELECT * FROM rental_bookings WHERE form_token_hash=$1 AND status='hold' AND expires>now() AND form_expires>now()",[formHash])).rows[0];
     if(!booking)throw new HttpError(404,'Ссылка истекла или анкета уже отправлена.');
     let error=null;
     if(method==='POST'){
      const form=await body();csrf(form.csrf);
      try{
       const personal=personalData(form,booking,config.demo);
       const saved=await pool.query("UPDATE rental_bookings SET personal=$1,consent_at=now(),consent_version=$2,status='submitted',form_token_hash=NULL WHERE id=$3 AND form_token_hash=$4 AND status='hold' AND expires>now() AND form_expires>now()",[seal(personal,config.key),VERSION,booking.id,formHash]);
       if(!saved.rowCount)throw new HttpError(409,'Время оформления истекло.');
       return render('message.html',{title:'Анкета отправлена',message:'Менеджер проверит заявку и документы. Заявка сама по себе не является подписанным договором. Вернитесь в бот и отправьте /status.'});
      }catch(exc){if(exc.status!==400)throw exc;error=exc.message;}
     }
     newCookie=true;
     const record=decorate(booking);
     return render('application.html',{booking:{...record,start:record.start,end:record.end},car:record.car,error});
    }
    if(path==='/privacy'&&method==='GET')return render('privacy.html',{operator:config.operator,details:config.details,version:VERSION});
    if(path==='/admin/login'&&(method==='GET'||method==='POST')){
     let error=null;
     if(method==='POST'){
      const form=await body();csrf(form.csrf);
      await limited('login:'+session.sid,10);
      await limited('login:global',100);
      if(equal(hash(form.password??''),hash(config.password))){
       session={sid:token(),csrf:token(),admin:true,exp:Date.now()+7200000};newCookie=true;return redirect('/admin');
      }
      error='Неверный пароль';
     }
     newCookie=true;return render('login.html',{error});
    }
    if(path==='/admin'||path.startsWith('/admin/')){
     if(!session.admin)return redirect('/admin/login');
     if(path==='/admin/logout'&&method==='POST'){
      const form=await body();csrf(form.csrf);session={sid:token(),csrf:token(),admin:false,exp:Date.now()+7200000};newCookie=true;return redirect('/');
     }
     if(path==='/admin'&&method==='GET'){
      await expire(pool);
      const page=Math.max(1,Math.min(10000,Number(url.searchParams.get('page'))||1));
      const rows=(await pool.query('SELECT * FROM rental_bookings ORDER BY created DESC LIMIT 100 OFFSET $1',[(Math.floor(page)-1)*100])).rows;
      const stats=(await pool.query("SELECT count(*)::int AS total,count(DISTINCT telegram_id) FILTER(WHERE personal IS NOT NULL)::int AS clients,coalesce(sum(total) FILTER(WHERE status='confirmed'),0)::bigint AS revenue FROM rental_bookings")).rows[0];
      return render('admin.html',{records:rows.map(decorate),...stats});
     }
     if(path==='/admin/report.xlsx'&&method==='GET'){
      const rows=(await pool.query('SELECT * FROM rental_bookings ORDER BY start_at LIMIT 10001')).rows;
      if(rows.length>10000)throw new HttpError(413,'Слишком много заявок для одной выгрузки.');
      const response=result(await report(rows.map(decorate)),200,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      response.headers.set('Content-Disposition','attachment; filename="rental-report.xlsx"');return response;
     }
     const doc=path.match(/^\/admin\/([A-Za-z0-9_-]{43})\/contract\.docx$/);
     if(doc&&method==='GET'){
      const row=(await pool.query("SELECT * FROM rental_bookings WHERE id=$1 AND status='confirmed'",[doc[1]])).rows[0];
      if(!row)throw new HttpError(404,'Не найдено.');
      const response=result(await contract(decorate(row),config),200,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      response.headers.set('Content-Disposition','attachment; filename="contract-'+row.id.slice(0,10)+'-2-copies.docx"');return response;
     }
     const action=path.match(/^\/admin\/([A-Za-z0-9_-]{43})\/(confirm|cancel|delete)$/);
     if(action&&method==='POST'){
      const form=await body();csrf(form.csrf);
      if(action[2]==='confirm')await pool.query("UPDATE rental_bookings SET status='confirmed' WHERE id=$1 AND status='submitted'",[action[1]]);
      if(action[2]==='cancel')await pool.query("UPDATE rental_bookings SET status='cancelled',form_token_hash=NULL WHERE id=$1 AND status IN ('hold','submitted','confirmed')",[action[1]]);
      if(action[2]==='delete')await pool.query('DELETE FROM rental_bookings WHERE id=$1',[action[1]]);
      return redirect('/admin');
     }
    }
    throw new HttpError(404,'Страница не найдена.');
   }
   let response;
   try{response=await route();}
   catch(error){
    if(!error.status)console.error('Request failed',{code:error.code??'internal'}); // No secrets, tokens or document fields.
    const status=error.status??500,message=error.status?error.message:'Сервис временно недоступен. Повторите запрос.';
    response=path.startsWith('/api/')||path==='/telegram/webhook'?json({error:message},status):result(renderer.render('message.html',{session,title:'Ошибка',message}),status);
    if(status===429)response.headers.set('Retry-After','600');
   }
   const headers=response.headers;
   headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('Cache-Control','no-store');
   headers.set('Content-Security-Policy',"default-src 'self'; img-src 'self' data: https://guanhes20-ux.github.io; style-src 'self' https://guanhes20-ux.github.io; script-src 'self' https://guanhes20-ux.github.io; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
   if(config.publicUrl.startsWith('https:'))headers.set('Strict-Transport-Security','max-age=31536000');
   if(newCookie)headers.append('Set-Cookie','renta_session='+signSession(session,config.secret)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200'+(config.publicUrl.startsWith('https:')?'; Secure':''));
   return response;
  }
 };
}
