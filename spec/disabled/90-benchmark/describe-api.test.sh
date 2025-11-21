#!/usr/bin/env bash
set -e

# Describe API Performance Benchmark
# Measures performance for schema and column operations (full validation pipeline)

source "$(dirname "$0")/../test-helper.sh"

print_step "Describe API Performance Benchmark"

# Setup
setup_test_with_template "benchmark-describe" "empty"
setup_full_auth
setup_sudo_auth "Schema benchmark operations"

# Warmup
print_step "Warming up (2 schema creations)..."
for i in {1..2}; do
    sudo_post "api/describe/warmup_$i" '{"columns":[{"column_name":"test","type":"text","required":true}]}' > /dev/null 2>&1
done
print_success "Warmup complete"

# ===========================
# Benchmark 1: Simple Schema Creation
# ===========================
print_step "Benchmark 1: Simple schema creation (10 iterations)"

simple_schema='{
    "columns": [
        {"column_name": "name", "type": "text", "required": true},
        {"column_name": "email", "type": "text", "required": true}
    ]
}'

start_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')

for i in {1..10}; do
    sudo_post "api/describe/simple_$i" "$simple_schema" > /dev/null 2>&1
done
end_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')


elapsed_ms=$(( end_ms - start_ms ))
avg_ms=$(( elapsed_ms / 10 ))

echo "  Total:   ${elapsed_ms}ms"
echo "  Average: ${avg_ms}ms per schema"

# ===========================
# Benchmark 2: Complex Schema Creation
# ===========================
print_step "Benchmark 2: Complex schema creation (5 iterations, 10 columns each)"

complex_schema='{
    "columns": [
        {"column_name": "title", "type": "text", "required": true, "minimum": 1, "maximum": 200},
        {"column_name": "description", "type": "text", "required": false},
        {"column_name": "status", "type": "text", "required": true, "enum_values": ["draft", "published"]},
        {"column_name": "priority", "type": "integer", "required": false, "minimum": 1, "maximum": 10},
        {"column_name": "due_date", "type": "timestamp", "required": false},
        {"column_name": "assignee_id", "type": "uuid", "required": false},
        {"column_name": "is_urgent", "type": "boolean", "required": false, "default_value": false},
        {"column_name": "estimated_hours", "type": "decimal", "required": false},
        {"column_name": "tags", "type": "text[]", "required": false},
        {"column_name": "metadata", "type": "jsonb", "required": false}
    ]
}'

start_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')

for i in {1..5}; do
    sudo_post "api/describe/complex_$i" "$complex_schema" > /dev/null 2>&1
done
end_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')


elapsed_ms=$(( end_ms - start_ms ))
avg_ms=$(( elapsed_ms / 5 ))

echo "  Total:   ${elapsed_ms}ms"
echo "  Average: ${avg_ms}ms per schema (10 columns)"

# ===========================
# Benchmark 3: Column Addition
# ===========================
print_step "Benchmark 3: Adding columns to existing schema (10 iterations)"

# Create base schema
sudo_post "api/describe/column_test" '{"columns":[{"column_name":"base_id","type":"text","required":true}]}' > /dev/null 2>&1

start_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')

for i in {1..10}; do
    col_def='{"type":"text","required":false,"description":"Test column"}'
    sudo_post "api/describe/column_test/field_$i" "$col_def" > /dev/null 2>&1
done
end_ms=$(python3 -c 'import time; print(int(time.time() * 1000))')


elapsed_ms=$(( end_ms - start_ms ))
avg_ms=$(( elapsed_ms / 10 ))

echo "  Total:   ${elapsed_ms}ms"
echo "  Average: ${avg_ms}ms per column"

# ===========================
# Benchmark 4: Schema Retrieval
# ===========================
print_step "Benchmark 4: Schema retrieval (20 iterations)"

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
echo "  - Schema creation runs full validation pipeline (Ring 0-8)"
echo "  - Complex schemas (10 columns) show amortized overhead"
echo "  - Column additions: ALTER TABLE DDL + validation"
echo "  - Schema reads: Fast (cached after first load)"
