#!/usr/bin/env bash
set -euo pipefail

echo "Running secret scan..."

# 1. Ensure no .env files are tracked by git
TRACKED_ENVS=$(git ls-files | grep -iE "\.env(\..+)?$" | grep -v "\.env\.example$" || true)
if [ -n "$TRACKED_ENVS" ]; then
  echo "ERROR: Tracked .env files found:"
  echo "$TRACKED_ENVS"
  exit 1
fi

# 2. Ensure .env.example contains no secret values
if grep -E "^[A-Z0-9_]+=..+" .env.example > /dev/null 2>&1; then
  echo "ERROR: Non-empty values found in .env.example"
  exit 1
fi

echo "Secret scan passed: zero tracked secrets found."
