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
const cars=JSON.parse(await readFile(new URL('cars.json',root),'utf8'));
await writeFile(new URL('generated.mjs',import.meta.url),'export const templates='+JSON.stringify(templates)+';\nexport const cars='+JSON.stringify(cars)+';\n');
