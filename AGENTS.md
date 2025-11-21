# Agent Instructions

This file contains important instructions for AI agents and assistants working on this project.

## Before Starting Any Task

**REQUIRED READING**: Always read relevant documentation before making assumptions or executing commands.

## Testing

**BEFORE executing, debugging, or modifying ANY tests:**
- **READ**: `spec/README.md` for complete test infrastructure documentation
- This includes build process, server lifecycle, proper execution commands, and troubleshooting

## Key Project Patterns

### Build System
- `npm run build` - Compiles TypeScript application code (src/ → dist/)
- `npm run build:tests` - Type-checks test files (spec/)
- These are DIFFERENT and serve different purposes

### Server Environments
- **Production Server**: Port 8000 (pm2, uses `.env.production` → `monk` database)
- **Development Server**: Port 9001 (`npm start`, uses `.env.development` → `monk_development` database)
- **Test Server**: Port 9002 (`npm run test:startup`, uses `.env.test` → `monk_test` database)
- These are SEPARATE - do not confuse them
- `.env` symlinks to `.env.development` by default

### Documentation Location
- Project documentation is co-located with code, not in a separate docs/ directory
- Test documentation: `spec/README.md`
- Route documentation: `src/routes/PUBLIC.md`
- Check README.md for other documentation references

## General Workflow

1. Read relevant README files for the area you're working on
2. Check package.json scripts to understand available commands
3. Verify assumptions by reading existing code/configs
4. Ask user for clarification before making architectural changes
