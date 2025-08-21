# .config/monk/ Directory

This directory is used by monk-cli for test environment metadata when running `monk test git` or `monk test dev`.

## Files Created Here:

- **`run-info`** - Test run metadata (git commit, database name, port, timestamps)
- **`test-env`** - Environment variables for test execution (CLI_BASE_URL, TEST_DATABASE, etc.)
- **`server-pid`** - Process ID of the running test server for cleanup

## Purpose:

When `monk test git main` creates a test environment:

1. Clones this repository to `/tmp/monk-builds/main-abc123/`
2. Uses this directory for test metadata storage
3. Test scripts read environment from these files via `monk test env`
4. Enables environment isolation between different git branches

## XDG Compliance:

This follows the XDG Base Directory Specification using `.config/` for application configuration, ensuring no conflicts with repository files.

## Do Not Modify:

These files are automatically managed by monk-cli. Manual changes will be overwritten.