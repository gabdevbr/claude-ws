/**
 * Environment configuration loader - reads from parent claude-ws .env
 * Falls back to sensible defaults for standalone operation
 */
import path from 'path';
import { fileURLToPath } from 'url';

export interface EnvConfig {
  port: number;
  apiAccessKey: string;
  anthropicBaseUrl: string;
  anthropicAuthToken: string;
  anthropicModel: string;
  anthropicDefaultOpusModel: string;
  anthropicDefaultSonnetModel: string;
  anthropicDefaultHaikuModel: string;
  dataDir: string;
  logLevel: string;
  nodeEnv: string;
}

/** Provider keys that can be overridden per-request via proxy headers. */
export interface ProviderKeyOverrides {
  anthropicBaseUrl?: string;
  anthropicAuthToken?: string;
  anthropicModel?: string;
  anthropicDefaultOpusModel?: string;
  anthropicDefaultSonnetModel?: string;
  anthropicDefaultHaikuModel?: string;
}

/** Header names used by the proxy to inject provider keys. */
export const PROVIDER_HEADER_MAP: Record<keyof ProviderKeyOverrides, string> = {
  anthropicBaseUrl: 'x-provider-anthropic-base-url',
  anthropicAuthToken: 'x-provider-anthropic-auth-token',
  anthropicModel: 'x-provider-anthropic-model',
  anthropicDefaultOpusModel: 'x-provider-anthropic-default-opus-model',
  anthropicDefaultSonnetModel: 'x-provider-anthropic-default-sonnet-model',
  anthropicDefaultHaikuModel: 'x-provider-anthropic-default-haiku-model',
};

/** Extract provider key overrides from request headers. */
export function extractProviderOverrides(headers: Record<string, string | string[] | undefined>): ProviderKeyOverrides {
  const overrides: ProviderKeyOverrides = {};
  for (const [key, headerName] of Object.entries(PROVIDER_HEADER_MAP)) {
    const value = headers[headerName];
    if (typeof value === 'string' && value.length > 0) {
      overrides[key as keyof ProviderKeyOverrides] = value;
    }
  }
  return overrides;
}

export function loadEnvConfig(): EnvConfig {
  const model = process.env.ANTHROPIC_MODEL ?? '';
  // Data dir: use AGENTIC_SDK_DATA_DIR, or DATA_DIR, or default to project-root/data
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const dataDir = process.env.AGENTIC_SDK_DATA_DIR
    ?? process.env.DATA_DIR
    ?? path.join(projectRoot, 'data');

  return {
    port: parseInt(process.env.AGENTIC_SDK_PORT ?? process.env.PORT ?? '3100', 10),
    apiAccessKey: process.env.API_ACCESS_KEY ?? '',
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
    anthropicAuthToken: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
    anthropicModel: model,
    anthropicDefaultOpusModel: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? model,
    anthropicDefaultSonnetModel: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? model,
    anthropicDefaultHaikuModel: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? model,
    dataDir,
    logLevel: process.env.LOG_LEVEL ?? 'debug',
    nodeEnv: process.env.NODE_ENV ?? 'development',
  };
}
