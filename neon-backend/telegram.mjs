import {token,hash} from './security.mjs';
import {transaction,expire} from './db.mjs';
export const labels={hold:'Ожидает анкету',submitted:'На проверке',confirmed:'Подтверждена',cancelled:'Отменена',expired:'Истекла'};
export function telegramApi(botToken){
 return async(method,payload)=>{
  let result;
  try{
   const response=await fetch('https://api.telegram.org/bot'+botToken+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
   result=await response.json();
   if(!response.ok||!result.ok)throw Error();
  }catch{throw Error('Telegram API request failed');}
  return result.result;
 };
}
export async function handleUpdate(pool,config,update,send){
 const reply=await transaction(pool,async client=>{
  const inserted=await client.query('INSERT INTO rental_webhook_updates(update_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING update_id',[update.update_id]);
  if(!inserted.rowCount){
   const row=(await client.query('SELECT reply,delivered FROM rental_webhook_updates WHERE update_id=$1 FOR UPDATE',[update.update_id])).rows[0];
   return row.delivered?null:row.reply;
  }
  const message=update.message,uid=message?.from?.id;
  let payload=null;
  if(Number.isSafeInteger(uid)&&uid>0&&message?.chat?.id===uid&&message.chat.type==='private'){
   await client.query('SELECT pg_advisory_xact_lock($1::bigint)',[uid]);
   await expire(client);
   const text=String(message.text??'').trim();
   const [command,arg]=text.split(/\s+/);
   const cmd=command.split('@')[0];
   payload={chat_id:uid,text:'Выберите автомобиль и даты на сайте, затем нажмите «Продолжить в Telegram». Команды: /status, /cancel, /delete. Не отправляйте документы в чат.',reply_markup:{inline_keyboard:[[{text:'Открыть сайт',url:config.publicUrl}]]}};
   if(cmd==='/start'&&arg){
    const row=(await client.query("SELECT * FROM rental_bookings WHERE id=$1 AND status='hold' AND expires>now() FOR UPDATE",[arg])).rows[0];
    if(!row||(row.telegram_id!==null&&String(row.telegram_id)!==String(uid))){
     payload.text='Заявка недоступна или время оформления истекло. Выберите автомобиль на сайте.';
    }else{
     const formToken=token();
     await client.query("UPDATE rental_bookings SET telegram_id=$1,form_token_hash=$2,form_expires=LEAST(expires,now()+interval '20 minutes') WHERE id=$3",[uid,hash(formToken),arg]);
     payload.text='Автомобиль и даты сохранены на 30 минут с момента выбора. Заполните анкету на сайте. Не отправляйте паспорт и права в этот чат.';
     payload.reply_markup={inline_keyboard:[[{text:'Заполнить защищённую анкету',url:config.publicUrl+'/application/'+formToken}]]};
    }
   }else if(cmd==='/status'){
    const rows=(await client.query('SELECT id,status FROM rental_bookings WHERE telegram_id=$1 ORDER BY created DESC LIMIT 5',[uid])).rows;
    payload.text=rows.map(r=>r.id.slice(0,10)+': '+labels[r.status]).join('\n')||'У вас пока нет заявок.';
   }else if(cmd==='/cancel'){
    await client.query("UPDATE rental_bookings SET status='cancelled',form_token_hash=NULL WHERE telegram_id=$1 AND status IN ('hold','submitted')",[uid]);
    payload.text='Незавершённые заявки отменены. Для отмены подтверждённой аренды свяжитесь с арендодателем.';
   }else if(cmd==='/delete'){
    await client.query("DELETE FROM rental_bookings WHERE telegram_id=$1 AND status!='confirmed'",[uid]);
    payload.text='Неподтверждённые заявки удалены. По данным подтверждённого договора обратитесь к оператору. Сообщения в Telegram удаляются отдельно.';
   }
  }
  await client.query('UPDATE rental_webhook_updates SET reply=$1,delivered=$2 WHERE update_id=$3',[payload,payload===null,update.update_id]);
  return payload;
 });
 if(reply){
  await send('sendMessage',reply);
  // Do not retain expiring form links once delivery is acknowledged.
  await pool.query('UPDATE rental_webhook_updates SET delivered=true,reply=NULL WHERE update_id=$1',[update.update_id]);
 }
}
