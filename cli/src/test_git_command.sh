# Check dependencies
check_dependencies

# Get arguments from bashly
branch="${args[branch]}"
commit="${args[commit]}"
clean_build="${args[--clean]}"

# Configuration
TEST_CONFIG_FILE="${HOME}/.config/monk/test.json"

# Load test configuration
load_test_config() {
    if [ -f "$TEST_CONFIG_FILE" ] && command -v jq >/dev/null 2>&1; then
        local base_dir=$(jq -r '.base_directory // "/tmp/monk-builds"' "$TEST_CONFIG_FILE")
        local git_remote=$(jq -r '.default_settings.git_remote // "https://github.com/ianzepp/monk-api.git"' "$TEST_CONFIG_FILE")
        local port_start=$(jq -r '.default_settings.default_port_range.git_tests.start // 3000' "$TEST_CONFIG_FILE")
        local port_end=$(jq -r '.default_settings.default_port_range.git_tests.end // 3999' "$TEST_CONFIG_FILE")
        
        echo "$base_dir|$git_remote|$port_start|$port_end"
    else
        echo "/tmp/monk-builds|https://github.com/ianzepp/monk-api.git|3000|3999"
    fi
}

# Parse test configuration
config_data=$(load_test_config)
GIT_TARGET_DIR=$(echo "$config_data" | cut -d'|' -f1)
MONK_GIT_REMOTE=$(echo "$config_data" | cut -d'|' -f2)
PORT_START=$(echo "$config_data" | cut -d'|' -f3)
PORT_END=$(echo "$config_data" | cut -d'|' -f4)

# Helper functions
print_header() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }
print_step() { echo -e "${BLUE}→ $1${NC}"; }

# Generate run name from git reference
generate_run_name() {
    local git_ref="$1"
    local commit_ref="$2"
    
    # Create input string for hashing
    local hash_input="$git_ref"
    if [ -n "$commit_ref" ]; then
        hash_input="${git_ref}:${commit_ref}"
    fi
    
    # Generate hash using cksum (portable)
    local checksum=$(echo -n "$hash_input" | cksum | cut -d' ' -f1)
    local hash_suffix=$((checksum % 99999999))
    
    # Clean up branch name for display
    local clean_branch=$(echo "$git_ref" | sed 's/[^a-zA-Z0-9._-]/-/g' | cut -c1-20)
    
    # Generate compact run name
    printf "%s-%08d" "$clean_branch" "$hash_suffix"
}

# Get next available port from configured range
get_next_port() {
    local start_port="$PORT_START"
    local end_port="$PORT_END"
    
    # Find next available port in range
    local test_port=$start_port
    while [ "$test_port" -le "$end_port" ]; do
        if ! lsof -i ":$test_port" >/dev/null 2>&1; then
            echo "$test_port"
            return 0
        fi
        test_port=$((test_port + 1))
    done
    
    print_error "Could not find available port in range $start_port-$end_port"
    return 1
}

# Main execution
print_header "Git Test Environment Setup"

# Generate run name
run_name=$(generate_run_name "$branch" "$commit")
run_dir="$GIT_TARGET_DIR/$run_name"
api_dir="$run_dir/monk-api"

print_info "Branch: $branch"
if [ -n "$commit" ]; then
    print_info "Commit: $commit"
fi
print_info "Run Name: $run_name"
print_info "Target Directory: $run_dir"

# Create target directory
mkdir -p "$GIT_TARGET_DIR"

# Handle clean build option
if [ "$clean_build" = "true" ] && [ -d "$run_dir" ]; then
    print_step "Clean build: removing existing environment"
    rm -rf "$run_dir"
fi

# Setup git environment
if [ -d "$api_dir" ]; then
    print_step "Updating existing git environment"
    cd "$api_dir"
    
    # Fetch latest changes
    if ! git fetch origin >/dev/null 2>&1; then
        print_error "Failed to fetch from remote"
        exit 1
    fi
    
    # Checkout target reference
    local target_ref="$branch"
    if [ -n "$commit" ]; then
        target_ref="$commit"
    fi
    
    if ! git checkout "$target_ref" >/dev/null 2>&1; then
        print_error "Failed to checkout $target_ref"
        exit 1
    fi
    
    if ! git pull origin "$branch" >/dev/null 2>&1; then
        print_info "Could not pull (detached HEAD or local changes)"
    fi
else
    print_step "Creating fresh git environment"
    
    # Clone repository
    if ! git clone "$MONK_GIT_REMOTE" "$api_dir" >/dev/null 2>&1; then
        print_error "Failed to clone repository"
        exit 1
    fi
    
    cd "$api_dir"
    
    # Checkout target reference
    local target_ref="$branch"
    if [ -n "$commit" ]; then
        target_ref="$commit"
    fi
    
    if ! git checkout "$target_ref" >/dev/null 2>&1; then
        print_error "Failed to checkout $target_ref"
        exit 1
    fi
fi

print_success "Git environment ready"

# Get allocated port
allocated_port=$(get_next_port)
if [ -z "$allocated_port" ]; then
    exit 1
fi

print_step "Allocated port: $allocated_port"

# Create isolated server configuration
print_step "Creating isolated server configuration"
config_dir="$api_dir/.config/monk"
mkdir -p "$config_dir"

cat > "$config_dir/servers.json" << EOF
{
  "servers": {
    "test-env": {
      "hostname": "localhost",
      "port": $allocated_port,
      "protocol": "http",
      "description": "Git test environment for $branch",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }
  },
  "current": "test-env"
}
EOF

print_success "Isolated configuration created"

# Install dependencies
print_step "Installing dependencies"
if ! npm install >/dev/null 2>&1; then
    print_error "npm install failed"
    exit 1
fi

print_success "Dependencies installed"

# Build project
print_step "Building project"
if ! npm run build >/dev/null 2>&1; then
    print_error "npm run build failed"
    exit 1
fi

print_success "Project built successfully"

# Update test.json with run information
update_test_config() {
    local run_name="$1"
    local api_dir="$2"
    local port="$3"
    
    if [ -f "$TEST_CONFIG_FILE" ] && command -v jq >/dev/null 2>&1; then
        local temp_file=$(mktemp)
        jq --arg run_name "$run_name" \
           --arg api_dir "$api_dir" \
           --arg port "$port" \
           --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
           '.active_run = $run_name | 
            .run_history += [{
                name: $run_name,
                directory: $api_dir,
                port: ($port | tonumber),
                created_at: $timestamp,
                status: "ready"
            }]' \
           "$TEST_CONFIG_FILE" > "$temp_file" && mv "$temp_file" "$TEST_CONFIG_FILE"
    fi
}

update_test_config "$run_name" "$api_dir" "$allocated_port"

print_header "Git Test Environment Ready"
print_success "Environment: $run_name"
print_success "Directory: $api_dir"
print_success "Server Port: $allocated_port"
print_success "Configuration: $api_dir/.config/monk/servers.json"
print_info "Run tests with: cd $api_dir && npm test"
print_info "View environment: cd $api_dir && npm run test:info"