export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=message=>{throw new HttpError(400,message);};
export const kaliningradDate=(value=new Date())=>new Date(+new Date(value)+7200000).toISOString().slice(0,10);
function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value??''))fail('Проверьте даты документов.');const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==value)fail('Проверьте даты документов.');return value;}
export function period(data,now=Date.now()){
 if(typeof data.start!=='string'||typeof data.end!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(data.start)||!/(Z|[+-]\d{2}:\d{2})$/.test(data.end))fail('Укажите даты с часовым поясом.');
 const start=new Date(data.start),end=new Date(data.end),duration=end-start;
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||+start<now+1800000||duration<3600000||duration>90*86400000)fail('Выберите будущий период от 1 часа до 90 суток.');
 return {start,end,days:Math.ceil(duration/86400000)};
}
export function personalData(form,booking,demo,now=new Date()){
 if(!form.consent||!form.terms||(demo&&!form.fake))fail('Подтвердите согласия и использование тестовых данных.');
 const keys=['name','birth','phone','passport','passport_by','passport_date','address','license','license_date','license_until','experience'];
 const p=Object.fromEntries(keys.map(k=>[k,String(form[k]??'').trim()]));
 if(Object.values(p).some(v=>!v||v.length>500))fail('Заполните все поля (не более 500 символов).');
 if(p.name.split(/\s+/).length<2||!/^\+7\d{10}$/.test(p.phone))fail('Укажите ФИО и телефон в формате +79991234567.');
 if(!/^\d{10}$/.test(p.passport)||!/^\d{10}$/.test(p.license))fail('Документы должны содержать 10 цифр.');
 const birth=date(p.birth),start=kaliningradDate(booking.start_at),today=kaliningradDate(now);
 const age=Number(start.slice(0,4))-Number(birth.slice(0,4))-(start.slice(5)<birth.slice(5)?1:0);
 if(age<21||age>100)fail('Возраст должен быть от 21 до 100 лет.');
 const issued=date(p.license_date),expiry=date(p.license_until),passport=date(p.passport_date);
 if(issued<birth||issued>today||passport<birth||passport>today||expiry<kaliningradDate(booking.end_at))fail('Проверьте даты выдачи документов и срок действия прав.');
 if(!/^\d+$/.test(p.experience)||Number(p.experience)<2||Number(p.experience)>age-16)fail('Проверьте стаж вождения.');
 return p;
}
