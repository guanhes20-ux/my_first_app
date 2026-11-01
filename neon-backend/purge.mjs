import pg from 'pg';
const days=Number(process.env.RETENTION_DAYS??30);
if(!Number.isInteger(days)||days<1)throw Error('RETENTION_DAYS must be a positive integer');
if(!process.env.DATABASE_URL_UNPOOLED)throw Error('DATABASE_URL_UNPOOLED required');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL_UNPOOLED,max:1});
try{
 const result=await pool.query("DELETE FROM rental_bookings WHERE (status IN ('cancelled','expired') AND created < now()-($1::int*interval '1 day')) OR (status='hold' AND expires < now()-($1::int*interval '1 day'))",[days]);
 await pool.query("DELETE FROM rental_webhook_updates WHERE delivered=true AND created<now()-interval '7 days'");
 await pool.query('DELETE FROM rental_rate_limits WHERE reset_at<now()');
 console.log(JSON.stringify({deletedExpiredBookings:result.rowCount}));
}finally{await pool.end();}
