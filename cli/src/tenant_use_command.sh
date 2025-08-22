# Check dependencies
check_dependencies

# Get arguments from bashly
tenant_name="${args[name]}"

print_info "Switching to tenant: $tenant_name"

# Store tenant context in environment
export CLI_TENANT="$tenant_name"

# Optionally store in config file for persistence
config_dir="$HOME/.monk"
mkdir -p "$config_dir"
echo "$tenant_name" > "$config_dir/current_tenant"

print_success "Switched to tenant '$tenant_name'"
print_info "Use 'monk auth login $tenant_name root' to authenticate"