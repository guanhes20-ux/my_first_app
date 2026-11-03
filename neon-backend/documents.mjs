export async function report(rows){
 const {default:ExcelJS}=await import('exceljs');
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Заявки');
 sheet.addRow(['ID','Клиент','Телефон','Автомобиль','Получение (Калининград)','Возврат (Калининград)','Сутки','Сумма, ₽','Статус','Создана']);
 for(const r of rows)sheet.addRow([r.id,r.personal.name??'',r.personal.phone??'',r.car.name,r.start,r.end,r.days,r.total,r.status,r.created.toISOString()]);
 sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter='A1:J1';
 sheet.columns.forEach(c=>c.width=26);
 const summary=workbook.addWorksheet('Статистика');
 summary.addRows([['Показатель','Значение'],['Всего заявок',rows.length],['Уникальных клиентов',new Set(rows.filter(r=>r.personal.name).map(r=>r.telegram_id??r.id)).size],['Подтверждено',rows.filter(r=>r.status==='confirmed').length],['Сумма подтвержденных заявок, ₽',rows.filter(r=>r.status==='confirmed').reduce((n,r)=>n+r.total,0)],['Это сумма договоров, а не учёт фактических оплат','']]);
 const counts=new Map();for(const r of rows)counts.set(r.car.name,(counts.get(r.car.name)??0)+1);for(const row of counts)summary.addRow(row);
 return workbook.xlsx.writeBuffer();
}
export async function contract(r,config){
 const {Document,Packer,Paragraph,HeadingLevel,PageBreak}=await import('docx');
 const children=[];
 const add=text=>children.push(new Paragraph(text));
 for(const copy of [1,2]){
  if(copy===2)children.push(new Paragraph({children:[new PageBreak()]}));
  children.push(new Paragraph({text:'ДОГОВОР АРЕНДЫ ТРАНСПОРТНОГО СРЕДСТВА БЕЗ ЭКИПАЖА',heading:HeadingLevel.HEADING_1}));
  add('Экземпляр '+copy+' из 2. № '+r.id.slice(0,10)+'. г. Калининград');
  add('УЧЕБНЫЙ ШАБЛОН. Требуется проверка реквизитов, условий и документов сторонами перед подписанием.');
  add('Арендодатель: '+config.operator+'. '+config.details);
  const p=r.personal,c=r.car;
  add('Арендатор: '+p.name+', дата рождения '+p.birth+'; паспорт '+p.passport+', выдан '+p.passport_by+' '+p.passport_date+'; адрес: '+p.address+'; телефон: '+p.phone+'. ВУ '+p.license+', выдано '+p.license_date+', действительно до '+p.license_until+'.');
  add('1. Предмет и срок');
  add('Автомобиль '+c.name+', '+c.year+' г., госномер '+c.plate+', VIN '+c.vin+'. Срок: '+r.start+' — '+r.end+' (UTC+02:00). Передача и возврат оформляются актами.');
  add('2. Плата и обеспечительный платёж');
  add('Тариф '+c.price+' ₽ за начатые 24 часа. '+r.days+' суток; сумма '+r.total+' ₽. Обеспечительный платёж '+c.deposit+' ₽ не входит в арендную плату. Порядок оплаты, основания удержания и срок возврата: [согласовать и заполнить].');
  add('3. Права и обязанности');
  add('Арендодатель передаёт исправный автомобиль с документами и действующим ОСАГО с допустимым кругом водителей. Арендатор использует автомобиль по назначению, соблюдает ПДД, возвращает его в согласованном состоянии с учётом нормального износа. Условия обслуживания, ремонта, разрешённая территория, лимит пробега и топливо: [согласовать].');
  add('4. Ответственность и прекращение');
  add('Ответственность определяется законодательством РФ, в том числе § 3 главы 34 ГК РФ. Повреждения, расходы и причинная связь документируются. Порядок действий при ДТП, страхование, досрочное прекращение, продление, просрочка возврата и урегулирование споров: [согласовать]. Условия, ограничивающие обязательные права потребителя, не применяются.');
  add('5. Подписи и акт передачи / возврата');
  add('Договор составлен в двух экземплярах равной силы, по одному каждой стороне. Отправка анкеты и подтверждение менеджером не заменяют подписание.');
  add('Передача: дата ______ пробег ______ топливо ______ комплектность ______ повреждения ______');
  add('Возврат: дата ______ пробег ______ топливо ______ комплектность ______ повреждения ______');
  add('Арендодатель __________ /__________/  Арендатор __________ /__________/');
 }
 return Packer.toBuffer(new Document({sections:[{children}]}));
}
