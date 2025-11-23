#!/usr/bin/env bash
set -e

# Describe API Performance Benchmark
# Measures performance for model and field operations (full validation pipeline)

source "$(dirname "$0")/../test-helper.sh"

print_step "Describe API Performance Benchmark"

# Setup
setup_test_with_template "benchmark-describe" "empty"
setup_full_auth
setup_sudo_auth "Model benchmark operations"

# Warmup
print_step "Warming up (2 model creations)..."
for i in {1..2}; do
    sudo_post "api/describe/warmup_$i" '{"fields":[{"field_name":"test","type":"text","required":true}]}' > /dev/null 2>&1
done
print_success "Warmup complete"

# ===========================
# Benchmark 1: Simple Model Creation
# ===========================
print_step "Benchmark 1: Simple model creation (10 iterations)"

simple_model='{
    "fields": [
        {"field_name": "name", "type": "text", "required": true},
        {"field_name": "email", "type": "text", "required": true}
    ]
}'

start_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')

for i in {1..10}; do
    sudo_post "api/describe/simple_$i" "$simple_model" > /dev/null 2>&1
done
end_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')


elapsed_ms=$(( end_ms - start_ms ))
avg_ms=$(( elapsed_ms / 10 ))

echo "  Total:   ${elapsed_ms}ms"
echo "  Average: ${avg_ms}ms per model"

# ===========================
# Benchmark 2: Complex Model Creation
# ===========================
print_step "Benchmark 2: Complex model creation (5 iterations, 10 fields each)"

complex_model='{
    "fields": [
        {"field_name": "title", "type": "text", "required": true, "minimum": 1, "maximum": 200},
        {"field_name": "description", "type": "text", "required": false},
        {"field_name": "status", "type": "text", "required": true, "enum_values": ["draft", "published"]},
        {"field_name": "priority", "type": "integer", "required": false, "minimum": 1, "maximum": 10},
        {"field_name": "due_date", "type": "timestamp", "required": false},
        {"field_name": "assignee_id", "type": "uuid", "required": false},
        {"field_name": "is_urgent", "type": "boolean", "required": false, "default_value": false},
        {"field_name": "estimated_hours", "type": "decimal", "required": false},
        {"field_name": "tags", "type": "text[]", "required": false},
        {"field_name": "metadata", "type": "jsonb", "required": false}
    ]
}'

start_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')

for i in {1..5}; do
    sudo_post "api/describe/complex_$i" "$complex_model" > /dev/null 2>&1
done
end_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')


elapsed_ms=$(( end_ms - start_ms ))
avg_ms=$(( elapsed_ms / 5 ))

echo "  Total:   ${elapsed_ms}ms"
echo "  Average: ${avg_ms}ms per model (10 fields)"

# ===========================
# Benchmark 3: Field Addition
# ===========================
print_step "Benchmark 3: Adding fields to existing model (10 iterations)"

# Create base model
sudo_post "api/describe/field_test" '{"fields":[{"field_name":"base_id","type":"text","required":true}]}' > /dev/null 2>&1

start_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')

for i in {1..10}; do
    col_def='{"type":"text","required":false,"description":"Test field"}'
    sudo_post "api/describe/field_test/field_$i" "$col_def" > /dev/null 2>&1
done
end_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')


elapsed_ms=$(( end_ms - start_ms ))
avg_ms=$(( elapsed_ms / 10 ))

echo "  Total:   ${elapsed_ms}ms"
echo "  Average: ${avg_ms}ms per field"

# ===========================
# Benchmark 4: Model Retrieval
# ===========================
print_step "Benchmark 4: Model retrieval (20 iterations)"

start_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')

for i in {1..20}; do
    auth_get "api/describe/simple_1" > /dev/null 2>&1
done
end_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')


elapsed_ms=$(( end_ms - start_ms ))
avg_ms=$(( elapsed_ms / 20 ))
throughput=$(( elapsed_ms > 0 ? 20000 / elapsed_ms : 0 ))

echo "  Total:      ${elapsed_ms}ms"
echo "  Average:    ${avg_ms}ms per request"
echo "  Throughput: ${throughput} req/sec"

# ===========================
# Summary
# ===========================
print_success "Describe API benchmark complete"
echo ""
echo "Summary:"
echo "  - Model creation runs full validation pipeline (Ring 0-8)"
echo "  - Complex models (10 fields) show amortized overhead"
echo "  - Field additions: ALTER TABLE DDL + validation"
echo "  - Model reads: Fast (cached after first load)"
