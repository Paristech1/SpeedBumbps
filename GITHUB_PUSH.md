# Push this project to GitHub (repo already has a README)

Repo: **https://github.com/Paristech1/SpeedBumbps.git**

Run these in Terminal from the project folder. If the repo already has a commit (e.g. a small README), use the **Existing repo** steps.

---

## Existing repo (one README commit already there)

```bash
cd "/Users/me/speed bump"

# 1. Initialize and make first commit with this project
git init
git add -A
git commit -m "Add full Speed Bump app (Flutter, map, routing, auth, submissions, admin)"
git branch -M main

# 2. Add remote and pull their commit, merge histories
git remote add origin https://github.com/Paristech1/SpeedBumbps.git
git pull origin main --allow-unrelated-histories --no-edit

# 3. If Git says "Conflict in README.md", keep our README and finish merge:
#    git checkout --ours README.md
#    git add README.md
#    git commit --no-edit

# 4. Push everything
git push -u origin main
```

If step 2 reports a conflict only in `README.md`, run the three lines in step 3, then run step 4.

---

## Or use the script

```bash
cd "/Users/me/speed bump"
./push-to-github.sh
```

(If the script stops at a merge conflict, run the step 3 commands above, then `git push -u origin main`.)
