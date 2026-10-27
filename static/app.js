const staticDemo=!!document.querySelector('meta[name="static-demo"]');
const assetRoot=new URL('.',document.currentScript.src);
const grid=document.querySelector('#cars'), dialog=document.querySelector('#booking-dialog'), form=document.querySelector('#booking-form');
const money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
let cars=[],selected;
function render(filter='Все'){
 const shown=cars.filter(c=>filter==='Все'||c.category===filter);
 document.querySelector('#car-count').textContent=shown.length+' авто';
 grid.replaceChildren();
 shown.forEach(c=>{
  const card=document.createElement('article');card.className='car-card';
  card.innerHTML='<div class="car-picture"><span class="car-category"></span><img src="" alt=""><span class="car-year"></span></div><div class="car-body"><h3></h3><div class="car-specs"><span>◉ Автомат</span><span>♧ 5 мест</span><span class="fuel"></span></div><div class="car-bottom"><div><strong></strong><small> / сутки</small></div><button class="select-car" type="button">Выбрать ↗</button></div></div>';
  card.querySelector('img').src=new URL('car.svg',assetRoot).href;
  card.querySelector('.car-category').textContent=c.category;
  card.querySelector('.car-year').textContent=c.year;
  card.querySelector('h3').textContent=c.name;
  card.querySelector('.fuel').textContent=c.fuel+' / 100 км';
  card.querySelector('strong').textContent=money(c.price);
  card.querySelector('img').alt='Иллюстрация '+c.name+' (условная)';
  card.querySelector('.select-car').addEventListener('click',()=>open(c));grid.append(card);
 });
}
function localDate(offset=0){const d=new Date(Date.now()+offset*86400000);return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function open(car){
 selected=car;document.querySelector('#selected-name').textContent=car.name;
 document.querySelector('#start-date').min=localDate();document.querySelector('#end-date').min=localDate();
 document.querySelector('#start-date').value=localDate(1);document.querySelector('#end-date').value=localDate(4);
 document.querySelector('#booking-error').textContent='';
 document.querySelector('#submit-booking').classList.remove('hidden');document.querySelector('#telegram-link').classList.add('hidden');
 form.querySelectorAll('input').forEach(i=>i.disabled=false);
 document.querySelector('#deposit').textContent='Возвратный залог: '+money(car.deposit)+' — отдельно.';
 calculate();dialog.showModal();
}
function dates(){return ['start','end'].map(p=>document.querySelector('#'+p+'-date').value+'T'+document.querySelector('#'+p+'-time').value+':00+02:00');}
function calculate(){if(!selected)return;const [a,b]=dates().map(d=>new Date(d));const days=Math.ceil((b-a)/86400000);document.querySelector('#duration').textContent=days>0?days+' сут. × '+money(selected.price):'Проверьте период';document.querySelector('#total').textContent=days>0?money(days*selected.price):'— ₽';}
form.querySelectorAll('input').forEach(i=>i.addEventListener('input',calculate));
document.querySelector('#close-dialog').addEventListener('click',()=>dialog.close());
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});render(b.dataset.filter);}));
form.addEventListener('submit',async e=>{
 e.preventDefault();const btn=document.querySelector('#submit-booking'),error=document.querySelector('#booking-error');btn.disabled=true;error.textContent='';
 try{
  const [start,end]=dates();
  if(staticDemo){
   const startDate=new Date(start),endDate=new Date(end);
   if(!Number.isFinite(+startDate)||!Number.isFinite(+endDate)||startDate<Date.now()+1800000||endDate-startDate<3600000||endDate-startDate>90*86400000)throw new Error('Выберите будущий период от 1 часа до 90 суток.');
   const link=document.querySelector('#telegram-link');
   link.href='https://t.me/Renta_Car_777_bot';
   link.textContent='Открыть Telegram-бота ↗';
   link.classList.remove('hidden');btn.classList.add('hidden');
   form.querySelectorAll('input').forEach(i=>i.disabled=true);
   error.textContent='Демонстрационный расчёт готов. Бронирование не создаётся. Бот, анкета, договоры и отчёты работают после отдельного запуска Python-сервера.';
   return;
  }
  const response=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':document.querySelector('meta[name=csrf-token]').content},body:JSON.stringify({car_id:selected.id,start,end})});
  const result=await response.json().catch(()=>({error:'Сервис временно недоступен. Обновите страницу.'}));
  if(!response.ok)throw new Error(result.error||'Не удалось оформить заявку.');
  const link=document.querySelector('#telegram-link');link.href=result.telegram_url;link.classList.remove('hidden');btn.classList.add('hidden');form.querySelectorAll('input').forEach(i=>i.disabled=true);
  error.textContent='Заявка сохранена. Нажмите «Открыть Telegram», затем Start / Запустить в боте.';
 }catch(err){error.textContent=err.message;}finally{btn.disabled=false;}
});
fetch(staticDemo?new URL('cars.json',assetRoot):'/api/cars').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{cars=data;render();}).catch(()=>{grid.textContent='Не удалось загрузить автомобили. Обновите страницу.';});
