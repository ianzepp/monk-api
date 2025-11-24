#!/bin/bash
set -euo pipefail

# Extract TODO/FIXME/HACK comments from codebase
# Generates TODO.md with categorized tags and surrounding context

OUTPUT_FILE="TODO.md"
SOURCE_DIRS="src"

# Define tags to search for (order matters for priority)
TAGS=("FIXME" "TODO" "HACK" "XXX" "NOTE" "OPTIMIZE")

# Colors for terminal output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}[INFO]${NC} Extracting TODO tags from codebase..."

# Create TODO.md header
cat > "$OUTPUT_FILE" << EOF
# TODO List

**Auto-generated** from code comments. Run \`npm run build:todo\` to update.

Last updated: $(date '+%Y-%m-%d %H:%M:%S')

---

EOF

# Function to extract tags with context
extract_tags() {
    local tag="$1"
    local count=0
    local context_lines=3  # Lines before and after

    # Search for tag in source files, exclude build artifacts and node_modules
    local results=$(grep -rn \
        --include="*.ts" \
        --include="*.js" \
        --include="*.md" \
        --exclude-dir="node_modules" \
        --exclude-dir="dist" \
        --exclude-dir=".git" \
        -i "\\b${tag}\\b" \
        $SOURCE_DIRS 2>/dev/null || true)

    if [ -z "$results" ]; then
        return 0
    fi

    # Add section header
    echo "" >> "$OUTPUT_FILE"
    echo "## ${tag}" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"

    # Process each result
    while IFS= read -r line; do
        if [ -z "$line" ]; then
            continue
        fi

        # Parse grep output: file:line:content
        local file=$(echo "$line" | cut -d: -f1)
        local linenum=$(echo "$line" | cut -d: -f2)

        # Validate linenum is numeric
        if ! [[ "$linenum" =~ ^[0-9]+$ ]]; then
            continue
        fi

        # Extract context around the line (3 lines before, matched line, 3 lines after)
        local start_line=$((linenum - context_lines))
        if [ $start_line -lt 1 ]; then
            start_line=1
        fi
        local end_line=$((linenum + context_lines))

        # Get context using sed
        local context=$(sed -n "${start_line},${end_line}p" "$file" 2>/dev/null || echo "")

        # Add to TODO.md
        echo "### \`${file}:${linenum}\`" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        echo "\`\`\`typescript" >> "$OUTPUT_FILE"
        echo "$context" >> "$OUTPUT_FILE"
        echo "\`\`\`" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"

        ((count++))
    done <<< "$results"

    echo -e "${YELLOW}[FOUND]${NC} ${count} ${tag} tags"
    return $count
}

# Extract all tags
total=0
for tag in "${TAGS[@]}"; do
    extract_tags "$tag"
    total=$((total + $?))
done

# Add summary footer
cat >> "$OUTPUT_FILE" << EOF

---

**Total**: ${total} items across ${#TAGS[@]} categories

**Categories**: ${TAGS[*]}
EOF

if [ $total -gt 0 ]; then
    echo -e "${RED}[WARN]${NC} Found ${total} TODO items in codebase"
    echo -e "${GREEN}[INFO]${NC} Generated ${OUTPUT_FILE}"
else
    echo -e "${GREEN}[INFO]${NC} No TODO items found - codebase is clean!"
fi

exit 0
