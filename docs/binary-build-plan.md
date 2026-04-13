# Binary Build Plan

## Goal

Make Monk API a first-class binary-distributable application built with Bun, while preserving the existing server behavior and minimizing surprises around runtime assets, path resolution, and startup mode.

This is an initial plan only. It describes the work needed before implementation, not the implementation itself.

## Current State

The repo already has partial support for binary output:

- `package.json` includes `build:standalone`
- `scripts/build-standalone.sh` compiles `dist/index.js` into `dist-standalone/monk-api`
- `src/index.ts` falls back to `sqlite:root` when `DATABASE_URL` is missing
- `src/index.ts` sets default values for SQLite mode, including `PORT=9001` and `SQLITE_DATA_DIR=.data`

There are also a few mismatches worth resolving in a second pass:

- README examples mention `./dist/monk-api`, but the standalone script emits `dist-standalone/monk-api`
- The build pipeline copies assets into `dist/`, but a compiled binary may need its own asset strategy
- `PROJECT_ROOT` is inferred from the compiled module location, which may be fragile once the executable is moved away from the repo checkout

## Desired Binary Shape

The binary should behave like a self-contained Monk API runtime:

- Runs without requiring a separate Node/Bun source tree at runtime
- Uses SQLite by default for zero-config startup
- Can still support PostgreSQL when explicitly configured
- Has a predictable output path and invocation shape
- Resolves runtime assets and file paths in a way that works when moved outside the repository

## Proposed Workstreams

### 1. Define the binary contract

Decide and document what the compiled executable guarantees.

Questions to answer:

- Is the binary SQLite-only, or should it remain dual-mode?
- Which env vars remain required at startup?
- Which paths are runtime data vs repo-relative assets?
- Should the binary support a dedicated `--help` / `--version` / `--data-dir` interface?

Acceptance criteria:

- The runtime contract is explicit in docs
- Zero-config startup behavior is unambiguous
- PostgreSQL support, if retained, is clearly documented as optional

### 2. Make asset and path resolution binary-safe

Audit how the compiled executable locates:

- fixtures
- SQL files
- markdown docs used at runtime
- filesystem roots
- any package-loaded assets

Acceptance criteria:

- Runtime file lookups do not depend on being launched from the repo root
- Binary execution works when the executable is copied elsewhere
- Missing assets fail clearly instead of silently falling back

### 3. Normalize build output and packaging

Standardize the build command/output so the repo has one obvious binary build story.

Likely follow-up tasks:

- align the `build:standalone` output path with documentation
- decide whether the output directory should remain `dist-standalone/`
- make the build script verify the produced executable exists and is runnable

Acceptance criteria:

- The documented output path matches the actual binary location
- The build script produces one obvious artifact
- The artifact name is stable enough for CI and release automation

### 4. Update docs for the binary workflow

Document how to build, run, and configure the executable.

Likely doc updates:

- README binary section
- local development instructions for the standalone build
- production/runtime notes for SQLite vs PostgreSQL
- troubleshooting for binary startup and data directory issues

Acceptance criteria:

- A new contributor can build and run the binary from docs alone
- The docs do not contradict the actual output path or runtime mode

### 5. Validate the binary path

Add a small verification pass for the binary artifact.

Useful checks:

- build succeeds
- binary starts with `--no-startup`
- binary starts in SQLite mode with default env
- binary can still start with PostgreSQL env vars if that remains supported

Acceptance criteria:

- The build path is validated at least once after the implementation pass
- Startup errors are actionable and not vague

## Non-Goals For This First Pass

- No implementation changes yet
- No API redesign
- No packaging release process
- No change to tenant behavior unless required for binary startup
- No attempt to solve every runtime asset issue preemptively

## Open Questions

1. Should the binary be officially marketed as the primary distribution path, or just an alternate artifact?
2. Should SQLite become the binary default permanently, or only for standalone builds?
3. Should asset loading use executable-relative paths, a bundled manifest, or an explicit runtime root?
4. Should the standalone build output remain under `dist-standalone/`, or move to a more release-oriented path?
5. Do we want the binary build to be CI-validated before any release work?

## Suggested Second-Pass Sequence

1. Resolve the binary contract and runtime assumptions
2. Tighten path resolution for executable execution
3. Normalize the build output and command naming
4. Update docs and examples
5. Run validation on the standalone artifact

## Status

- Plan written: yes
- Implementation started: no
- Second pass: pending
