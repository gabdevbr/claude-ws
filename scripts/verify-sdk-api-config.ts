#!/usr/bin/env tsx
/**
 * Verification Script: SDK Mode & Custom API Configuration
 *
 * Verifies that:
 * 1. Application is in SDK mode (not CLI mode)
 * 2. Custom API endpoint is properly configured
 * 3. Proxy infrastructure is initialized
 * 4. Environment variables are correct
 * 5. Model configuration is compatible
 */

import { createLogger } from '../src/lib/logger';
import { getActiveProvider, getProvider } from '../src/lib/providers';
import { getProxyConfig } from '../src/lib/anthropic-proxy-setup';
import { homedir } from 'os';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const log = createLogger('VerifySDKConfig');

interface VerificationResult {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
  details?: Record<string, any>;
}

const results: VerificationResult[] = [];

function pass(name: string, message: string, details?: Record<string, any>) {
  results.push({ name, status: 'PASS', message, details });
  console.log(`✓ ${name}: ${message}`);
}

function warn(name: string, message: string, details?: Record<string, any>) {
  results.push({ name, status: 'WARN', message, details });
  console.log(`⚠ ${name}: ${message}`);
}

function fail(name: string, message: string, details?: Record<string, any>) {
  results.push({ name, status: 'FAIL', message, details });
  console.log(`✗ ${name}: ${message}`);
}

console.log('\n' + '='.repeat(70));
console.log('SDK MODE & CUSTOM API CONFIGURATION VERIFICATION');
console.log('='.repeat(70) + '\n');

// ============================================================================
// PHASE 1: Provider Mode Verification
// ============================================================================

console.log('📋 PHASE 1: Provider Mode Verification\n');

const claudeProviderEnv = process.env.CLAUDE_PROVIDER;
if (!claudeProviderEnv || claudeProviderEnv !== 'cli') {
  pass('Provider Mode', 'SDK mode is active (CLAUDE_PROVIDER not set to "cli")', {
    CLAUDE_PROVIDER: claudeProviderEnv || '(not set)',
  });
} else {
  fail('Provider Mode', 'CLI mode is active - application should use SDK', {
    CLAUDE_PROVIDER: claudeProviderEnv,
  });
}

// Get active provider
try {
  const activeProvider = getActiveProvider();
  const providerId = activeProvider.constructor.name;
  if (providerId === 'ClaudeSDKProvider') {
    pass('Active Provider', 'ClaudeSDKProvider is loaded', {
      provider: providerId,
    });
  } else if (providerId === 'ClaudeCLIProvider') {
    fail('Active Provider', 'ClaudeCLIProvider is loaded - should be SDK', {
      provider: providerId,
    });
  }
} catch (e) {
  warn('Active Provider', `Could not determine active provider: ${e instanceof Error ? e.message : String(e)}`);
}

// ============================================================================
// PHASE 2: Environment Variables Verification
// ============================================================================

console.log('\n📋 PHASE 2: Environment Variables Verification\n');

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
if (anthropicApiKey) {
  pass('ANTHROPIC_API_KEY', 'API key is set', {
    value: `${anthropicApiKey.substring(0, 20)}...${anthropicApiKey.substring(anthropicApiKey.length - 5)}`,
  });
} else {
  fail('ANTHROPIC_API_KEY', 'API key is not set', {
    value: 'undefined',
  });
}

const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
if (anthropicBaseUrl) {
  if (anthropicBaseUrl.includes('/api/proxy/anthropic')) {
    pass('ANTHROPIC_BASE_URL', 'Set to local proxy endpoint (correct for initialized proxy)', {
      value: anthropicBaseUrl,
    });
  } else {
    warn('ANTHROPIC_BASE_URL', 'Set to custom endpoint (will be converted by initAnthropicProxy)', {
      value: anthropicBaseUrl,
    });
  }
} else {
  fail('ANTHROPIC_BASE_URL', 'Not set', {
    value: 'undefined',
  });
}

const anthropicProxiedBaseUrl = process.env.ANTHROPIC_PROXIED_BASE_URL;
if (anthropicProxiedBaseUrl) {
  if (anthropicProxiedBaseUrl === 'https://llm-hub.roxane.one') {
    pass('ANTHROPIC_PROXIED_BASE_URL', 'Correctly set to custom API endpoint', {
      value: anthropicProxiedBaseUrl,
    });
  } else {
    warn('ANTHROPIC_PROXIED_BASE_URL', 'Set to custom API but not the expected endpoint', {
      value: anthropicProxiedBaseUrl,
      expected: 'https://llm-hub.roxane.one',
    });
  }
} else {
  warn('ANTHROPIC_PROXIED_BASE_URL', 'Not set yet - will be set by initAnthropicProxy()', {
    value: 'undefined',
  });
}

// ============================================================================
// PHASE 3: Model Configuration Verification
// ============================================================================

console.log('\n📋 PHASE 3: Model Configuration Verification\n');

