# Testing Fixtures Template

## ⚠️ Protected Template

This directory contains the **testing fixtures template** used by many tests throughout the codebase. The data in this template is **locked and protected** to ensure test stability.

## Protection Mechanisms

### 1. Application Lock (`.locked` file)
- **Purpose**: Prevents `npm run fixtures:generate testing <count>` from regenerating data
- **File**: `.locked` - Contains lock metadata and unlock instructions
- **Protection**: Runtime prevention of fixture regeneration

### 2. Git Lock (`--skip-worktree`)
- **Purpose**: Prevents Git from tracking local changes to data files
- **Files**: `data/account.json`, `data/contact.json` 
- **Protection**: Git-level protection against accidental commits of modified data

## Contents

- **Models**: 2 models (`account.json`, `contact.json`)
- **Data**: Sample data with exactly 5 account records and 5 contact records
- **Usage**: Template for `npm run fixtures:build testing` → `monk_template_testing` database

## Test Dependencies

Many tests depend on the **exact data** in this template:
- Account record count expectations (5 records)
- Specific account names, emails, and types
- Contact data structure and values

## Modifying This Template

### ⚠️ DO NOT modify data files directly

If you need different test data:

1. **Create a new template**:
   ```bash
   cp -r fixtures/testing fixtures/my-template
   rm fixtures/my-template/.locked
   npm run fixtures:generate my-template 100
   ```

2. **Use the new template**:
   ```bash
   npm run fixtures:build my-template
   # Creates monk_template_my_template
   ```

### Emergency Unlock (if absolutely necessary)

```bash
# 1. Remove application lock
rm fixtures/testing/.locked

# 2. Remove git lock  
git update-index --no-skip-worktree fixtures/testing/data/account.json
git update-index --no-skip-worktree fixtures/testing/data/contact.json

# 3. Make changes
npm run fixtures:generate testing 5

# 4. Re-lock (recommended)
npm run fixtures:lock testing
git update-index --skip-worktree fixtures/testing/data/account.json
git update-index --skip-worktree fixtures/testing/data/contact.json
```

## Related Commands

```bash
# Build template database
npm run fixtures:build testing

# Check if template is locked
npm run fixtures:generate testing 10  # Will show lock error

# List git-locked files
git ls-files -v | grep ^S
```
