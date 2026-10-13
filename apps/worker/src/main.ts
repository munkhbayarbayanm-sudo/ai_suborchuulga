import { loadConfig } from '@mongolsub/config';
import { createInspectionWorker } from './worker';
const runtime = await createInspectionWorker(loadConfig());
console.info(JSON.stringify({ event: 'worker_ready' }));
async function stop() { await runtime.close(); process.exit(0); }
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
