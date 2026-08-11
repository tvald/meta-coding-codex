# Project Source Map

This map records external sources whose freshness materially affects repository
automation. Recheck them when the named trigger occurs.

| Topic | Authoritative Source | Checked | Refresh Trigger |
| --- | --- | --- | --- |
| Framework data runtime | [Node.js releases](https://nodejs.org/en/about/previous-releases) and [TypeScript execution](https://nodejs.org/dist/latest/docs/api/typescript.html) | 2026-08-11 | Node 22 support change, runtime failure, or reconsidering TypeScript |
| Harness skill discovery | [OpenAI Build skills](https://learn.chatgpt.com/docs/build-skills) and [Anthropic Extend Claude with skills](https://code.claude.com/docs/en/skills) | 2026-08-11 | Discovery path, metadata, symlink, invocation, or packaging behavior changes |
| npm package manifest and local execution | [npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/) and [scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/) | 2026-08-11 | npm major change, binary/script resolution failure, lifecycle change, or package inventory drift |
| npm dependency reproducibility | [npm package-lock.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/) | 2026-08-11 | npm major or lockfile-format change, non-reproducible install, or update-policy change |
| Node package entry-point isolation | [Node.js packages](https://nodejs.org/api/packages.html) | 2026-08-11 | Node support-floor or export/path behavior change |
