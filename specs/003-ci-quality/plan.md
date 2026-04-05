# Plan: CI Workflow, Code Quality & Dependabot

**Spec**: [specs/003-ci-quality/spec.md](specs/003-ci-quality/spec.md) | **Date**: 2026-04-05

## Summary

Add a three-job CI workflow (`quality`, `codeql`, `e2e`) to gate all PRs with type checking, linting, unit tests, security scanning, and end-to-end tests. Add Dependabot for weekly npm and GitHub Actions updates. Streamline the existing `deploy.yml` by removing its redundant test step.

## Architecture Decisions

| Decision           | Choice                                                                     | Rationale                                                                          |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Job structure      | 3 parallel/chained jobs                                                    | `quality` is fast-fail gate; `codeql` runs independently; `e2e` waits on `quality` |
| CodeQL init        | `actions/checkout` → `github/codeql-action/init` → `autobuild` → `analyze` | Standard CodeQL JS/TS workflow; autobuild handles npm projects                     |
| Playwright install | `npx playwright install --with-deps chromium`                              | Installs only Chromium + OS deps; matches `playwright.config.ts` single project    |
| Coverage provider  | `v8` via Vitest                                                            | Vitest default; no extra dependency                                                |
| Artifact retention | 7 days for Playwright report                                               | GitHub default; sufficient for debugging failed PRs                                |

## Implementation Phases

### Phase 1: CI Workflow

1. [ ] Create `.github/workflows/ci.yml` with the following structure:
   - **Trigger**: `push: branches [main]`, `pull_request: branches [main]`
   - **Job `quality`**:
     - `runs-on: ubuntu-latest`
     - `actions/checkout@v4`
     - `actions/setup-node@v4` with `node-version: 22` and `cache: npm`
     - `npm ci`
     - `npx tsc -b` (type check)
     - `npx eslint .` (lint)
     - `npx vitest run --coverage` (unit + component tests)
   - **Job `e2e`**:
     - `needs: quality`
     - `runs-on: ubuntu-latest`
     - Checkout, setup Node 22, `npm ci`
     - `npx playwright install --with-deps chromium`
     - `npx playwright test`
     - Upload `playwright-report/` artifact on failure (`if: ${{ failure() }}`)
2. [ ] Verification: Push to a PR branch and confirm `quality` and `e2e` jobs run and pass.

### Phase 2: CodeQL Scanning

1. [ ] Add `codeql` job to `.github/workflows/ci.yml`:
   - `runs-on: ubuntu-latest`
   - **Trigger addition**: Add `schedule: cron: '25 4 * * 1'` (weekly Monday) to the workflow-level `on:` block
   - **Permissions**: `security-events: write`, `contents: read`, `actions: read`
   - Steps:
     - `actions/checkout@v4`
     - `github/codeql-action/init@v3` with `languages: javascript-typescript`
     - `github/codeql-action/autobuild@v3`
     - `github/codeql-action/analyze@v3` with `category: /language:javascript-typescript`
2. [ ] Verification: Confirm CodeQL job completes and SARIF results appear in the repo's Security → Code scanning tab.

### Phase 3: Dependabot Configuration

1. [ ] Create `.github/dependabot.yml`:
   ```yaml
   version: 2
   updates:
     - package-ecosystem: npm
       directory: /
       schedule:
         interval: weekly
         day: monday
       open-pull-requests-limit: 5
       commit-message:
         prefix: "deps"
     - package-ecosystem: github-actions
       directory: /
       schedule:
         interval: weekly
         day: monday
       open-pull-requests-limit: 5
       commit-message:
         prefix: "ci"
   ```
2. [ ] Verification: Confirm Dependabot tab shows the configuration is active after merging to `main`.

### Phase 4: Streamline Deploy Workflow

1. [ ] Edit `.github/workflows/deploy.yml`:
   - Remove the `npm test` step from the `build` job (CI already gates this)
   - Keep `npm run build` step (still needed for artifact generation)
2. [ ] Verification: Deploy workflow still builds and deploys successfully without the test step.

## File Changes

| File                           | Action | Purpose                                                   |
| ------------------------------ | ------ | --------------------------------------------------------- |
| `.github/workflows/ci.yml`     | Create | New CI workflow with `quality`, `codeql`, and `e2e` jobs  |
| `.github/dependabot.yml`       | Create | Dependabot config for npm + GitHub Actions weekly updates |
| `.github/workflows/deploy.yml` | Modify | Remove redundant `npm test` step                          |

## Testing Strategy

- [ ] Push CI workflow to a feature branch and open a PR to validate all three jobs run
- [ ] Intentionally introduce a type error to verify `quality` job fails
- [ ] Intentionally introduce an ESLint violation to verify `quality` job fails
- [ ] Verify CodeQL SARIF upload in Security tab after the `codeql` job completes
- [ ] Verify `e2e` job uploads Playwright report artifact on test failure
- [ ] Merge to `main` and verify Dependabot creates its first update PRs within a week
- [ ] Verify `deploy.yml` still deploys successfully after removing `npm test`

## Risks & Mitigations

| Risk                                        | Likelihood | Mitigation                                                                                                          |
| ------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Playwright install slow in CI               | M          | Cache is not practical for Playwright browsers; `--with-deps chromium` installs only one browser to minimize time   |
| CodeQL autobuild fails on Vite project      | L          | JavaScript/TypeScript CodeQL uses extraction (not compilation); autobuild is optional but included for completeness |
| Dependabot PRs overwhelm reviewers          | L          | `open-pull-requests-limit: 5` caps concurrent PRs; weekly cadence is manageable                                     |
| Removing `npm test` from deploy creates gap | L          | Deploy only triggers on `main` push; CI runs on all PRs targeting `main`, so tests always run before merge          |
