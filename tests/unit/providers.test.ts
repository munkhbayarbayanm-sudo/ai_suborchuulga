import { expect,it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { HttpProviders } from '../../packages/extraction/src/index';
import { loadConfig } from '../../packages/config/src/index';
it('distinguishes inference timeout, explicit cancellation and provider absence',async()=>{
  const server=createServer((_request,response)=>{const timer=setTimeout(()=>response.end('{}'),2000);response.on('close',()=>clearTimeout(timer));});server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();if(!address||typeof address==='string')throw new Error('Test server missing');
  const config={...loadConfig({DATABASE_URL:'postgres://test:test@localhost/test',REDIS_URL:'redis://localhost',EXTRACTION_PROVIDER_TOKEN:'ci-test-token'}),EXTRACTION_PROVIDER_URL:`http://127.0.0.1:${address.port}`,EXTRACTION_TIMEOUT_MS:40};
  const providers=new HttpProviders(config);const input={runId:'00000000-0000-4000-8000-000000000000',audioPath:'test.wav',language:'en' as const,align:false,diarize:false};
  try {
    await expect(providers.asr.transcribe(input)).rejects.toMatchObject({code:'SOURCE_TIMEOUT'});
    const abort=new AbortController();abort.abort();await expect(providers.asr.transcribe(input,abort.signal)).rejects.toMatchObject({code:'CANCELLED'});
    expect((await new HttpProviders({...config,EXTRACTION_PROVIDER_TOKEN:''}).asr.readiness()).state).toBe('UNAVAILABLE');
  }finally{server.closeAllConnections();server.close();await once(server,'close');}
});
