import pg from 'pg';
import {attachDatabasePool} from '@neon/functions';
export function makePool(connectionString){
 if(!connectionString)throw Error('DATABASE_URL required');
 const pool=new pg.Pool({connectionString,max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});
 attachDatabasePool(pool);
 return pool;
}
export async function transaction(pool,fn){
 const client=await pool.connect();
 try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}
 catch(error){await client.query('ROLLBACK');throw error;}
 finally{client.release();}
}
export async function expire(client){
 await client.query("UPDATE rental_bookings SET status='expired',form_token_hash=NULL WHERE status='hold' AND expires < now()");
}
