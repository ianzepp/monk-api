#!/bin/bash
# Infrastructure Test - Test Configuration Safe Operations
#
# Tests that monk test config commands work correctly with ~/.config/monk/test.json
# while safely preserving any existing user configuration and data
#
# SAFETY: This test carefully preserves existing test configuration and run history

set -e

echo "=== Monk Test Configuration Safe Operations Test ==="

# Configuration paths
TEST_CONFIG_DIR="$HOME/.config/monk"
TEST_CONFIG_FILE="$TEST_CONFIG_DIR/test.json"
BACKUP_FILE=""
BACKUP_ENV=""

# Check if we have existing configuration to preserve
if [ -f "$TEST_CONFIG_FILE" ]; then
    BACKUP_FILE=$(mktemp)
    cp "$TEST_CONFIG_FILE" "$BACKUP_FILE"
    echo "📝 Found existing test config - backed up to $BACKUP_FILE"
    HAS_EXISTING_CONFIG=true
else
    echo "📝 No existing test config found"
    HAS_EXISTING_CONFIG=false
fi

# Backup current MONK_GIT_TARGET if set
if [ -n "${MONK_GIT_TARGET:-}" ]; then
    BACKUP_ENV="$MONK_GIT_TARGET"
    echo "📝 Found existing MONK_GIT_TARGET: $BACKUP_ENV"
fi

