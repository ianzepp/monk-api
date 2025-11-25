#!/bin/bash
set -euo pipefail

# Extract @deprecated tags from codebase
# Generates DEPRECATED.md with JSDoc @deprecated annotations and surrounding context

OUTPUT_FILE="DEPRECATED.md"
SOURCE_DIRS="src"

# Colors for terminal output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}[INFO]${NC} Extracting @deprecated tags from codebase..."

# Create DEPRECATED.md header
cat > "$OUTPUT_FILE" << EOF
# Deprecated APIs

**Auto-generated** from JSDoc \`@deprecated\` annotations. Run \`npm run build:deprecated\` to update.

Last updated: $(date '+%Y-%m-%d %H:%M:%S')

---

EOF

count=0
context_lines=5  # More context for deprecated APIs

# Search for @deprecated in TypeScript/JavaScript files
results=$(grep -rn \
    --include="*.ts" \
    --include="*.js" \
    --exclude-dir="node_modules" \
    --exclude-dir="dist" \
    --exclude-dir=".git" \
    "@deprecated" \
    $SOURCE_DIRS 2>/dev/null || true)

if [ -z "$results" ]; then
    echo -e "${GREEN}[INFO]${NC} No deprecated APIs found - excellent!"
    cat >> "$OUTPUT_FILE" << EOF

No deprecated APIs found in the codebase.

EOF
    exit 0
fi

echo "" >> "$OUTPUT_FILE"
echo "## Deprecated Items" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Process each result
while IFS= read -r line; do
    if [ -z "$line" ]; then
        continue
    fi

    # Parse grep output: file:line:content
    file=$(echo "$line" | cut -d: -f1)
    linenum=$(echo "$line" | cut -d: -f2)

    # Extract context around the line (5 lines before, matched line, 10 lines after for full function)
    start_line=$((linenum - context_lines))
    if [ $start_line -lt 1 ]; then
        start_line=1
    fi
    end_line=$((linenum + 10))

    # Get context using sed
    context=$(sed -n "${start_line},${end_line}p" "$file" 2>/dev/null || echo "")

    # Extract just the @deprecated message
    deprecated_msg=$(echo "$line" | sed -n 's/.*@deprecated\s*\(.*\)/\1/p' | sed 's/^\s*//')

    # Add to DEPRECATED.md
    echo "### \`${file}:${linenum}\`" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"

    if [ -n "$deprecated_msg" ]; then
        echo "**Reason**: $deprecated_msg" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
    fi

    echo "<details>" >> "$OUTPUT_FILE"
    echo "<summary>Show code context</summary>" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "\`\`\`typescript" >> "$OUTPUT_FILE"
    echo "$context" >> "$OUTPUT_FILE"
    echo "\`\`\`" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "</details>" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"

    ((count++))
done <<< "$results"

# Add summary footer
cat >> "$OUTPUT_FILE" << EOF

---

**Total**: ${count} deprecated items

**Action Required**: Review and plan migration path for deprecated APIs.
EOF

echo -e "${YELLOW}[FOUND]${NC} ${count} deprecated items"

if [ $count -gt 0 ]; then
    echo -e "${RED}[WARN]${NC} Found ${count} deprecated APIs in codebase"
    echo -e "${GREEN}[INFO]${NC} Generated ${OUTPUT_FILE}"
fi

exit 0
