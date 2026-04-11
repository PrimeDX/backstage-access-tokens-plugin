#!/usr/bin/env bash
# test-api.sh — Runs Part 10 API tests (A1–A8) against a running Backstage instance
# Usage: bash test-api.sh [base_url]
# Default base URL: http://localhost:7007

set -euo pipefail

BASE="${1:-http://localhost:7007}"
REVOKE_WAIT_SECONDS="${SERVICE_TOKENS_REVOKE_WAIT_SECONDS:-65}"
REVOKE_POLL_INTERVAL_SECONDS="${SERVICE_TOKENS_REVOKE_POLL_INTERVAL_SECONDS:-5}"
PASS=0
FAIL=0

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

pass() { echo -e "${GREEN}✅ PASS${RESET} — $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}❌ FAIL${RESET} — $1"; FAIL=$((FAIL+1)); }
info() { echo -e "${YELLOW}▶${RESET} $1"; }
header() { echo; echo -e "${BOLD}$1${RESET}"; echo "$(printf '─%.0s' {1..60})"; }

# ── HTTP helper ───────────────────────────────────────────────────────────────
# Returns "BODY\nSTATUS_CODE" — body on all lines except last, status on last
http() {
  local method="$1"; shift
  local url="$1"; shift
  curl -s -w "\n%{http_code}" -X "$method" "$url" "$@" 2>&1 || true
}

status_of() { echo "$1" | tail -1; }
body_of()   { echo "$1" | sed '$d'; }

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$label (HTTP $actual)"
  else
    fail "$label — expected HTTP $expected, got HTTP $actual"
  fi
}

assert_json_present() {
  local label="$1" jq_expr="$2" input="$3"
  if echo "$input" | jq -e "$jq_expr" >/dev/null 2>&1; then
    pass "$label"
  else
    fail "$label — jq assertion failed: $jq_expr"
  fi
}

# ── Step A1 — Get guest token ─────────────────────────────────────────────────
header "Step A1 — Get a guest token"
info "POST $BASE/api/auth/guest/refresh"

resp=$(http POST "$BASE/api/auth/guest/refresh" \
  -H 'Content-Type: application/json')
code=$(status_of "$resp")
body=$(body_of "$resp")

if [ "$code" = "200" ]; then
  TOKEN=$(echo "$body" | jq -r '.backstageIdentity.token // empty')
  if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    fail "A1 — 200 returned but backstageIdentity.token is missing"
    echo "Body: $body"
    exit 1
  fi
  pass "A1 — guest token obtained (${TOKEN:0:40}...)"
else
  fail "A1 — expected HTTP 200, got HTTP $code — body: $body"
  exit 1
fi

# ── Step A2 — List scopes ─────────────────────────────────────────────────────
header "Step A2 — List available scopes"
info "GET $BASE/api/service-tokens/scopes"

resp=$(http GET "$BASE/api/service-tokens/scopes" \
  -H "Authorization: Bearer $TOKEN")
code=$(status_of "$resp")
body=$(body_of "$resp")

assert_status "A2 — list scopes" "200" "$code"
if [ "$code" = "200" ]; then
  info "Scopes: $(echo "$body" | jq -r '[.scopes[].id] | join(", ")' 2>/dev/null || echo '?')"
fi

# ── Step A3 — Create a service token ─────────────────────────────────────────
header "Step A3 — Create a service token"
TOKEN_NAME="test-token-$(date +%s)"
info "POST $BASE/api/service-tokens  (name: $TOKEN_NAME)"

resp=$(http POST "$BASE/api/service-tokens" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$TOKEN_NAME\",
    \"description\": \"Created by test-api.sh\",
    \"groupEntityRef\": \"group:default/platform\",
    \"scopes\": [\"catalog:read\"],
    \"expiresInDays\": 1
  }")
code=$(status_of "$resp")
body=$(body_of "$resp")

assert_status "A3 — create token" "201" "$code"
if [ "$code" = "201" ]; then
  TOKEN_ID=$(echo "$body" | jq -r '.token.id // empty')
  RAW_TOKEN=$(echo "$body" | jq -r '.rawToken // empty')
  if [ -z "$TOKEN_ID" ] || [ -z "$RAW_TOKEN" ]; then
    fail "A3 — response missing token.id or rawToken — body: $body"
    exit 1
  fi
  info "Token ID : $TOKEN_ID"
  info "Raw token: ${RAW_TOKEN:0:40}..."
