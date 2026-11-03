import {makePool} from './db.mjs';
import {configuration} from './security.mjs';
import {createApp} from './app.mjs';
const config=configuration(process.env);
export default createApp({pool:makePool(process.env.DATABASE_URL),config});
