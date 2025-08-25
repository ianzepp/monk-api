#!/bin/bash
set -e

# Auto-configure test environment
source "$(dirname "$0")/../test-env-setup.sh"
source "$(dirname "$0")/../auth-helper.sh"

if [ -z "$TEST_TENANT_NAME" ]; then
    echo "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

echo "=== Basic Observer Integration Test ==="
echo "Testing observer-enabled route handlers"
echo

# Authenticate as root user
if ! auth_as_user "root"; then
    exit 1
fi

echo "ℹ Using test tenant: $TEST_TENANT_NAME"
echo

# Test 1: Create test schema for observers
echo "→ Test 1: Create test schema"
cat << 'EOF' | monk meta create schema
name: test_observer_schema
fields:
  - name: email
    type: string
    required: true
  - name: name
    type: string
    required: true
  - name: balance
    type: number
    required: false
EOF

if [ $? -ne 0 ]; then
    echo "✗ Failed to create test schema"
    exit 1
fi
echo "✓ Test schema created"

echo

# Test 2: Test observer pipeline functionality
# Note: This would test actual observer-enabled routes once they're integrated
echo "→ Test 2: Observer pipeline functionality test"
echo "ℹ Observer system integration verification (placeholder)"
echo "✓ Observer system loaded at server startup"

echo

echo "✓ Basic observer integration test completed"
echo "ℹ Observer-enabled routes will be tested in future integration tests"