else
  fail "A3 — body: $body"
  exit 1
fi

# ── Step A4 — Use raw token against Catalog API ───────────────────────────────
header "Step A4 — Raw token authenticates against Catalog API"
info "GET $BASE/api/catalog/entities?limit=1"

resp=$(http GET "$BASE/api/catalog/entities?limit=1" \
  -H "Authorization: Bearer $RAW_TOKEN")
code=$(status_of "$resp")
body=$(body_of "$resp")

assert_status "A4 — catalog access with raw token" "200" "$code"
if [ "$code" = "200" ]; then
  info "Entities returned: $(echo "$body" | jq 'length' 2>/dev/null || echo '?')"
fi

# ── Step A5 — Inspect audit log ───────────────────────────────────────────────
header "Step A5 — Inspect the audit log"
info "GET $BASE/api/service-tokens/$TOKEN_ID/audit"

resp=$(http GET "$BASE/api/service-tokens/$TOKEN_ID/audit" \
  -H "Authorization: Bearer $TOKEN")
code=$(status_of "$resp")
body=$(body_of "$resp")

assert_status "A5 — audit log accessible" "200" "$code"
if [ "$code" = "200" ]; then
  assert_json_present "A5 — audit response includes events array" '.events | type == "array"' "$body"
  info "Audit events: $(echo "$body" | jq '.events | length' 2>/dev/null || echo '?')"
  echo "$body" | jq -r '.events[] | "  \(.event)"' 2>/dev/null || true
fi

# ── Step A6 — Revoke the token ────────────────────────────────────────────────
header "Step A6 — Revoke the token"
info "DELETE $BASE/api/service-tokens/$TOKEN_ID"

resp=$(http DELETE "$BASE/api/service-tokens/$TOKEN_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "test-api.sh revocation test"}')
code=$(status_of "$resp")

assert_status "A6 — revoke token" "204" "$code"

# ── Step A7 — Confirm raw token is rejected ───────────────────────────────────
header "Step A7 — Revoked token is rejected after revocation"
info "GET $BASE/api/catalog/entities?limit=1  (with revoked raw token)"
info "Polling up to ${REVOKE_WAIT_SECONDS}s for revocation to take effect"
info "Tutorial/dev-guide path sets serviceTokens.cacheTtlSeconds: 0 for immediate rejection"

a7_passed=false
max_attempts=$(( REVOKE_WAIT_SECONDS / REVOKE_POLL_INTERVAL_SECONDS + 1 ))
for i in $(seq 1 "$max_attempts"); do
  resp=$(http GET "$BASE/api/catalog/entities?limit=1" \
    -H "Authorization: Bearer $RAW_TOKEN")
  code=$(status_of "$resp")
  if [ "$code" = "401" ]; then
    a7_passed=true
    break
  fi
  if [ "$i" -lt "$max_attempts" ]; then
    info "  attempt $i/$max_attempts — still HTTP $code, waiting ${REVOKE_POLL_INTERVAL_SECONDS}s..."
    sleep "$REVOKE_POLL_INTERVAL_SECONDS"
  fi
done

if $a7_passed; then
  pass "A7 — revoked token rejected (HTTP 401)"
else
  fail "A7 — revoked token still accepted after ${REVOKE_WAIT_SECONDS}s — expected HTTP 401, got HTTP $code"
  fail "     Hint: set serviceTokens.cacheTtlSeconds: 0 in your dev config for deterministic immediate revocation checks"
fi

# ── Step A8 — Unauthenticated request → 401 ──────────────────────────────────
header "Step A8 — Unauthenticated request is rejected"
info "POST $BASE/api/service-tokens  (no Authorization header)"

resp=$(http POST "$BASE/api/service-tokens" \
  -H "Content-Type: application/json" \
  -d '{"name":"should-fail","groupEntityRef":"group:default/platform","scopes":["catalog:read"]}')
code=$(status_of "$resp")

assert_status "A8 — unauthenticated request rejected" "401" "$code"

# ── Summary ───────────────────────────────────────────────────────────────────
echo
printf '═%.0s' {1..60}; echo
total=$((PASS+FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All $total tests passed ✅${RESET}"
else
  echo -e "${RED}${BOLD}$FAIL / $total tests FAILED ❌${RESET}  ($PASS passed)"
fi
printf '═%.0s' {1..60}; echo

[ "$FAIL" -eq 0 ]
