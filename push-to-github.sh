#!/bin/bash
# Push this project to existing GitHub repo (has one README commit)
# Run from project root: ./push-to-github.sh

set -e
REPO_URL="https://github.com/Paristech1/SpeedBumbps.git"

if [ ! -d .git ]; then
  git init
  git add -A
  git commit -m "Initial commit: Speed Bump app (Flutter, map, routing, auth, submissions, admin)"
  git branch -M main
  git remote add origin "$REPO_URL"
  echo "Pulling existing repo (README) and merging..."
  git pull origin main --allow-unrelated-histories --no-edit || true
  if git diff --name-only --diff-filter=U | grep -q .; then
    echo "Resolving conflicts: keeping our README and project files..."
    git checkout --ours README.md 2>/dev/null || true
    git add -A
    git commit -m "Merge remote README; keep full project README" --no-edit || true
  fi
else
  git remote add origin "$REPO_URL" 2>/dev/null || true
  git add -A
  git status
  if ! git diff --cached --quiet 2>/dev/null; then
    git commit -m "Add full Speed Bump project (Flutter, map, routing, auth, submissions, admin)" || true
  fi
  echo "Pulling existing repo and merging..."
  git pull origin main --allow-unrelated-histories --no-edit || true
  if git diff --name-only --diff-filter=U | grep -q .; then
    git checkout --ours README.md 2>/dev/null || true
    git add -A
    git commit -m "Merge remote; keep project README" --no-edit || true
  fi
fi

echo "Pushing to $REPO_URL ..."
git push -u origin main

echo "Done. Project is at: $REPO_URL"
