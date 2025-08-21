#!/bin/bash
# Infrastructure Test - Test Configuration Management
#
# Tests that monk test config commands work correctly with ~/.config/monk/test.json
# including configuration management, migration, and persistence

set -e

echo "=== Monk Test Configuration Test ==="

# Test configuration paths
TEST_CONFIG_DIR="$HOME/.config/monk"
TEST_CONFIG_FILE="$TEST_CONFIG_DIR/test.json"

# Backup any existing config
BACKUP_FILE=""
if [ -f "$TEST_CONFIG_FILE" ]; then
    BACKUP_FILE=$(mktemp)
    cp "$TEST_CONFIG_FILE" "$BACKUP_FILE"
    echo "📝 Backed up existing test config to $BACKUP_FILE"
fi

# Test environment variable for migration
ORIGINAL_MONK_GIT_TARGET="${MONK_GIT_TARGET:-}"

# Clean up function
cleanup() {
    echo ""
    echo "🧹 Cleaning up test data..."
    
    # Restore original environment
    if [ -n "$ORIGINAL_MONK_GIT_TARGET" ]; then
        export MONK_GIT_TARGET="$ORIGINAL_MONK_GIT_TARGET"
    else
        unset MONK_GIT_TARGET 2>/dev/null || true
    fi
    
    # Restore backup if it exists
    if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
        cp "$BACKUP_FILE" "$TEST_CONFIG_FILE"
        rm "$BACKUP_FILE"
        echo "📝 Restored original test configuration"
    else
        # Remove test config file
        rm -f "$TEST_CONFIG_FILE"
        # Remove directory if empty
        rmdir "$TEST_CONFIG_DIR" 2>/dev/null || true
        echo "🧹 Removed test configuration"
    fi
    
    echo "✨ Cleanup completed"
}

# Set up cleanup on exit
trap cleanup EXIT

echo ""
echo "🧪 Test 1: Config file initialization"

# Remove any existing config to test fresh creation
rm -f "$TEST_CONFIG_FILE"

# Run monk test config to trigger initialization
monk test config validate >/dev/null 2>&1

# Verify config file was created
if [ -f "$TEST_CONFIG_FILE" ]; then
    echo "✅ Config file created at: $TEST_CONFIG_FILE"
else
    echo "❌ Config file not created at expected location"
    exit 1
fi

# Verify config file has correct structure
if grep -q '"version"' "$TEST_CONFIG_FILE" && grep -q '"base_directory"' "$TEST_CONFIG_FILE"; then
    echo "✅ Config file has correct structure"
else
    echo "❌ Config file does not have expected structure"
    cat "$TEST_CONFIG_FILE"
    exit 1
fi

echo ""
echo "🧪 Test 2: Configuration get/set operations"

# Test setting a configuration value
monk test config set .base_directory "/tmp/test-monk-builds" >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Config set operation succeeded"
else
    echo "❌ Config set operation failed"
    exit 1
fi

# Test getting the configuration value
BASE_DIR=$(monk test config get .base_directory)
if [ "$BASE_DIR" = "/tmp/test-monk-builds" ]; then
    echo "✅ Config get operation returned correct value"
else
    echo "❌ Config get operation returned: '$BASE_DIR', expected: '/tmp/test-monk-builds'"
    exit 1
fi

# Verify the change persisted in the file
if grep -q '"/tmp/test-monk-builds"' "$TEST_CONFIG_FILE"; then
    echo "✅ Config change persisted to file"
else
    echo "❌ Config change not persisted to file"
    exit 1
fi

echo ""
echo "🧪 Test 3: Migration from legacy environment variables"

# Set up legacy environment variable
export MONK_GIT_TARGET="/tmp/legacy-monk-builds"

# Reset config to trigger migration
rm -f "$TEST_CONFIG_FILE"

# Run a test command that should trigger migration
monk test config validate >/dev/null 2>&1

