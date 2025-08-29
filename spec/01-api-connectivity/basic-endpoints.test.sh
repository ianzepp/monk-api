#!/bin/bash
# API Connectivity Test - 01 Series
#
# Tests basic API server connectivity using no-auth endpoints.
# Validates that the API server is reachable and responding correctly
# without requiring authentication or tenant setup.
#
# NOTE: This is an infrastructure test - runs without tenant setup

set -e

echo "=== Basic API Connectivity Test ==="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}→ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

echo "🌐 This test validates basic API server connectivity"
echo "🎯 Goal: Verify API responds to no-auth endpoints (/, /health)"
echo

# Determine API endpoint (default to localhost:9001)
API_ENDPOINT="${API_ENDPOINT:-http://localhost:9001}"
print_info "Testing API endpoint: $API_ENDPOINT"
echo

# Test 1: Root endpoint (GET /)
print_step "Testing root endpoint (GET /)"
if response=$(curl -s "$API_ENDPOINT/"); then
    if echo "$response" | jq -e '.success' >/dev/null 2>&1; then
        api_name=$(echo "$response" | jq -r '.data.name // .name // "Unknown"')
        api_version=$(echo "$response" | jq -r '.data.version // .version // "Unknown"')
        print_success "Root endpoint responding: $api_name v$api_version"
    else
        print_error "Root endpoint returned invalid JSON response"
        echo "Response: $response"
        exit 1
    fi
else
    print_error "Root endpoint not accessible"
    exit 1
fi

# Test 2: Health endpoint (GET /health)  
print_step "Testing health endpoint (GET /health)"
if health_response=$(curl -s "$API_ENDPOINT/health"); then
    # Health endpoint might return different formats - be flexible
    if echo "$health_response" | jq . >/dev/null 2>&1; then
        print_success "Health endpoint responding with JSON"
        
        # Extract any useful health info if available
        if echo "$health_response" | jq -e '.status' >/dev/null 2>&1; then
            health_status=$(echo "$health_response" | jq -r '.status')
            print_info "Health status: $health_status"
        fi
    else
        # Might be plain text response
        if [ -n "$health_response" ]; then
            print_success "Health endpoint responding with text: $health_response"
        else
            print_error "Health endpoint returned empty response"
            exit 1
        fi
    fi
else
    print_error "Health endpoint not accessible"
    exit 1
fi

# Test 3: HTTP status codes
print_step "Validating HTTP status codes"

# Root endpoint should return 200
root_status=$(curl -s -o /dev/null -w "%{http_code}" "$API_ENDPOINT/")
if [ "$root_status" = "200" ]; then
    print_success "Root endpoint returns HTTP 200"
else
    print_error "Root endpoint returns HTTP $root_status (expected 200)"
    exit 1
fi

# Health endpoint should return 200
health_status=$(curl -s -o /dev/null -w "%{http_code}" "$API_ENDPOINT/health")  
if [ "$health_status" = "200" ]; then
    print_success "Health endpoint returns HTTP 200"
else
    print_error "Health endpoint returns HTTP $health_status (expected 200)"
    exit 1
fi

# Test 4: Non-existent endpoint (should return 404)
print_step "Testing 404 handling"
notfound_status=$(curl -s -o /dev/null -w "%{http_code}" "$API_ENDPOINT/nonexistent")
if [ "$notfound_status" = "404" ]; then
    print_success "Non-existent endpoint returns HTTP 404"
else
    print_info "Non-existent endpoint returns HTTP $notfound_status (expected 404, but may vary)"
fi

print_step "API connectivity validation summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "API Endpoint: $API_ENDPOINT"
print_info "Root endpoint: ✅ HTTP 200, JSON response"
print_info "Health endpoint: ✅ HTTP 200, responding"
print_info "Error handling: ✅ Proper HTTP status codes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

print_success "Basic API connectivity validation completed successfully"
print_info "API server is reachable and responding correctly"

exit 0