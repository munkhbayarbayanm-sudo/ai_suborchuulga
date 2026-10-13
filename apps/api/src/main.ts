import { loadConfig } from '@mongolsub/config';
import { createApi } from './app';
const config = loadConfig();
const app = await createApi(config);
await app.listen(config.API_PORT, config.API_HOST);
console.info(JSON.stringify({ event: 'api_listening', port: config.API_PORT }));
