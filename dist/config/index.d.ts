import { Config } from '../types/index.js';
/**
 * Carrega a configuração salva
 */
export declare function loadConfig(): Config;
/**
 * Salva a configuração
 */
export declare function saveConfig(config: Config): void;
/**
 * Solicita as API keys ao usuário (interativo)
 */
export declare function promptApiKeys(): Promise<Config>;
/**
 * Verifica se há pelo menos uma API key configurada
 */
export declare function hasApiKey(config: Config): boolean;
/**
 * Obtém a configuração, solicitando ao usuário se necessário
 */
export declare function ensureConfig(): Promise<Config>;
//# sourceMappingURL=index.d.ts.map