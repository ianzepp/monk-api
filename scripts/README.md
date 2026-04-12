# Scripts Directory

This directory contains the project-maintained shell and TypeScript helper scripts. The canonical command surface is `package.json`; prefer `bun run <script>` from the repository root.

## Available Package Scripts

### Build

```bash
bun run build
bun run build:packages
bun run build:spec
bun run build:standalone
```

- `build` compiles workspace packages, compiles `src/` to `dist/`, resolves TypeScript path aliases, injects the package version, and copies runtime assets.
- `build:packages` builds all workspace packages under `packages/`.
- `build:spec` type-checks the test suite with `tsconfig.spec.json`.
- `build:standalone` creates a Bun standalone executable under `dist-standalone/`.

### Generated Maintenance Files

```bash
bun run build:todo
bun run build:deprecated
```

- `build:todo` scans comments and writes `planning/TODO.md`.
- `build:deprecated` scans JSDoc deprecation markers and writes `DEPRECATED.md`.

These files are generated maintenance outputs and should be refreshed only when needed.

### Server

```bash
bun run start
bun run start:bg
bun run start:dev
bun run stop
```

- `start` runs the compiled server from `dist/index.js`.
- `start:bg` starts the compiled server in the background and writes logs to `/tmp/monk-api.log`.
- `start:dev` runs `src/index.ts` with Bun watch mode.
- `stop` kills the compiled Bun server process.

Build before using `start` or `start:bg`.

### Tests

```bash
bun run test
bun run test:ts
bun run test:unit
bun run test:sh
bun run test:cleanup
```

- `test` and `test:ts` run the Bun TypeScript tests under `spec/**/*.test.ts`.
- `test:unit` runs `spec/**/*.unit.ts`.
- `test:sh` builds the project, starts the compiled API server, runs shell integration tests serially, then stops the server.
- `test:cleanup` removes temporary test tenants and databases via `spec/test-tenant-helper.sh`.

The shell integration suite requires local PostgreSQL tooling (`psql`, `createdb`, `dropdb`) and a valid local Monk database environment.

### Fixtures

```bash
bun run fixtures:build [template]
bun run fixtures:build -- --force [template]
```

`fixtures:build` creates PostgreSQL template databases from fixture directories such as `fixtures/testing`. The script is still present, but this checkout currently does not include a tracked `fixtures/` directory, so fixture commands will fail until fixture sources are restored or regenerated.

## Direct Helper Scripts

These scripts are invoked by package scripts or used for focused debugging:

- `scripts/build.sh`
- `scripts/build-spec.sh`
- `scripts/build-standalone.sh`
- `scripts/build-todos.sh`
- `scripts/build-deprecated.sh`
- `scripts/fixtures-build.sh`
- `scripts/test.sh`
- `scripts/test-sh.sh`
- `scripts/test-bun.sh`
- `scripts/test-dist.sh`
- `scripts/test-standalone.sh`
- `scripts/test-cleanup.sh`
- `scripts/config-helper.sh`
- `scripts/decrypt.ts`

## Removed Historical Commands

Older documentation referenced setup and fixture-management scripts such as `autoinstall.sh`, `install-db.sh`, `fixtures-deploy.ts`, `fixtures-generate.ts`, `fixtures-lock.sh`, and `tenant-create.ts`. Those files are not present in this checkout. Treat references to those commands in old docs as historical until the scripts are restored.
