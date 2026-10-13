import { access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createConnection } from 'node:net';

const pgUrl = new URL(process.env.DATABASE_URL);
const redisUrl = new URL(process.env.REDIS_URL);
if (![pgUrl.hostname, redisUrl.hostname].every(host => host === '127.0.0.1' || host === 'localhost')) throw new Error('Portable infrastructure requires loopback URLs.');
const pgPort = Number(pgUrl.port || 5432); const redisPort = Number(redisUrl.port || 6379);
const databaseName = pgUrl.pathname.slice(1);
if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(databaseName)) throw new Error('Use a simple local database identifier.');
async function isListening(port) {
  return new Promise(resolve => { const socket = createConnection({ host: '127.0.0.1', port }); socket.setTimeout(500); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); socket.once('timeout', () => { socket.destroy(); resolve(false); }); });
}
if (await isListening(pgPort) || await isListening(redisPort)) throw new Error('A configured infrastructure port is already in use. Stop the intended local process or choose free ports; do not reuse another project service.');
const EmbeddedPostgres = (await import(pathToFileURL(resolve('.tools/node_modules/embedded-postgres/dist/index.js')).href)).default;
const directory = resolve('data/portable-postgres');
const db = new EmbeddedPostgres({ databaseDir: directory, user: decodeURIComponent(pgUrl.username), password: decodeURIComponent(pgUrl.password), port: pgPort, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => console.error('Portable PostgreSQL process reported an error.') });
try { await access(resolve(directory, 'PG_VERSION')); } catch { await db.initialise(); }
await db.start();
try { await db.createDatabase(databaseName); } catch (error) { if (error?.code !== '42P04') { await db.stop(); throw new Error('Local database creation failed.'); } }
await mkdir(resolve('data/portable-redis'), { recursive: true });
const redisDirectory = resolve('.tools/redis/Redis-8.10.2-Windows-x64-msys2');
const redis = spawn(resolve(redisDirectory, 'redis-server.exe'), ['--bind', '127.0.0.1', '--port', String(redisPort), '--dir', resolve('data/portable-redis'), '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'], { windowsHide: true, stdio: 'ignore' });
let closing = false;
async function stop(exitCode = 0) {
  if (closing) return; closing = true;
  try { await promisify(execFile)(resolve(redisDirectory, 'redis-cli.exe'), ['-h', '127.0.0.1', '-p', String(redisPort), 'shutdown'], { timeout: 5000, windowsHide: true }); } catch { redis.kill(); }
  await db.stop(); process.exit(exitCode);
}
redis.once('error', () => { console.error('Portable Redis could not start.'); void stop(1); });
redis.once('exit', () => { if (!closing) { console.error('Portable Redis exited.'); void stop(1); } });
process.once('SIGINT', () => void stop()); process.once('SIGTERM', () => void stop());
for (let attempt = 0; attempt < 50 && !await isListening(redisPort); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
if (!await isListening(redisPort)) { await stop(1); }
console.info('Portable PostgreSQL and Redis ready on configured loopback ports. Data persists under data/.');
setInterval(() => {}, 1000);
