# Copied-Client Transition

Use this one-time procedure only for a client that intentionally replaces a reviewed
pre-npm framework copy with the immutable npm dependency. It is guidance, not a cleanup
command or migration executable. The package never deletes client files.

The remote moving `latest` release and tag are historical external state: do not delete
or mutate either one through this transition.

The packaged [legacy ownership manifest](legacy-copy-manifest-v1.json) describes the
49 ordinary files in the last reviewed pre-npm archive snapshot at Git commit
`c90211b9a2cd888a1796dbd584384fd1f9eaa132`. It does not claim that a same-named client
path came from that archive. Path, directory, filename, matching mode, matching digest,
or matching bytes alone is not provenance.

## Safety Boundary

- Require explicit transition intent for this client, a clean recoverable Git boundary
  or reviewed backup, and evidence that identifies the copied release or commit.
- Treat the manifest as inert data. Do not execute it, convert it into a recursive
  deletion command, interpolate its fields into a shell, or trust an unvalidated copy.
- Consider only an ordinary in-root file whose physical path, single-link status, mode,
  byte length, SHA-256, and provenance all match one manifest entry. A symlink, hardlink,
  directory, special file, changed ancestor, mixed snapshot, modified file, or unproved
  same-name path is ambiguous and stops the transition.
- Apply the same-byte counterfactual before removal: even when a whole-file comparison
  matches the manifest's expected bytes, preserve it unless independent evidence proves
  it came from that reviewed copy. Matching content is necessary, never sufficient.
- Never treat `AGENTS.md`, `CLAUDE.md`, `package.json`, `package-lock.json`, another
  manifest or lockfile, `readme/README.md`, `readme/tasks/`, `readme/decisions/`,
  `readme/quality/`, `readme/threat-models/`, source learning, or any unlisted client
  file as cleanup input. The manifest records the historical generated `AGENTS.md`
  payload only to make the archive snapshot complete; bootstrap ownership is always
  resolved by the current initializer collision contract.
- A populated former `readme/meta/framework-changelog.md` is modified client evidence,
  not an owned blank seed. Preserve it for deliberate upstream issue or source-history
  reconciliation; never delete it as an exact-copy candidate.
- Abort the whole removal plan when any candidate is ambiguous. Do not remove the proved
  subset and leave a mixed framework tree.

## Transition Procedure

1. Record the legacy release or commit evidence and the exact client Git state. Stop if
   the old framework snapshot cannot be attributed to the manifest commit.
2. Add the exact dependency alias and exact local `meta` script to `package.json`. Create
   and review the lockfile without lifecycle scripts:

   ```sh
   npm install --package-lock-only --ignore-scripts --save-exact \
     'meta-framework@npm:@tvald/meta-framework@<exact-version>'
   npm ci --ignore-scripts
   npm run --ignore-scripts --silent meta -- project --version
   ```

3. Perform a read-only per-path dry run against the packaged manifest. Classify every
   historical entry as `exact_owned`, `absent`, or `ambiguous`, and separately list all
   protected client state and instruction paths. An unexpected file beneath an old
   framework directory is ambiguous even when every listed entry matches.
4. Review the complete dry run and the recovery boundary. Proceed only when every
   existing candidate is `exact_owned`, every protected path is preserved, and no
   process is concurrently changing the client tree.
5. Remove each reviewed `exact_owned` ordinary file individually. Never use a glob or
   recursive removal. Remove only directories proven empty after the individual files
   are gone; never remove a project, documentation, harness, or repository ancestor.
6. Resolve `AGENTS.md` and `CLAUDE.md` through current bootstrap ownership rather than
   the legacy manifest. Preserve established project instructions. Do not copy or merge
   package policy, adapters, roles, prompts, templates, or skills into the client.
7. Run the current guarded initializer sequence from the physical Git root:

   ```sh
   npm run --ignore-scripts --silent meta -- project preflight
   npm run --ignore-scripts --silent meta -- project init
   npm run --ignore-scripts --silent meta -- tasks doctor
   npm run --ignore-scripts --silent meta -- tasks startup
   ```

   Run `project init` only for a disposition it explicitly accepts. Legacy task data,
   partial state, prepared transactions, collisions, and malformed or busy state follow
   their named onboarding or recovery path; this transition does not migrate them.
8. Inspect the complete Git diff and prove that mutable client state, history, and
   instructions are intact. Commit the dependency, lockfile, reviewed removals, current
   bootstraps, and task evidence as one scoped transition only after all required checks
   pass.

## Stop And Escalate

Stop without deletion when provenance is missing, the legacy snapshot differs, a path
has more than one hard link, an ancestor changed, a former changelog is populated, or a
same-named client file cannot be attributed. Preserve the evidence and ask a maintainer
to classify it. Framework defects are fixed in the source repository and delivered by
exact dependency replacement; installed package bytes and surviving client files are
never patched in place.
