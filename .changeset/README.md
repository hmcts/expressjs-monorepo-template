# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage versioning and publishing of libraries to the HMCTS Azure Artifacts `hmcts-lib` feed.

Currently the only library published from this monorepo is **`@hmcts-cft/simple-router`**. Other libraries under `libs/` are workspace-only — see the `ignore` list in `config.json` for the current scope.

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
- When a maintainer merges that PR, the workflow re-runs, publishes the new versions to the Azure Artifacts feed, and creates a GitHub release.

## Onboarding a new library

To start publishing a library currently in the `ignore` list:

1. Remove its package name from `ignore` in `config.json`.
2. Make sure the library's `package.json` has: `description`, `license`, `repository` (with `directory`), `files`, `exports`, and `publishConfig: { "registry": "https://pkgs.dev.azure.com/hmcts/Artifacts/_packaging/hmcts-lib/npm/registry/" }` — see `libs/simple-router/package.json` for the canonical shape.
3. Rename it under the `@hmcts-cft` scope (the public `@hmcts` scope on npmjs.org is unrelated and not used here).
4. Create the first changeset for it and merge.
