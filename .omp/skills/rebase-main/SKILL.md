---
name: rebase-main
description: Safely update the current branch from the latest origin/main, preserve working changes, build through Just, and review the resulting diff for correctness and security issues. Use for rebase main, update branch from main, refresh a branch, or validate a rebased diff.
---

# Rebase Main

Update the current branch from the latest remote `main` without losing work. Build through `just`; review every resulting diff before delivery.

<critical>
- MUST fetch `origin/main`; NEVER rebase onto a stale local `main`.
- MUST preserve a dirty worktree before rebasing.
- MUST run `just build`; NEVER deploy as part of this workflow.
- MUST review correctness and security before declaring success.
</critical>

## Project interface

- `just build` = `bun run build` across all workspaces.
- `just deploy herdr` deploys a compiled binary; NEVER invoke it here.
- Existing staged and unstaged changes belong to the user. Preserve them exactly.

## Workflow

1. **Inspect state.** Record branch, `git status --short`, and existing stashes.
2. **Fetch main.** Run `git fetch --prune origin main`. Missing `origin` or `origin/main` = BLOCKED; NEVER silently fall back to local `main`.
3. **Protect changes.** Dirty worktree? `git stash push --include-untracked -m 'omp-rebase-main-preserve-worktree'`. Preserve only this named stash for restoration.
4. **Rebase.** Run `git rebase origin/main`.
   - Conflict? Read both sides and surrounding callers; retain compatible intent.
   - Stage only resolved paths; continue with `GIT_EDITOR=true git rebase --continue`.
   - NEVER use `git rebase --skip`; it drops branch changes.
   - Unrelated worktree collision? Preserve it, clear only the replayed path, then continue.
5. **Restore work.** After successful rebase, pop only the named preservation stash. Resolve any restoration conflict without overwriting user edits.
6. **Build.** Run `just build`. A failed build blocks delivery.
7. **Review diff.** Inspect `git diff --check origin/main...HEAD`, `git diff origin/main...HEAD`, and staged/unstaged worktree diffs.
   - Run `reviewer` and `security-reviewer` concurrently against that exact diff.
   - Check trust boundaries, auth/authorization, secrets, injection, path/command handling, dependency changes, unsafe defaults, data loss, and regressions.
   - Fix confirmed in-scope findings; report blockers and unverified concerns precisely.
8. **Report.** State fetched base, rebase result, build result, review findings, and restored/staged/unstaged user work.

<critical>
- NEVER claim the branch is current without fetching `origin/main`.
- NEVER hide, discard, stage, or commit unrelated user changes.
- NEVER deliver a rebased branch without a successful `just build` and diff review.
</critical>
