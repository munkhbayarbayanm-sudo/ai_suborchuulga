import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '../packages/database/src/index';

const admin = new PrismaClient();
const schema = `phase04_migrate_${randomUUID().replaceAll('-', '')}`;
if (!/^phase04_migrate_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe migration fixture schema');

const url = new URL(process.env.DATABASE_URL ?? '');
url.searchParams.set('schema', schema);

try {
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      [
        resolve('packages/database/node_modules/prisma/build/index.js'),
        'migrate',
        'deploy',
        '--schema',
        resolve('packages/database/prisma/schema.prisma'),
      ],
      {
        shell: false,
        windowsHide: true,
        env: { ...process.env, DATABASE_URL: url.href },
        stdio: 'inherit',
      },
    );
    child.once('error', rejectRun);
    child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error('Fresh-schema migrations failed.')));
  });
  console.info(JSON.stringify({ event: 'fresh_schema_migrations_passed', schema }));
} finally {
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
}
