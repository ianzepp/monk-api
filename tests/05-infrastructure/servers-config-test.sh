#!/bin/bash
# Infrastructure Test - Monk Servers Configuration
#
# Tests that monk servers command correctly uses ~/.config/monk/servers.json
# and performs basic server management operations
#
# SAFETY: This test carefully preserves any existing server configuration

set -e

echo "=== Monk Servers Configuration Test ==="

# Configuration paths
TEST_CONFIG_DIR="$HOME/.config/monk"
TEST_CONFIG_FILE="$TEST_CONFIG_DIR/servers.json"
BACKUP_FILE=""

# Check if we have existing configuration to preserve
if [ -f "$TEST_CONFIG_FILE" ]; then
    BACKUP_FILE=$(mktemp)
    cp "$TEST_CONFIG_FILE" "$BACKUP_FILE"
    echo "📝 Found existing servers config - backed up to $BACKUP_FILE"
    HAS_EXISTING_CONFIG=true
else
    echo "📝 No existing servers config found"
    HAS_EXISTING_CONFIG=false
fi

# Clean up function that safely restores original state
cleanup() {
    echo ""
    echo "🧹 Cleaning up test data..."
    
    # Remove any test servers we added (only if config exists)
    if [ -f "$TEST_CONFIG_FILE" ]; then
        # Only try to delete our test servers, ignore errors
        monk servers delete test-server-1 2>/dev/null || true
        monk servers delete test-server-2 2>/dev/null || true
        echo "🗑️  Removed test servers"
    fi
    
    if [ "$HAS_EXISTING_CONFIG" = true ] && [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
        # Restore the original configuration
        cp "$BACKUP_FILE" "$TEST_CONFIG_FILE"
        rm "$BACKUP_FILE"
        echo "📝 Restored original servers configuration"
    elif [ "$HAS_EXISTING_CONFIG" = false ]; then
        # We created the config during testing, so clean it up
        rm -f "$TEST_CONFIG_FILE"
        # Only remove directory if it's empty and we created it
        rmdir "$TEST_CONFIG_DIR" 2>/dev/null || true
        echo "🧹 Removed test configuration (no original config existed)"
    fi
    
    echo "✨ Cleanup completed - original state restored"
}

# Set up cleanup on exit
trap cleanup EXIT

echo ""
echo "🧪 Test 1: Verify config file location and structure"

# If no existing config, test creation
if [ "$HAS_EXISTING_CONFIG" = false ]; then
    # Run monk servers list to trigger config creation
    monk servers list >/dev/null 2>&1
    
    # Verify config file was created in correct location
    if [ -f "$TEST_CONFIG_FILE" ]; then
        echo "✅ Config file created at correct location: $TEST_CONFIG_FILE"
    else
        echo "❌ Config file not created at expected location: $TEST_CONFIG_FILE"
        exit 1
    fi
    
    # Verify config file has correct initial structure
    if grep -q '"servers": {}' "$TEST_CONFIG_FILE" && grep -q '"current": null' "$TEST_CONFIG_FILE"; then
        echo "✅ Config file has correct initial structure"
    else
        echo "❌ Config file does not have expected initial structure"
        exit 1
    fi
else
    echo "✅ Using existing config file at: $TEST_CONFIG_FILE"
    # Verify existing config has required structure
    if command -v jq >/dev/null 2>&1; then
        if jq -e '.servers' "$TEST_CONFIG_FILE" >/dev/null 2>&1; then
            echo "✅ Existing config file has valid structure"
        else
            echo "❌ Existing config file does not have valid structure"
            exit 1
        fi
    else
        echo "⚠️  jq not available - skipping structure validation"
    fi
fi

echo ""
echo "🧪 Test 2: Add test servers (safely)"

# Check if our test server names already exist
EXISTING_SERVER_1=$(monk servers list 2>/dev/null | grep "test-server-1" || true)
EXISTING_SERVER_2=$(monk servers list 2>/dev/null | grep "test-server-2" || true)

if [ -n "$EXISTING_SERVER_1" ] || [ -n "$EXISTING_SERVER_2" ]; then
    echo "⚠️  Test server names already exist - using alternative names"
    TEST_SERVER_1="test-srv-$RANDOM"
    TEST_SERVER_2="test-srv-$RANDOM"
else
    TEST_SERVER_1="test-server-1"
    TEST_SERVER_2="test-server-2"
fi

echo "📝 Using test server names: $TEST_SERVER_1, $TEST_SERVER_2"

# Add first test server
monk servers add "$TEST_SERVER_1" localhost:3001 --description "Test Server 1" >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Successfully added $TEST_SERVER_1"
else
    echo "❌ Failed to add $TEST_SERVER_1"
    exit 1
fi

# Add second test server
monk servers add "$TEST_SERVER_2" api.example.com:443 --description "Test Server 2" >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Successfully added $TEST_SERVER_2"
else
    echo "❌ Failed to add $TEST_SERVER_2"
    exit 1
fi

echo ""
echo "🧪 Test 3: Verify config file contains test servers"

# Check that both servers are in the config file
if grep -q "\"$TEST_SERVER_1\"" "$TEST_CONFIG_FILE" && grep -q "\"$TEST_SERVER_2\"" "$TEST_CONFIG_FILE"; then
    echo "✅ Both test servers found in config file"
else
    echo "❌ Test servers not found in config file"
    exit 1
fi

echo ""
echo "🧪 Test 4: Test server operations"

# Test server listing
LIST_OUTPUT=$(monk servers list 2>/dev/null)
if echo "$LIST_OUTPUT" | grep -q "$TEST_SERVER_1" && echo "$LIST_OUTPUT" | grep -q "$TEST_SERVER_2"; then
    echo "✅ Server list shows both test servers"
else
    echo "❌ Server list does not show expected servers"
    exit 1
fi

# Test server switching (only if we don't have existing config or it's safe)
if [ "$HAS_EXISTING_CONFIG" = false ] || ! grep -q '"current":' "$BACKUP_FILE" 2>/dev/null; then
    # Safe to test switching
    monk servers use "$TEST_SERVER_2" >/dev/null 2>&1
    if grep -q "\"current\": \"$TEST_SERVER_2\"" "$TEST_CONFIG_FILE"; then
        echo "✅ Server switching works correctly"
    else
        echo "❌ Server switching failed"
        exit 1
    fi
else
    echo "⚠️  Skipping server switching test (preserving existing current server)"
fi

echo ""
echo "🧪 Test 5: Test 'monk servers use' (no args) functionality"

# Test showing current server when one is set
if [ "$HAS_EXISTING_CONFIG" = false ] || ! grep -q '"current":' "$BACKUP_FILE" 2>/dev/null; then
    # We have a current server set from previous test
    USE_OUTPUT=$(monk servers use 2>/dev/null)
    if echo "$USE_OUTPUT" | grep -q "Current Server" && echo "$USE_OUTPUT" | grep -q "$TEST_SERVER_2"; then
        echo "✅ 'monk servers use' (no args) shows current server correctly"
    else
        echo "❌ 'monk servers use' (no args) failed to show current server"
        echo "Output: $USE_OUTPUT"
        exit 1
    fi
    
    # Test showing "no current server" when none is set
    # Temporarily remove current server setting
    jq 'del(.current)' "$TEST_CONFIG_FILE" > "$TEST_CONFIG_FILE.tmp" && mv "$TEST_CONFIG_FILE.tmp" "$TEST_CONFIG_FILE"
    USE_OUTPUT_EMPTY=$(monk servers use 2>/dev/null)
    if echo "$USE_OUTPUT_EMPTY" | grep -q "No current server selected"; then
        echo "✅ 'monk servers use' (no args) shows 'no current server' message correctly"
    else
        echo "❌ 'monk servers use' (no args) failed to show 'no current server' message"
        echo "Output: $USE_OUTPUT_EMPTY"
        exit 1
    fi
    
    # Restore current server for cleanup
    jq --arg name "$TEST_SERVER_2" '.current = $name' "$TEST_CONFIG_FILE" > "$TEST_CONFIG_FILE.tmp" && mv "$TEST_CONFIG_FILE.tmp" "$TEST_CONFIG_FILE"
else
    # Even with existing config, we can test that the command works without breaking anything
    echo "📝 Testing 'monk servers use' (no args) with existing configuration"
    USE_OUTPUT=$(monk servers use 2>/dev/null)
    if echo "$USE_OUTPUT" | grep -q "Current Server" || echo "$USE_OUTPUT" | grep -q "No current server selected"; then
        echo "✅ 'monk servers use' (no args) works correctly with existing configuration"
    else
        echo "❌ 'monk servers use' (no args) failed with existing configuration"
        echo "Output: $USE_OUTPUT"
        exit 1
    fi
fi

echo ""
echo "🧪 Test 6: Test server deletion"

# Delete our test servers
monk servers delete "$TEST_SERVER_1" >/dev/null 2>&1
if ! grep -q "\"$TEST_SERVER_1\"" "$TEST_CONFIG_FILE"; then
    echo "✅ Server deletion works correctly"
else
    echo "❌ Server deletion failed"
    exit 1
fi

echo ""
echo "✅ All monk servers configuration tests passed!"
echo ""
echo "Summary:"
echo "- ✅ Config file location: ~/.config/monk/servers.json"
echo "- ✅ Server addition and deletion work correctly"
echo "- ✅ Config file structure is valid"
echo "- ✅ Server listing shows correct information"
echo "- ✅ 'monk servers use' (no args) functionality works correctly"
if [ "$HAS_EXISTING_CONFIG" = true ]; then
    echo "- ✅ Existing configuration preserved and restored"
else
    echo "- ✅ Clean configuration creation tested"
fi
echo ""
echo "🎉 Monk servers configuration test completed safely!"

# Update cleanup function to use our dynamic server names
cleanup() {
    echo ""
    echo "🧹 Cleaning up test data..."
    
    # Remove any remaining test servers
    if [ -f "$TEST_CONFIG_FILE" ]; then
        monk servers delete "$TEST_SERVER_1" 2>/dev/null || true
        monk servers delete "$TEST_SERVER_2" 2>/dev/null || true
        echo "🗑️  Removed test servers"
    fi
    
    if [ "$HAS_EXISTING_CONFIG" = true ] && [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
        cp "$BACKUP_FILE" "$TEST_CONFIG_FILE"
        rm "$BACKUP_FILE"
        echo "📝 Restored original servers configuration"
    elif [ "$HAS_EXISTING_CONFIG" = false ]; then
        rm -f "$TEST_CONFIG_FILE"
        rmdir "$TEST_CONFIG_DIR" 2>/dev/null || true
        echo "🧹 Removed test configuration"
    fi
    
    echo "✨ Cleanup completed - original state restored"
}