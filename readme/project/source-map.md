# Project Source Map

This map records external sources whose freshness materially affects repository
automation. Recheck them when the named trigger occurs.

| Topic | Authoritative Source | Checked | Refresh Trigger |
| --- | --- | --- | --- |
| Workflow events and permissions | [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) and [automatic token authentication](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token) | 2026-07-14 | Workflow event or permission change |
| Concurrency semantics | [GitHub concurrency documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) | 2026-07-14 | Stale or overlapping publisher behavior |
| Moving refs | [Git reference REST endpoints](https://docs.github.com/en/rest/git/refs) | 2026-07-14 | Tag update failure or API-version change |
| Release discovery/create/update | [GitHub release REST endpoints](https://docs.github.com/en/rest/releases/releases) and [GitHub CLI release manual](https://cli.github.com/manual/gh_release) | 2026-07-14 | API listing, CLI flag, draft, clobber, or latest behavior changes |
| Runner tools | [Ubuntu 24.04 runner manifest](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md) | 2026-07-14 | Runner image or tool availability changes |
| Official action pins | [checkout](https://github.com/actions/checkout), [upload-artifact](https://github.com/actions/upload-artifact), and [download-artifact](https://github.com/actions/download-artifact) | 2026-07-14 | Dependabot alert, deprecation, Node runtime change, or scheduled hygiene |
| Framework data runtime | [Node.js releases](https://nodejs.org/en/about/previous-releases) and [TypeScript execution](https://nodejs.org/dist/latest/docs/api/typescript.html) | 2026-08-11 | Node 22 support change, runtime failure, or reconsidering TypeScript |
