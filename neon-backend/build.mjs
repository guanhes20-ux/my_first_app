import {build} from 'esbuild';
import './prepare.mjs';
await build({entryPoints:['index.mjs'],outfile:'dist/index.mjs',bundle:true,platform:'node',target:'node24',format:'esm',minify:true,banner:{js:"import{createRequire as __cr}from'node:module';import{fileURLToPath as __fu}from'node:url';import{dirname as __dn}from'node:path';const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);"},external:['pg-native']});
