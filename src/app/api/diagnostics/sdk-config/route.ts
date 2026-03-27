/**
 * SDK Configuration Diagnostics Endpoint
 *
 * Provides detailed information about SDK mode and custom API configuration.
 * Used to verify the application is properly configured for the custom endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getActiveProvider } from '@/lib/providers';
import { getProxyConfig } from '@/lib/anthropic-proxy-setup';

const log = createLogger('SDKDiagnostics');

interface DiagnosticReport {
  timestamp: string;
  provider: {
    mode: string;
    active: string;
  };
  environment: {
    CLAUDE_PROVIDER: string | undefined;
    ANTHROPIC_API_KEY: string | undefined;
    ANTHROPIC_BASE_URL: string | undefined;
    ANTHROPIC_PROXIED_BASE_URL: string | undefined;
    NODE_ENV: string | undefined;
  };
  models: {
    HAIKU: string | undefined;
    SONNET: string | undefined;
    OPUS: string | undefined;
  };
  proxy: {
    proxyUrl: string;
    targetUrl: string;
    isInitialized: boolean;
  };
  sdkFlags: {
    CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: string | undefined;
    CLAUDE_CODE_ENABLE_TASKS: string | undefined;
  };
  verification: {
    isSDKMode: boolean;
    hasApiKey: boolean;
    customEndpointConfigured: boolean;
    proxyInitialized: boolean;
    allGood: boolean;
  };
}

export async function GET(request: NextRequest) {
  try {
    // Get provider info
    let activeProviderName = 'unknown';
    try {
      const provider = getActiveProvider();
      activeProviderName = provider.constructor.name;
    } catch (e) {
      log.error({ error: e }, 'Failed to get active provider');
    }

    // Get proxy configuration
    let proxyConfig = {
      proxyUrl: 'unknown',
      targetUrl: 'https://api.anthropic.com',
      isInitialized: false,
    };
    try {
      proxyConfig = getProxyConfig();
    } catch (e) {
      log.error({ error: e }, 'Failed to get proxy config');
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const maskedApiKey = apiKey
      ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 5)}`
      : undefined;

    const report: DiagnosticReport = {
      timestamp: new Date().toISOString(),
      provider: {
        mode: process.env.CLAUDE_PROVIDER || '(SDK mode - default)',
        active: activeProviderName,
      },
      environment: {
        CLAUDE_PROVIDER: process.env.CLAUDE_PROVIDER,
        ANTHROPIC_API_KEY: maskedApiKey,
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
        ANTHROPIC_PROXIED_BASE_URL: process.env.ANTHROPIC_PROXIED_BASE_URL,
        NODE_ENV: process.env.NODE_ENV,
      },
      models: {
        HAIKU: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
        SONNET: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL,
        OPUS: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL,
      },
      proxy: proxyConfig,
      sdkFlags: {
        CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING,
        CLAUDE_CODE_ENABLE_TASKS: process.env.CLAUDE_CODE_ENABLE_TASKS,
      },
      verification: {
        isSDKMode: activeProviderName === 'ClaudeSDKProvider' || !process.env.CLAUDE_PROVIDER || process.env.CLAUDE_PROVIDER !== 'cli',
        hasApiKey: !!apiKey,
        customEndpointConfigured:
          process.env.ANTHROPIC_PROXIED_BASE_URL === 'https://llm-hub.roxane.one' ||
          (process.env.ANTHROPIC_BASE_URL === 'https://llm-hub.roxane.one' &&
            !process.env.ANTHROPIC_PROXIED_BASE_URL),
        proxyInitialized: proxyConfig.isInitialized,
        allGood: false, // Will be computed below
      },
    };

    // Compute overall status
    report.verification.allGood =
      report.verification.isSDKMode &&
      report.verification.hasApiKey &&
      report.verification.customEndpointConfigured &&
      activeProviderName === 'ClaudeSDKProvider';

    // Log diagnostic summary
    log.info(
      {
        sdkMode: report.verification.isSDKMode,
        apiKeySet: report.verification.hasApiKey,
        customEndpoint: report.verification.customEndpointConfigured,
        proxyInit: report.verification.proxyInitialized,
        allGood: report.verification.allGood,
        provider: activeProviderName,
      },
      'SDK diagnostics reported'
    );

    return NextResponse.json(report, {
      status: report.verification.allGood ? 200 : 206,
      headers: {
        'content-type': 'application/json',
      },
    });
  } catch (error) {
    log.error({ error }, 'Diagnostics request failed');
    return NextResponse.json(
      {
        error: 'Diagnostics failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
