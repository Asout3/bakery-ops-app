# PR Recovery Guide

If your branch feels broken after a pull/rebase/reset, use this checklist to recover safely.

## 1) Confirm current branch and latest commits

```bash
git branch --show-current
git log --oneline -n 15
```

## 2) Fetch all remote refs

```bash
git fetch --all --prune
```

## 3) Check whether your expected commit exists

```bash
git show --name-only <commit_sha>
```

If the commit exists but is not in your branch history:

```bash
git cherry-pick <commit_sha>
```

## 4) If local history is badly diverged

Create a safety backup branch first:

```bash
git checkout -b backup/<date>-before-recovery
```

Then return to your working branch and reapply missing commits by cherry-picking.

## 5) Validate app before opening PR

```bash
npm test
npm run build
npm run lint
```

## 6) Push and open PR

```bash
git push origin <branch-name>
```

Then open/update your PR from that branch.
