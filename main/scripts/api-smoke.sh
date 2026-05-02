#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:5000/api}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
LOCATION_ID="${LOCATION_ID:-1}"

if [[ -z "${AUTH_TOKEN}" ]]; then
  echo "AUTH_TOKEN is required"
  exit 1
fi

echo "== Health =="
curl -fsS "${API_BASE_URL}/health" | head -c 200; echo

echo "== Auth Me =="
curl -fsS "${API_BASE_URL}/auth/me" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "X-Location-Id: ${LOCATION_ID}" | head -c 300; echo

echo "== Notifications =="
curl -fsS "${API_BASE_URL}/notifications?limit=20&location_id=${LOCATION_ID}" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "X-Location-Id: ${LOCATION_ID}" | head -c 300; echo

echo "Smoke script completed"
