#!/bin/bash

# Cleanup script for Admin Panel
cd "$(dirname "$0")"

echo "🧹 Cleaning up Admin Panel..."

# Kill processes on port 8053
lsof -ti:8053 | xargs kill -9 2>/dev/null
echo "✅ Killed processes on port 8053"

# Remove .next directory
rm -rf .next
echo "✅ Removed .next directory"

echo "✨ Cleanup complete! Ready to start."
