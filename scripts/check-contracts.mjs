import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const source=process.argv[2];
if(!source){console.error('Usage: npm run check-contracts -- /path/to/weezy-ios');process.exit(2);}
const names=['app-image-editor','app-image-settings','app-sets','app-order','manual-collection','collection-claims','shopify-admin-auth','product-handle','catalogue-order','catalogue-sets'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');let drift=0;
for(const name of names){try{const [admin,mobile]=await Promise.all([readFile(new URL(`../contracts/${name}.mjs`,import.meta.url)),readFile(resolve(source,'service',name+'.mjs'))]);const same=hash(admin)===hash(mobile);console.log(`${same?'MATCH':'DIFFERENT'} ${name}.mjs`);if(!same)drift++;}catch{console.error(`MISSING ${name}.mjs`);drift++;}}
process.exitCode=drift?1:0;
