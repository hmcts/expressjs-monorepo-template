# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage versioning and publishing of public libraries to npm.

Currently the only library published from this monorepo is **`@hmcts/simple-router`**. Other libraries under `libs/` are workspace-only — see the `ignore` list in `config.json` for the current scope.

## Releasing a change

1. Make your code change to a publishable library.
2. From the repo root, run:

   ```bash
   yarn changeset
   ```

   Follow the prompts: select the affected package(s), pick a bump type (`patch` / `minor` / `major`), and write a short summary that will appear in the changelog.

3. Commit the generated `.changeset/<random>.md` file alongside your code change in the same PR.

## What happens next

On merge to `master`:

- The Release workflow (`.github/workflows/workflow.release.yml`) consumes pending changesets and opens (or updates) a **"chore: version packages"** pull request that bumps the affected `package.json` versions and writes changelogs.
- When a maintainer merges that PR, the workflow re-runs, publishes the new versions to npm with provenance attestation, and creates a GitHub release.

## Onboarding a new library

To start publishing a library currently in the `ignore` list:

1. Remove its package name from `ignore` in `config.json`.
2. Make sure the library's `package.json` has: `description`, `license`, `repository` (with `directory`), `files`, `exports`, and `publishConfig: { "access": "public", "provenance": true }` — see `libs/simple-router/package.json` for the canonical shape.
3. Create the first changeset for it and merge.

The `name` field must be unique on npm and use the `@hmcts/` scope.
