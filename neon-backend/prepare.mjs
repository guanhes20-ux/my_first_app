import {readFile,writeFile,readdir} from 'node:fs/promises';
const root = new URL('../',import.meta.url);
const templates={};
for(const name of await readdir(new URL('templates/',root))){
 if(!name.endsWith('.html'))continue;
 let text=await readFile(new URL('templates/'+name,root),'utf8');
 // Port the small Python-specific subset of Jinja to Nunjucks.
 text=text.replaceAll("r.id[:10]","r.id | truncate(10, true, '')");
 text=text.replace(/r\.personal\.get\('([^']+)'(?:,'([^']*)')?\)/g,(_,key,fallback)=>"r.personal."+key+" | default('"+(fallback??"")+"', true)");
 text=text.replace("{{ {'hold':'Ожидает анкету','submitted':'На проверке','confirmed':'Подтверждена','cancelled':'Отменена','expired':'Истекла'}.get(r.status,r.status) }}","{{ r.status_label }}");
 templates[name]=text;
}
templates['admin.html']=templates['admin.html'].replace('<div class="table-wrap">','<section class="notice"><h2>Telegram</h2><p>{{ telegramStatus }}</p><form method="post" action="/admin/telegram/save" autocomplete="off"><input name="csrf" type="hidden" value="{{ session.csrf }}"><label>Токен Telegram-бота из BotFather<input name="bot_token" type="password" required autocomplete="new-password" maxlength="200"></label><p>Токен сохраняется зашифрованным и не отображается в журнале или на странице.</p><button class="button">Сохранить токен и подключить Telegram</button></form>{% if telegramConfigured %}<form method="post" action="/admin/telegram/setup"><input name="csrf" type="hidden" value="{{ session.csrf }}"><button class="button">Подключить webhook Telegram</button></form>{% endif %}</section><div class="table-wrap">');
templates['index.html']=templates['index.html'].replace('<main>','<main>{% if demo %}<div class="notice">Учебная версия для проверки проекта. Используйте вымышленные данные. Анкету можно заполнить прямо на сайте; Telegram доступен после подключения бота.</div>{% endif %}');
templates['index.html']=templates['index.html'].replace('Продолжить в Telegram ↗','{% if demo %}Продолжить оформление ↗{% else %}Продолжить в Telegram ↗{% endif %}');
const frontend=await readFile(new URL('static/app.js',root),'utf8');
const cars=JSON.parse(await readFile(new URL('cars.json',root),'utf8'));
await writeFile(new URL('generated.mjs',import.meta.url),'export const templates='+JSON.stringify(templates)+';\nexport const cars='+JSON.stringify(cars)+';\nexport const frontend='+JSON.stringify(frontend)+';\n');