const models = {
  HAIKU: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
  SONNET: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL,
  OPUS: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL,
};

Object.entries(models).forEach(([tier, model]) => {
  if (model) {
    if (model === 'glm-4.7') {
      pass(`Model (${tier})`, `Set to glm-4.7 (custom model)`, {
        model,
      });
    } else {
      warn(`Model (${tier})`, `Set to custom model (verify compatibility with custom API)`, {
        model,
      });
    }
  } else {
    warn(`Model (${tier})`, 'Not set - will use SDK defaults', {
      model: 'undefined',
    });
  }
});

// ============================================================================
// PHASE 4: Proxy Configuration Verification
// ============================================================================

console.log('\n📋 PHASE 4: Proxy Configuration Verification\n');

try {
  const proxyConfig = getProxyConfig();
  pass('Proxy Config Available', 'getProxyConfig() accessible', {
    proxyUrl: proxyConfig.proxyUrl,
    targetUrl: proxyConfig.targetUrl,
    isInitialized: proxyConfig.isInitialized,
  });

  if (proxyConfig.targetUrl === 'https://llm-hub.roxane.one') {
    pass('Target URL', 'Proxy configured to forward to custom endpoint', {
      targetUrl: proxyConfig.targetUrl,
    });
  } else if (proxyConfig.targetUrl.includes('api.anthropic.com')) {
    warn('Target URL', 'Proxy would forward to Anthropic API (not custom endpoint)', {
      targetUrl: proxyConfig.targetUrl,
    });
  }
} catch (e) {
  warn('Proxy Config', `Could not load proxy config: ${e instanceof Error ? e.message : String(e)}`);
}

// ============================================================================
// PHASE 5: File Configuration Verification
// ============================================================================

console.log('\n📋 PHASE 5: File Configuration Verification\n');

// Check .env.local
const envLocalPath = join(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
  pass('.env.local', 'Configuration file exists', {
    path: envLocalPath,
  });

  try {
    const envContent = readFileSync(envLocalPath, 'utf-8');
    const hasBaseUrl = envContent.includes('ANTHROPIC_BASE_URL');
    const hasApiKey = envContent.includes('ANTHROPIC_API_KEY');
    const hasCustomModel = envContent.includes('glm-4.7');

    if (hasBaseUrl) pass('  ↳ ANTHROPIC_BASE_URL', 'Configured');
    if (hasApiKey) pass('  ↳ ANTHROPIC_API_KEY', 'Configured');
    if (hasCustomModel) pass('  ↳ Custom Model', 'Configured to use glm-4.7');
  } catch (e) {
    warn('.env.local', `Could not read content: ${e instanceof Error ? e.message : String(e)}`);
  }
} else {
  fail('.env.local', 'Configuration file not found', {
    path: envLocalPath,
  });
}

// Check Claude settings
const claudeSettingsPath = join(homedir(), '.claude', 'settings.json');
if (existsSync(claudeSettingsPath)) {
  pass('Claude Settings', 'Settings file exists', {
    path: claudeSettingsPath,
  });
} else {
  warn('Claude Settings', 'Settings file not found - will use app .env defaults', {
    path: claudeSettingsPath,
  });
}

// ============================================================================
// PHASE 6: SDK Initialization Flags
// ============================================================================

console.log('\n📋 PHASE 6: SDK Initialization Flags\n');

const sdkFileCheckpointing = process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING;
if (sdkFileCheckpointing === '1') {
  pass('SDK File Checkpointing', 'Enabled (CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1)', {
    value: sdkFileCheckpointing,
  });
} else {
  warn('SDK File Checkpointing', 'Not enabled - should be enabled', {
    value: sdkFileCheckpointing || 'undefined',
  });
}

const tasksEnabled = process.env.CLAUDE_CODE_ENABLE_TASKS;
if (tasksEnabled === 'true') {
  pass('SDK Tasks System', 'Enabled (CLAUDE_CODE_ENABLE_TASKS=true)', {
    value: tasksEnabled,
  });
} else {
  warn('SDK Tasks System', 'Not enabled - optional feature', {
    value: tasksEnabled || 'undefined',
  });
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('VERIFICATION SUMMARY');
console.log('='.repeat(70) + '\n');

const passCount = results.filter((r) => r.status === 'PASS').length;
const warnCount = results.filter((r) => r.status === 'WARN').length;
const failCount = results.filter((r) => r.status === 'FAIL').length;

console.log(`✓ PASS:  ${passCount}`);
console.log(`⚠ WARN:  ${warnCount}`);
console.log(`✗ FAIL:  ${failCount}`);

if (failCount === 0 && warnCount <= 2) {
  console.log('\n✓ Configuration looks good! Application is ready for SDK mode.\n');
  process.exit(0);
} else if (failCount === 0) {
  console.log('\n⚠ Configuration has warnings. Review above and make adjustments if needed.\n');
  process.exit(0);
} else {
  console.log('\n✗ Configuration has failures. Fix the issues above before proceeding.\n');
  process.exit(1);
}
