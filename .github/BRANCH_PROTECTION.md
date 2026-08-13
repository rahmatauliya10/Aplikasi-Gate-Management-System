# GitHub Governance & Branch Protection Standard (TASK 15 / P2)

## Protected Branches
- `main`
- `master`
- `develop`

## Required Branch Protection Rules
1. **Require Pull Request Before Merging**:
   - Minimum 1 approving review from Code Owners / Senior Engineers.
   - Dismiss stale pull request approvals when new commits are pushed.
   - Require review from Code Owners.

2. **Require Status Checks to Pass Before Merging**:
   - `Backend Test, Coverage, Build & Schema Validation (fresh)`
   - `Backend Test, Coverage, Build & Schema Validation (upgraded)`
   - `Frontend Build & Bundle Verification`
   - `Dependency Security & Secret Scan`
   - `Full-Stack Staging Stack & Cross-Stack E2E Gate (GBB / GSP / GBJ)`

3. **Strict Enforcements**:
   - Require branches to be up to date before merging.
   - Do NOT allow bypassing above settings for administrators.
   - Block force pushes (`git push --force` prohibited).
   - Block branch deletions.
