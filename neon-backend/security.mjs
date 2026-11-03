import {randomBytes,createHash,createHmac,timingSafeEqual,createCipheriv,createDecipheriv} from 'node:crypto';
export const token=()=>randomBytes(32).toString('base64url');
export const hash=x=>createHash('sha256').update(String(x)).digest('hex');
export function equal(a,b){const x=Buffer.from(String(a??'')),y=Buffer.from(String(b??''));return x.length===y.length&&timingSafeEqual(x,y);}
export function seal(value,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'base64'),iv);const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');}
export function unseal(value,key){const [version,iv,tag,body]=value.split('.');if(version!=='v1')throw Error('Unsupported ciphertext');const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),Buffer.from(iv,'base64url'));cipher.setAuthTag(Buffer.from(tag,'base64url'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(body,'base64url')),cipher.final()]).toString('utf8'));}
export function signSession(s,key){const body=Buffer.from(JSON.stringify(s)).toString('base64url');return body+'.'+createHmac('sha256',key).update(body).digest('base64url');}
export function readSession(cookie,key){
 try{const raw=(cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith('renta_session='))?.slice(14);if(!raw)return null;const [body,sig]=raw.split('.');if(!equal(sig,createHmac('sha256',key).update(body).digest('base64url')))return null;const s=JSON.parse(Buffer.from(body,'base64url'));return s.exp>Date.now()&&typeof s.csrf==='string'&&typeof s.sid==='string'?s:null;}catch{return null;}
}
export function configuration(env){
 const c={secret:env.APP_SECRET,key:env.DATA_KEY,password:env.ADMIN_PASSWORD,publicUrl:(env.PUBLIC_URL??'').replace(/\/$/,''),demo:env.DEMO_MODE!=='false',bot:env.BOT_USERNAME??'Renta_Car_777_bot',botToken:env.TELEGRAM_BOT_TOKEN,webhookSecret:env.TELEGRAM_WEBHOOK_SECRET,operator:env.OPERATOR_NAME??'Учебный проект — оператор не задан',details:env.OPERATOR_DETAILS??'Реквизиты не заданы'};
 if(!c.secret||c.secret.length<32||!c.password||c.password.length<16||Buffer.from(c.key??'','base64').length!==32)throw Error('APP_SECRET, DATA_KEY (32-byte base64) and ADMIN_PASSWORD required');
 const url=new URL(c.publicUrl);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('PUBLIC_URL must be HTTPS');
 if(!/^[A-Za-z0-9_]{5,32}$/.test(c.bot))throw Error('Invalid BOT_USERNAME');
 if(!c.demo&&(env.LEGAL_REVIEWED!=='true'||!env.OPERATOR_NAME||!env.OPERATOR_DETAILS||url.protocol!=='https:'))throw Error('Production requires operator details and completed review');
 if(c.botToken&&(!c.webhookSecret||!/^[-_A-Za-z0-9]{32,256}$/.test(c.webhookSecret)))throw Error('TELEGRAM_WEBHOOK_SECRET required with bot token');
 return c;
}
