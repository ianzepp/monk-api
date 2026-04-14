# Agent Instructions

- Read the relevant docs before assuming anything.
- Before tests, read `spec/README.md`.
- Know the command split:
  - `bun run build` compiles `src/`
  - `bun run build:spec` type-checks `spec/`
- The server runs on port **9001** (`bun run start` / `bun run stop`).
- Docs live with code: `spec/README.md`, `src/routes/docs/PUBLIC.md`, and per-route docs under `src/routes/`.
- Check `package.json` and the code/config before changing behavior.
- Ask before architectural changes.
