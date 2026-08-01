# Hosting & Publishing

## What exists

| Item | Value |
|------|-------|
| Live URL | https://sldl145.github.io/training-dashboard/ |
| Repo | https://github.com/sldl145/training-dashboard |
| Branch | `main` (GitHub Pages serves it; a push publishes within ~60s) |
| Page | `index.html` - never rename (Pages requires it) |
| Visibility | **Public** - anyone with the URL can view |

> **Privacy note:** the repo is public, so training and body-composition data is
> readable by anyone with the URL. No credentials or secrets are in the repo (static
> HTML, no live API calls; chart libraries are vendored). The only exposure is the
> personal metrics themselves. Make the repo private if that changes - and remember
> free GitHub Pages requires a public repo.

## Publishing (the whole process)

Claude Code sessions push `main` directly with the git CLI - that IS the deploy:

1. Make the dashboard edits (targeted, never wholesale regeneration).
2. `node scripts/validate.js` - must exit 0.
3. `node scripts/smoke.js` - must pass (real-browser render check).
4. Commit (`Deploy YYYY-MM-DD HH:MM` + summary body) and `git push origin main`.
5. ~60s later, spot-check the live URL (Pawel usually does this from his phone).

Rules that survived from the old system:
- **Never force-push.** Regular `git push` only.
- **Never move file contents through MCP file-push tools** (`create_or_update_file`,
  `push_files`): the model must reproduce the whole file as a tool parameter and large
  content silently truncates (a 109 KB file was once cut to 509 bytes). The git CLI
  does not have this problem - it is the only sanctioned push path.
- **No side branches, no PRs** for routine updates - this is a single-user pipeline.

## History (why it works this way)

Until Aug 2026 the pipeline was: Cowork edited a local copy on Pawel's Mac →
`deploy.sh` / `deploydash` pushed it manually (PAT in 1Password). MCP-tool pushes and
VM-side git were both assessed and rejected (truncation / mount constraints - see the
retired Cowork project's DEPLOY_ASSESSMENT.md if ever needed). On 01/08/2026 the repo
became the system of record, Claude Code sessions push directly, and the Mac pipeline
was retired. The `deploy/` folder, deploy.sh, Desktop shortcut, and `deploydash` alias
are obsolete.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Site shows old version after push | Propagation delay | Wait 60s, hard-refresh (Cmd+Shift+R) |
| 404 on the URL | GitHub Pages disabled | Repo Settings → Pages → ensure `main` is selected |
| Push rejected (non-fast-forward) | Remote moved (another session pushed) | `git pull --rebase origin main`, re-run checks, push again |
| Charts blank on live page | Bad deploy slipped through | `git revert` the bad commit, push; then fix properly with checks green |