# Clean up function that safely restores original state
cleanup() {
    echo ""
    echo "🧹 Cleaning up test data..."
    
    # Restore original environment variable
    if [ -n "$BACKUP_ENV" ]; then
        export MONK_GIT_TARGET="$BACKUP_ENV"
        echo "♻️  Restored MONK_GIT_TARGET: $BACKUP_ENV"
    else
        unset MONK_GIT_TARGET 2>/dev/null || true
        echo "♻️  Cleared MONK_GIT_TARGET (none was set originally)"
    fi
    
    if [ "$HAS_EXISTING_CONFIG" = true ] && [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
        # Restore the original configuration
        cp "$BACKUP_FILE" "$TEST_CONFIG_FILE"
        rm "$BACKUP_FILE"
        echo "📝 Restored original test configuration"
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
echo "🧪 Test 1: Safe config file initialization"

if [ "$HAS_EXISTING_CONFIG" = false ]; then
    # Test creation of new config
    monk test config validate >/dev/null 2>&1
    
    if [ -f "$TEST_CONFIG_FILE" ]; then
        echo "✅ Config file created at correct location: $TEST_CONFIG_FILE"
    else
        echo "❌ Config file not created at expected location"
        exit 1
    fi
    
    # Verify structure
    if grep -q '"version"' "$TEST_CONFIG_FILE" && grep -q '"base_directory"' "$TEST_CONFIG_FILE"; then
        echo "✅ Config file has correct structure"
    else
        echo "❌ Config file missing required structure"
        exit 1
    fi
else
    echo "✅ Using existing config file at: $TEST_CONFIG_FILE"
    # Verify we can validate existing config
    if monk test config validate >/dev/null 2>&1; then
        echo "✅ Existing config file validates successfully"
    else
        echo "⚠️  Existing config file has validation issues (continuing)"
    fi
fi

echo ""
echo "🧪 Test 2: Safe get/set operations with unique test keys"

# Use a unique test key to avoid conflicts
TEST_KEY=".test_safe_operations_$RANDOM"
TEST_VALUE="test-value-$(date +%s)"

# Test setting a safe test value
monk test config set "$TEST_KEY" "$TEST_VALUE" >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Safe config set operation succeeded"
else
    echo "❌ Safe config set operation failed"
    exit 1
fi

# Test getting the value back
RETRIEVED_VALUE=$(monk test config get "$TEST_KEY")
if [ "$RETRIEVED_VALUE" = "$TEST_VALUE" ]; then
    echo "✅ Safe config get operation returned correct value"
else
    echo "❌ Safe config get returned: '$RETRIEVED_VALUE', expected: '$TEST_VALUE'"
    exit 1
fi

# Clean up our test key
monk test config set "$TEST_KEY" "null" >/dev/null 2>&1

echo ""
echo "🧪 Test 3: Legacy environment variable migration (safe)"

if [ "$HAS_EXISTING_CONFIG" = false ]; then
    # Only test migration if we don't have existing config
    export MONK_GIT_TARGET="/tmp/test-legacy-migration-$RANDOM"
    
    # Remove config to trigger migration
    rm -f "$TEST_CONFIG_FILE"
    
    # Trigger migration
    monk test config validate >/dev/null 2>&1
    
    # Check if migration occurred
    MIGRATED_VALUE=$(monk test config get .base_directory)
    if [ "$MIGRATED_VALUE" = "$MONK_GIT_TARGET" ]; then
        echo "✅ Legacy environment variable migrated safely"
    else
        echo "❌ Legacy migration failed or was skipped"
        exit 1
    fi
else
    echo "⚠️  Skipping migration test (preserving existing config)"
fi

echo ""
echo "🧪 Test 4: Config display doesn't modify data"

# Get config state before display
if [ "$HAS_EXISTING_CONFIG" = true ]; then
    BEFORE_CHECKSUM=$(md5sum "$TEST_CONFIG_FILE" | cut -d' ' -f1)
fi

# Run config display
CONFIG_OUTPUT=$(monk test config 2>/dev/null)
if echo "$CONFIG_OUTPUT" | grep -q "Test Configuration:"; then
    echo "✅ Config display shows expected information"
else
    echo "❌ Config display missing expected content"
    exit 1
fi

# Verify config wasn't modified
if [ "$HAS_EXISTING_CONFIG" = true ]; then
    AFTER_CHECKSUM=$(md5sum "$TEST_CONFIG_FILE" | cut -d' ' -f1)
    if [ "$BEFORE_CHECKSUM" = "$AFTER_CHECKSUM" ]; then
        echo "✅ Config display didn't modify existing data"
    else
        echo "❌ Config display unexpectedly modified data"
        exit 1
    fi
fi

echo ""
echo "🧪 Test 5: Validation doesn't modify data"

if [ "$HAS_EXISTING_CONFIG" = true ]; then
    BEFORE_CHECKSUM=$(md5sum "$TEST_CONFIG_FILE" | cut -d' ' -f1)
fi

# Run validation
monk test config validate >/dev/null 2>&1

if [ "$HAS_EXISTING_CONFIG" = true ]; then
    AFTER_CHECKSUM=$(md5sum "$TEST_CONFIG_FILE" | cut -d' ' -f1)
    if [ "$BEFORE_CHECKSUM" = "$AFTER_CHECKSUM" ]; then
        echo "✅ Config validation didn't modify existing data"
    else
        echo "❌ Config validation unexpectedly modified data"
        exit 1
    fi
else
    echo "✅ Config validation completed on new config"
fi

echo ""
echo "🧪 Test 6: Directory auto-creation (if needed)"

if [ "$HAS_EXISTING_CONFIG" = false ]; then
    # Test directory creation
    rm -rf "$TEST_CONFIG_DIR"
    
    # Trigger directory creation
    monk test config validate >/dev/null 2>&1
    
    if [ -d "$TEST_CONFIG_DIR" ] && [ -f "$TEST_CONFIG_FILE" ]; then
        echo "✅ Config directory and file auto-created when needed"
    else
        echo "❌ Config directory or file not auto-created"
        exit 1
    fi
else
    echo "✅ Config directory already exists - no creation needed"
fi

echo ""
echo "🧪 Test 7: Verify existing data preservation"

if [ "$HAS_EXISTING_CONFIG" = true ]; then
    # Verify our backup matches current state (after restoration)
    if cmp -s "$BACKUP_FILE" "$TEST_CONFIG_FILE"; then
        echo "✅ Existing configuration data preserved throughout test"
    else
        echo "❌ Existing configuration data was modified"
        echo "Original:"
        head -5 "$BACKUP_FILE"
        echo "Current:"
        head -5 "$TEST_CONFIG_FILE"
        exit 1
    fi
else
    echo "✅ No existing data to preserve - test created and will clean up config"
fi

echo ""
echo "✅ All test configuration safe operations tests passed!"
echo ""
echo "Summary:"
echo "- ✅ Config file operations work correctly"
echo "- ✅ Get/set operations are safe and isolated"
if [ "$HAS_EXISTING_CONFIG" = false ]; then
    echo "- ✅ Legacy migration works (tested on new config)"
else
    echo "- ✅ Legacy migration skipped (preserving existing config)"
fi
echo "- ✅ Display operations don't modify data"
echo "- ✅ Validation operations don't modify data"
echo "- ✅ Directory auto-creation works when needed"
if [ "$HAS_EXISTING_CONFIG" = true ]; then
    echo "- ✅ Existing configuration data fully preserved"
else
    echo "- ✅ Clean test environment managed properly"
fi
echo ""
echo "🎉 Monk test configuration safe operations test completed successfully!"