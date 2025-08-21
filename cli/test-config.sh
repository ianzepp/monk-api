#!/bin/bash
set -e

# Test Configuration Management - Centralized test configuration in ~/.config/monk/test.json
#
# This module provides utilities for managing test configuration including:
# - Reading/writing test configuration from ~/.config/monk/test.json
# - Migrating from legacy MONK_GIT_TARGET and .active-run files
# - Managing test run history and active run tracking
# - Providing configuration defaults and validation

# Configuration path
TEST_CONFIG_DIR="$HOME/.config/monk"
TEST_CONFIG_FILE="$TEST_CONFIG_DIR/test.json"

# Default configuration values
DEFAULT_BASE_DIR="/tmp/monk-builds"
DEFAULT_GIT_REMOTE="git@github.com:ianzepp/monk-api.git"
DEFAULT_GIT_PORT_START=3000
DEFAULT_GIT_PORT_END=3999
DEFAULT_DEV_PORT_START=4000
DEFAULT_DEV_PORT_END=4999
DEFAULT_CLEANUP_HOURS=24
DEFAULT_MAX_CONCURRENT=10

# Ensure test config directory exists
ensure_test_config_dir() {
    mkdir -p "$TEST_CONFIG_DIR"
}

# Get the default test configuration structure
get_default_test_config() {
    cat << 'EOF'
{
  "version": "1.0",
  "base_directory": "/tmp/monk-builds",
  "active_run": null,
  "default_settings": {
    "git_remote": "git@github.com:ianzepp/monk-api.git",
    "default_port_range": {
      "git_tests": {"start": 3000, "end": 3999},
      "dev_tests": {"start": 4000, "end": 4999}
    },
    "cleanup_after_hours": 24,
    "max_concurrent_runs": 10
  },
  "run_history": []
}
EOF
}

# Initialize test config file with defaults
init_test_config() {
    ensure_test_config_dir
    
    if [ ! -f "$TEST_CONFIG_FILE" ]; then
        get_default_test_config > "$TEST_CONFIG_FILE"
        return 0
    fi
    
    # Validate existing config has required structure
    if command -v jq >/dev/null 2>&1; then
        if ! jq -e '.version' "$TEST_CONFIG_FILE" >/dev/null 2>&1; then
            # Invalid or corrupted config, reinitialize
            cp "$TEST_CONFIG_FILE" "$TEST_CONFIG_FILE.backup.$(date +%s)" 2>/dev/null || true
            get_default_test_config > "$TEST_CONFIG_FILE"
        fi
    fi
}

# Migrate from legacy configuration
migrate_legacy_config() {
    local migrated=false
    
    # Migrate MONK_GIT_TARGET environment variable
    if [ -n "${MONK_GIT_TARGET:-}" ]; then
        echo "📦 Migrating MONK_GIT_TARGET: $MONK_GIT_TARGET"
        set_test_config_value ".base_directory" "$MONK_GIT_TARGET"
        migrated=true
    fi
    
    # Migrate .active-run file
    local legacy_active_run_file="${MONK_GIT_TARGET:-$DEFAULT_BASE_DIR}/.active-run"
    if [ -f "$legacy_active_run_file" ]; then
        local active_run=$(cat "$legacy_active_run_file" 2>/dev/null | tr -d '\n' || true)
        if [ -n "$active_run" ]; then
            echo "📦 Migrating active run: $active_run"
            set_test_config_value ".active_run" "$active_run"
            migrated=true
        fi
    fi
    
    if [ "$migrated" = true ]; then
        echo "✅ Legacy configuration migrated to $TEST_CONFIG_FILE"
        echo "💡 You can now remove MONK_GIT_TARGET environment variable"
    fi
}

