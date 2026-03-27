#!/bin/sh

# Health check script for Admin Panel
# This script runs inside the container to check if the service is healthy

HOST="${HEALTH_CHECK_HOST:-localhost}"
PORT="${HEALTH_CHECK_PORT:-3001}"
ENDPOINT="${HEALTH_CHECK_ENDPOINT:-/api/health}"

# Try to connect to the health endpoint
wget -q -O - --timeout=5 --tries=1 "http://${HOST}:${PORT}${ENDPOINT}" > /dev/null 2>&1

if [ $? -eq 0 ]; then
  exit 0
else
  exit 1
fi
