import type {Config} from '@mongolsub/config';
import {AppError} from '@mongolsub/domain';
import {OpenAiLocalizationProvider,type TranslationProvider} from '@mongolsub/localization';

class DisabledLocalizationProvider implements TranslationProvider {
  readiness(){return {status:'UNAVAILABLE' as const,message:'Localization provider is disabled on this server.',provider:'disabled',model:''};}
  async localize():Promise<never>{throw new AppError('LOCALIZATION_PROVIDER_UNAVAILABLE','Localization provider is disabled on this server.',503);}
}

export function localizationProviderFromConfig(config:Config):TranslationProvider {
  if(config.LOCALIZATION_PROVIDER==='disabled')return new DisabledLocalizationProvider();
  return new OpenAiLocalizationProvider({apiKey:config.LOCALIZATION_API_KEY,model:config.LOCALIZATION_MODEL,baseUrl:config.LOCALIZATION_BASE_URL,timeoutMs:config.LOCALIZATION_TIMEOUT_MS,maxOutputTokens:config.LOCALIZATION_MAX_OUTPUT_TOKENS,maxAttempts:config.LOCALIZATION_MAX_ATTEMPTS,retryBaseMs:config.LOCALIZATION_RETRY_BASE_MS});
}
