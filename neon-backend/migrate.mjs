import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {cars} from './generated.mjs';
export async function migrate(pool){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(7823471001)");
  await client.query(await readFile(new URL('schema.sql',import.meta.url),'utf8'));
  for(const car of cars)await client.query('INSERT INTO rental_cars(id,data) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[car.id,car]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const url=process.env.DATABASE_URL_UNPOOLED;
 if(!url||new URL(url).hostname.includes('-pooler'))throw Error('Migration requires direct DATABASE_URL_UNPOOLED');
 const pool=new pg.Pool({connectionString:url,max:1});
 try{await migrate(pool);console.log('Schema and catalogue ready.');}finally{await pool.end();}
}