# Get a value from test config using jq path
get_test_config_value() {
    local jq_path="$1"
    
    init_test_config
    
    if ! command -v jq >/dev/null 2>&1; then
        echo "Error: jq is required for test configuration management" >&2
        return 1
    fi
    
    local result=$(jq -r "$jq_path" "$TEST_CONFIG_FILE" 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo "Error: Failed to read config key: $jq_path" >&2
        return 1
    fi
    
    if [ "$result" = "null" ]; then
        echo "Error: Configuration key not found: $jq_path" >&2
        return 1
    fi
    
    echo "$result"
}

# Set a value in test config using jq path
set_test_config_value() {
    local jq_path="$1"
    local value="$2"
    
    init_test_config
    
    if ! command -v jq >/dev/null 2>&1; then
        echo "Error: jq is required for test configuration management" >&2
        return 1
    fi
    
    local temp_file=$(mktemp)
    jq --arg value "$value" "${jq_path} = \$value" "$TEST_CONFIG_FILE" > "$temp_file" && mv "$temp_file" "$TEST_CONFIG_FILE"
}

# Get base directory for test runs
get_test_base_directory() {
    local base_dir=$(get_test_config_value ".base_directory" 2>/dev/null)
    if [ $? -ne 0 ] || [ -z "$base_dir" ]; then
        echo "$DEFAULT_BASE_DIR"
    else
        echo "$base_dir"
    fi
}

# Get active test run name
get_active_test_run() {
    local active_run=$(get_test_config_value ".active_run" 2>/dev/null)
    if [ $? -ne 0 ] || [ "$active_run" = "null" ]; then
        echo ""
    else
        echo "$active_run"
    fi
}

# Set active test run
set_active_test_run() {
    local run_name="$1"
    
    if [ -z "$run_name" ]; then
        set_test_config_value ".active_run" "null"
    else
        set_test_config_value ".active_run" "$run_name"
    fi
}

# Add or update a test run in history
add_test_run_to_history() {
    local run_name="$1"
    local git_branch="$2"
    local git_commit="$3"
    local database_name="$4"
    local server_port="$5"
    local description="${6:-}"
    local status="${7:-active}"
    
    init_test_config
    
    if ! command -v jq >/dev/null 2>&1; then
        echo "Error: jq is required for test configuration management" >&2
        return 1
    fi
    
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local temp_file=$(mktemp)
    
    # Remove existing entry if it exists, then add new one
    jq --arg name "$run_name" \
       --arg branch "$git_branch" \
       --arg commit "$git_commit" \
       --arg db "$database_name" \
       --arg port "$server_port" \
       --arg desc "$description" \
       --arg status "$status" \
       --arg timestamp "$timestamp" \
       '
       .run_history = (.run_history | map(select(.name != $name))) + [{
         "name": $name,
         "git_branch": $branch,
         "git_commit": $commit,
         "created_at": $timestamp,
         "last_accessed": $timestamp,
         "status": $status,
         "database_name": $db,
         "server_port": ($port | tonumber),
         "description": $desc
       }]
       ' "$TEST_CONFIG_FILE" > "$temp_file" && mv "$temp_file" "$TEST_CONFIG_FILE"
}

# Update last accessed time for a test run
update_test_run_access() {
    local run_name="$1"
    
    init_test_config
    
    if ! command -v jq >/dev/null 2>&1; then
        return 0
    fi
    
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local temp_file=$(mktemp)
    
    jq --arg name "$run_name" \
       --arg timestamp "$timestamp" \
       '
       .run_history = (.run_history | map(
         if .name == $name then 
           .last_accessed = $timestamp 
         else 
           . 
         end
       ))
       ' "$TEST_CONFIG_FILE" > "$temp_file" && mv "$temp_file" "$TEST_CONFIG_FILE"
}

# Remove a test run from history
remove_test_run_from_history() {
    local run_name="$1"
    
    init_test_config
    
    if ! command -v jq >/dev/null 2>&1; then
        return 0
    fi
    
    local temp_file=$(mktemp)
    jq --arg name "$run_name" '.run_history = (.run_history | map(select(.name != $name)))' \
       "$TEST_CONFIG_FILE" > "$temp_file" && mv "$temp_file" "$TEST_CONFIG_FILE"
}

# Get test run info by name
get_test_run_info() {
    local run_name="$1"
    
    init_test_config
    
    if command -v jq >/dev/null 2>&1; then
        jq -r --arg name "$run_name" '.run_history[] | select(.name == $name)' "$TEST_CONFIG_FILE" 2>/dev/null || echo "null"
    else
        echo "null"
    fi
}

# List all test runs
list_test_runs() {
    init_test_config
    
    if command -v jq >/dev/null 2>&1; then
        jq -r '.run_history[]' "$TEST_CONFIG_FILE" 2>/dev/null || echo "[]"
    else
        echo "[]"
    fi
}

# Get test configuration summary
get_test_config_summary() {
    init_test_config
    migrate_legacy_config
    
    local base_dir=$(get_test_base_directory)
    local active_run=$(get_active_test_run)
    local run_count=0
    
    if command -v jq >/dev/null 2>&1; then
        run_count=$(jq -r '.run_history | length' "$TEST_CONFIG_FILE" 2>/dev/null || echo "0")
    fi
    
    echo "Test Configuration:"
    echo "  Config file: $TEST_CONFIG_FILE"
    echo "  Base directory: $base_dir"
    echo "  Active run: ${active_run:-"(none)"}"
    echo "  Total runs in history: $run_count"
}

# Validate test configuration
validate_test_config() {
    # Initialize config if it doesn't exist
    init_test_config
    migrate_legacy_config
    
    if [ ! -f "$TEST_CONFIG_FILE" ]; then
        echo "❌ Test config file not found: $TEST_CONFIG_FILE"
        return 1
    fi
    
    if ! command -v jq >/dev/null 2>&1; then
        echo "⚠️  jq not available - cannot validate config structure"
        return 0
    fi
    
    # Check required fields
    local required_fields=(".version" ".base_directory" ".default_settings" ".run_history")
    local valid=true
    
    for field in "${required_fields[@]}"; do
        if ! jq -e "$field" "$TEST_CONFIG_FILE" >/dev/null 2>&1; then
            echo "❌ Missing required field: $field"
            valid=false
        fi
    done
    
    if [ "$valid" = true ]; then
        echo "✅ Test configuration is valid"
        return 0
    else
        echo "❌ Test configuration validation failed"
        return 1
    fi
}

# Show test configuration
show_test_config() {
    echo "=== Test Configuration ==="
    echo ""
    get_test_config_summary
    echo ""
    
    if command -v jq >/dev/null 2>&1; then
        echo "Configuration details:"
        jq '.' "$TEST_CONFIG_FILE" 2>/dev/null || echo "Error reading config file"
    else
        echo "Install jq to view detailed configuration"
    fi
}

# Reset test configuration to defaults
reset_test_config() {
    echo "⚠️  Resetting test configuration to defaults..."
    
    # Backup existing config
    if [ -f "$TEST_CONFIG_FILE" ]; then
        local backup_file="$TEST_CONFIG_FILE.backup.$(date +%s)"
        cp "$TEST_CONFIG_FILE" "$backup_file"
        echo "📝 Backed up existing config to: $backup_file"
    fi
    
    # Create new default config
    get_default_test_config > "$TEST_CONFIG_FILE"
    echo "✅ Test configuration reset to defaults"
}