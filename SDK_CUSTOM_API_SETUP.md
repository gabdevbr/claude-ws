# SDK Mode & Custom API Configuration Guide

**Status:** ✓ Verified - Your application is configured in SDK mode with custom API endpoint

## Overview

This document describes how your application is configured to use the Claude Agent SDK with a custom API endpoint at `https://llm-hub.roxane.one` instead of Anthropic's default API.

## Current Configuration

### ✓ What's Working

1. **Provider Mode: SDK** ✓
   - Application uses `ClaudeSDKProvider` (not CLI mode)
   - Default behavior when `CLAUDE_PROVIDER` is not set to `'cli'`
   - Set in: `src/lib/providers/index.ts:33-37`

2. **Custom API Endpoint** ✓
   - Configured: `https://llm-hub.roxane.one`
   - Set in: `.env.local`
   - Automatically routed through proxy

3. **Proxy Infrastructure** ✓
   - Local proxy: `http://localhost:8054/api/proxy/anthropic`
   - Intercepts all Anthropic SDK calls
   - Forwards to custom endpoint with API key

4. **Models** ✓
   - All tiers (Haiku/Sonnet/Opus) configured to use: `glm-4.7`
   - Custom model available on custom API endpoint
   - Set in: `.env.local`

5. **SDK Initialization Flags** ✓
   - File checkpointing enabled: `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1`
   - Tasks system enabled: `CLAUDE_CODE_ENABLE_TASKS=true`
   - Set in: `src/lib/agent-manager.ts:9-13`

## Architecture & Request Flow

### 1. Application Startup

```
server.ts startup
    ↓
initAnthropicProxy() runs (line 14-15)
    ↓
- Reads ANTHROPIC_BASE_URL from .env.local
- Sets ANTHROPIC_PROXIED_BASE_URL = https://llm-hub.roxane.one
- Sets ANTHROPIC_BASE_URL = http://localhost:8054/api/proxy/anthropic
- Wraps process.env with interceptor
```

### 2. Agent Execution

```
User creates task/attempt
    ↓
agentManager.start() called
    ↓
Gets active provider: ClaudeSDKProvider
    ↓
SDK client initialized with ANTHROPIC_BASE_URL
    ↓
    = http://localhost:8054/api/proxy/anthropic
```

### 3. API Request Flow

```
SDK makes request to: /v1/messages
    ↓ (targets ANTHROPIC_BASE_URL)
Proxy receives: POST /api/proxy/anthropic/v1/messages
    ↓ (route.ts:96-233)
Extracts path: /v1/messages
    ↓
Target URL: https://llm-hub.roxane.one/v1/messages
    ↓
Adds headers: x-api-key: [ANTHROPIC_API_KEY]
    ↓
Forwards request to custom endpoint
    ↓
Response returned to SDK
```

### 4. File Structure

```
Request Flow Control:
├── server.ts (line 14-15)
│   └── initAnthropicProxy()
│       └── src/lib/anthropic-proxy-setup.ts
│
Provider Selection:
├── src/lib/providers/index.ts
│   ├── getActiveProvider() → checks CLAUDE_PROVIDER
│   └── Returns ClaudeSDKProvider by default
│
Proxy Endpoint:
├── src/app/api/proxy/anthropic/[[...path]]/route.ts
│   ├── proxyRequest() (line 96-233)
│   ├── fetchWithRetry() (line 32-83)
│   └── Uses ANTHROPIC_PROXIED_BASE_URL as target
│
Configuration:
├── .env.local
│   ├── ANTHROPIC_API_KEY
│   ├── ANTHROPIC_BASE_URL
│   ├── ANTHROPIC_DEFAULT_HAIKU_MODEL
│   ├── ANTHROPIC_DEFAULT_SONNET_MODEL
│   └── ANTHROPIC_DEFAULT_OPUS_MODEL
│
SDK Setup:
└── src/lib/agent-manager.ts (line 9-13)
    ├── CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = '1'
    └── CLAUDE_CODE_ENABLE_TASKS = 'true'
```

## Verification

### Quick Check

Run the verification script to check configuration:

```bash
npx tsx scripts/verify-sdk-api-config.ts
```

Expected output:
```
✓ Provider Mode: SDK mode is active
✓ Active Provider: ClaudeSDKProvider is loaded
✓ ANTHROPIC_API_KEY: API key is set
✓ Model (HAIKU): Set to glm-4.7
✓ Model (SONNET): Set to glm-4.7
✓ Model (OPUS): Set to glm-4.7
```

### Server Diagnostics

Start the server and check diagnostics endpoint:

```bash
# Terminal 1: Start server
pnpm dev

# Terminal 2: Check configuration
curl http://localhost:8054/api/diagnostics/sdk-config | jq .
```

Expected response (key fields):
```json
{
  "provider": {
    "mode": "(SDK mode - default)",
    "active": "ClaudeSDKProvider"
  },
  "environment": {
    "ANTHROPIC_BASE_URL": "http://localhost:8054/api/proxy/anthropic",
    "ANTHROPIC_PROXIED_BASE_URL": "https://llm-hub.roxane.one"
  },
  "verification": {
    "isSDKMode": true,
    "hasApiKey": true,
    "customEndpointConfigured": true,
    "allGood": true
  }
}
```

