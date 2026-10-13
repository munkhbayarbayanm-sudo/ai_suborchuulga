import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {PrismaClient} from '../packages/database/src/index';
const db=new PrismaClient();const schema=`phase03_migrate_${randomUUID().replaceAll('-','')}`;
const url=new URL(process.env.DATABASE_URL??'');url.searchParams.set('schema',schema);
if(!/^phase03_migrate_[a-f0-9]{32}$/.test(schema))throw Error('Unsafe migration fixture schema');
try {
  await new Promise<void>((done,reject)=>{const child=spawn(process.execPath,[resolve('packages/database/node_modules/prisma/build/index.js'),'migrate','deploy','--schema',resolve('packages/database/prisma/schema.prisma')],{shell:false,windowsHide:true,env:{...process.env,DATABASE_URL:url.href},stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?done():reject(Error('Fresh-schema migrations failed.')));});
  console.info(JSON.stringify({event:'fresh_schema_migrations_passed',schema}));
}finally{
  // Exact generated identifier is controlled and guarded; no user/shared schema.
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.$disconnect();
}
