#!/bin/bash

# API Request Flow Test Script
# This script tests that API requests are correctly routed to the custom endpoint

set -e

echo "======================================================================"
echo "API REQUEST FLOW TEST"
echo "======================================================================"
echo ""

# Check if server is running
echo "📋 Checking if server is running on port 8054..."
if ! curl -s http://localhost:8054/api/diagnostics/sdk-config > /dev/null; then
  echo "✗ Server is not running on port 8054"
  echo ""
  echo "To start the server, run:"
  echo "  pnpm dev"
  echo ""
  exit 1
fi

echo "✓ Server is running"
echo ""

# Get SDK diagnostics
echo "📋 Fetching SDK Configuration..."
DIAGNOSTICS=$(curl -s http://localhost:8054/api/diagnostics/sdk-config)

echo ""
echo "📊 SDK Configuration Report:"
echo "---"
echo "$DIAGNOSTICS" | jq '.' 2>/dev/null || echo "$DIAGNOSTICS"
echo ""

# Extract key values
IS_SDK_MODE=$(echo "$DIAGNOSTICS" | jq -r '.verification.isSDKMode' 2>/dev/null || echo "unknown")
HAS_API_KEY=$(echo "$DIAGNOSTICS" | jq -r '.verification.hasApiKey' 2>/dev/null || echo "unknown")
CUSTOM_ENDPOINT=$(echo "$DIAGNOSTICS" | jq -r '.verification.customEndpointConfigured' 2>/dev/null || echo "unknown")
PROXY_INIT=$(echo "$DIAGNOSTICS" | jq -r '.verification.proxyInitialized' 2>/dev/null || echo "unknown")
ALL_GOOD=$(echo "$DIAGNOSTICS" | jq -r '.verification.allGood' 2>/dev/null || echo "unknown")

echo "📋 Verification Results:"
echo "---"
[[ "$IS_SDK_MODE" == "true" ]] && echo "✓ SDK Mode: YES" || echo "✗ SDK Mode: NO"
[[ "$HAS_API_KEY" == "true" ]] && echo "✓ API Key: CONFIGURED" || echo "✗ API Key: MISSING"
[[ "$CUSTOM_ENDPOINT" == "true" ]] && echo "✓ Custom Endpoint: CONFIGURED" || echo "✗ Custom Endpoint: NOT CONFIGURED"
[[ "$PROXY_INIT" == "true" ]] && echo "✓ Proxy Initialized: YES" || echo "✗ Proxy Initialized: NO"
[[ "$ALL_GOOD" == "true" ]] && echo "✓ Overall Status: READY" || echo "⚠ Overall Status: CHECK ABOVE"
echo ""

# Test count_tokens endpoint
echo "📋 Testing count_tokens endpoint (this should route to custom API)..."
echo ""

MESSAGES_JSON='{"messages":[{"role":"user","content":"Hello, how are you?"}],"model":"glm-4.7"}'

# Make request to proxy endpoint
echo "Making request to: http://localhost:8054/api/proxy/anthropic/v1/messages/count_tokens"
echo "Payload: $MESSAGES_JSON"
echo ""

RESPONSE=$(curl -s -X POST \
  http://localhost:8054/api/proxy/anthropic/v1/messages/count_tokens \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -d "$MESSAGES_JSON" \
  -w "\n%{http_code}")

# Split response and status code
HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | head -n-1)

echo "HTTP Status: $HTTP_STATUS"
echo "Response:"
echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"
echo ""

if [ "$HTTP_STATUS" == "200" ]; then
  echo "✓ Request successful - proxy is working!"
elif [ "$HTTP_STATUS" == "401" ]; then
  echo "⚠ 401 Unauthorized - Check API key configuration"
elif [ "$HTTP_STATUS" == "404" ]; then
  echo "⚠ 404 Not Found - Endpoint may not exist on custom API"
else
  echo "⚠ HTTP $HTTP_STATUS - Check server logs for details"
fi

echo ""
echo "======================================================================"
echo "End of test"
echo "======================================================================"