### Test API Flow

```bash
# Make a test request to the custom API through the proxy
chmod +x scripts/test-api-flow.sh
./scripts/test-api-flow.sh
```

This script:
1. Checks if server is running
2. Fetches SDK configuration from diagnostics endpoint
3. Tests count_tokens endpoint through proxy
4. Verifies request reaches custom API

## Environment Variables

### Required

```bash
# API endpoint and key
ANTHROPIC_API_KEY="user-1770718134349-key"
ANTHROPIC_BASE_URL="https://llm-hub.roxane.one"

# Model configuration
ANTHROPIC_DEFAULT_HAIKU_MODEL="glm-4.7"
ANTHROPIC_DEFAULT_SONNET_MODEL="glm-4.7"
ANTHROPIC_DEFAULT_OPUS_MODEL="glm-4.7"

# Server
PORT=8054
NODE_ENV=development
```

### Auto-Set by Application

```bash
# Set by initAnthropicProxy()
ANTHROPIC_PROXIED_BASE_URL="https://llm-hub.roxane.one"

# Set by agent-manager.ts
CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING="1"
CLAUDE_CODE_ENABLE_TASKS="true"
```

### Optional

```bash
# Force CLI mode (not recommended)
CLAUDE_PROVIDER="cli"  # Only set if you want CLI mode

# Proxy retry configuration
ANTHROPIC_API_RETRY_TIMES="3"
ANTHROPIC_API_RETRY_DELAY_MS="10000"
```

## How to Use

### Starting the Server

```bash
# Development mode (with hot reload)
pnpm dev

# Using PM2 (production)
pnpm pm2
pm2 restart claudews
```

### Creating an Agent Task

1. Open the application in browser (http://localhost:8054)
2. Create a new task
3. Run agent with a prompt
4. Agent will:
   - Use ClaudeSDKProvider
   - Send requests through proxy
   - Route to custom API at https://llm-hub.roxane.one
   - Receive responses from custom model (glm-4.7)

### Monitoring Requests

Watch server logs to see proxy forwarding:

```bash
pnpm dev
# or
pm2 logs claudews
```

Look for logs like:
```
[AnthropicProxy] ===== proxyRequest called =====
Start proxying request
targetUrl: https://llm-hub.roxane.one/v1/messages
End proxying request
```

## Troubleshooting

### Issue: Requests still going to api.anthropic.com

**Check:**
1. Server logs show `ANTHROPIC_PROXIED_BASE_URL` being set?
2. `ANTHROPIC_BASE_URL` in `.env.local` is correct?
3. `initAnthropicProxy()` called in `server.ts`?

**Fix:**
- Restart server to reinitialize proxy

### Issue: 401 Unauthorized from custom API

**Check:**
1. `ANTHROPIC_API_KEY` value is correct
2. API key is sent in request headers (look for `x-api-key` in logs)
3. Custom API expects `x-api-key` header format

**Fix:**
- Update `ANTHROPIC_API_KEY` in `.env.local`
- Restart server

### Issue: Model not found error

**Check:**
1. Model name matches custom API available models
2. Custom API supports the model format

**Fix:**
- Update `ANTHROPIC_DEFAULT_*_MODEL` in `.env.local`
- Ask custom API admin for available model names
- Restart server

### Issue: Requests timing out

**Check:**
1. Custom API endpoint is reachable
2. Network connectivity to custom domain

**Fix:**
- Increase `ANTHROPIC_API_RETRY_DELAY_MS`
- Check network connectivity: `curl https://llm-hub.roxane.one`

## Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `server.ts` | Server startup, proxy initialization | 14-15 |
| `src/lib/anthropic-proxy-setup.ts` | Proxy setup logic | 37-61 |
| `src/lib/providers/index.ts` | Provider selection | 33-37 |
| `src/app/api/proxy/anthropic/[[...path]]/route.ts` | Request forwarding | 96-233 |
| `.env.local` | Configuration | Custom values |
| `src/lib/agent-manager.ts` | SDK initialization | 9-13 |
| `src/app/api/diagnostics/sdk-config/route.ts` | Diagnostics endpoint | New |
| `scripts/verify-sdk-api-config.ts` | Verification script | New |
| `scripts/test-api-flow.sh` | API flow test | New |

## Summary

✓ Your application is properly configured to:
1. Run in SDK mode (using ClaudeSDKProvider)
2. Route all API requests through a local proxy
3. Forward requests to your custom API endpoint
4. Authenticate using your API key
5. Use custom models (glm-4.7)

**Next Steps:**
1. Run `npx tsx scripts/verify-sdk-api-config.ts` to verify configuration
2. Start server with `pnpm dev`
3. Check diagnostics at `http://localhost:8054/api/diagnostics/sdk-config`
4. Create a test task and verify logs show requests going to custom endpoint
5. Monitor logs during execution to ensure everything works as expected