# Check if migration occurred
MIGRATED_BASE_DIR=$(monk test config get .base_directory)
if [ "$MIGRATED_BASE_DIR" = "/tmp/legacy-monk-builds" ]; then
    echo "✅ Legacy MONK_GIT_TARGET migrated correctly"
else
    echo "❌ Legacy migration failed. Got: '$MIGRATED_BASE_DIR'"
    exit 1
fi

echo ""
echo "🧪 Test 4: Active run management"

# Test setting active run
TEST_RUN_NAME="test-run-$RANDOM"
monk test config set .active_run "$TEST_RUN_NAME" >/dev/null 2>&1

# Verify active run was set
ACTIVE_RUN=$(monk test config get .active_run)
if [ "$ACTIVE_RUN" = "$TEST_RUN_NAME" ]; then
    echo "✅ Active run set correctly"
else
    echo "❌ Active run not set correctly. Got: '$ACTIVE_RUN'"
    exit 1
fi

# Test clearing active run
monk test config set .active_run "null" >/dev/null 2>&1
CLEARED_RUN=$(monk test config get .active_run)
if [ "$CLEARED_RUN" = "null" ] || [ "$CLEARED_RUN" = "" ]; then
    echo "✅ Active run cleared correctly"
else
    echo "❌ Active run not cleared. Got: '$CLEARED_RUN'"
    exit 1
fi

echo ""
echo "🧪 Test 5: Configuration validation"

# Test validation of valid config
if monk test config validate >/dev/null 2>&1; then
    echo "✅ Valid configuration passes validation"
else
    echo "❌ Valid configuration failed validation"
    exit 1
fi

# Test validation with corrupted config
echo '{"invalid": json}' > "$TEST_CONFIG_FILE"
if ! monk test config validate >/dev/null 2>&1; then
    echo "✅ Invalid configuration correctly fails validation"
else
    echo "❌ Invalid configuration incorrectly passes validation"
    exit 1
fi

echo ""
echo "🧪 Test 6: Configuration reset"

# Reset configuration to defaults
monk test config reset >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Configuration reset succeeded"
else
    echo "❌ Configuration reset failed"
    exit 1
fi

# Verify reset worked
if monk test config validate >/dev/null 2>&1; then
    echo "✅ Reset configuration is valid"
else
    echo "❌ Reset configuration is invalid"
    exit 1
fi

# Verify default values
DEFAULT_BASE=$(monk test config get .base_directory)
if [ "$DEFAULT_BASE" = "/tmp/monk-builds" ]; then
    echo "✅ Default base directory restored"
else
    echo "❌ Default base directory not correct: '$DEFAULT_BASE'"
    exit 1
fi

echo ""
echo "🧪 Test 7: Configuration display"

# Test showing full configuration
CONFIG_OUTPUT=$(monk test config 2>/dev/null)
if echo "$CONFIG_OUTPUT" | grep -q "Test Configuration:" && echo "$CONFIG_OUTPUT" | grep -q "Base directory:"; then
    echo "✅ Configuration display shows expected information"
else
    echo "❌ Configuration display missing expected information"
    exit 1
fi

echo ""
echo "🧪 Test 8: Directory auto-creation"

# Remove config directory entirely
rm -rf "$TEST_CONFIG_DIR"

# Run config command to test directory creation
monk test config validate >/dev/null 2>&1

# Verify directory and file were created
if [ -d "$TEST_CONFIG_DIR" ] && [ -f "$TEST_CONFIG_FILE" ]; then
    echo "✅ Config directory and file auto-created"
else
    echo "❌ Config directory or file not auto-created"
    exit 1
fi

echo ""
echo "✅ All test configuration tests passed!"
echo ""
echo "Summary:"
echo "- ✅ Config file initialization works"
echo "- ✅ Get/set operations work correctly"
echo "- ✅ Legacy environment variable migration works"
echo "- ✅ Active run management works"
echo "- ✅ Configuration validation works"
echo "- ✅ Configuration reset works"
echo "- ✅ Configuration display works"
echo "- ✅ Directory auto-creation works"
echo ""
echo "🎉 Monk test configuration test completed successfully!"