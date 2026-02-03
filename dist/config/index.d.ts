import { Config } from '../types/index.js';
/**
 * Loads saved configuration
 */
export declare function loadConfig(): Config;
/**
 * Saves configuration
 */
export declare function saveConfig(config: Config): void;
/**
 * Prompts user for API keys (interactive)
 */
export declare function promptApiKeys(): Promise<Config>;
/**
 * Checks if at least one API key is configured
 */
export declare function hasApiKey(config: Config): boolean;
/**
 * Gets configuration, prompting the user if necessary
 */
export declare function ensureConfig(): Promise<Config>;
//# sourceMappingURL=index.d.ts.map