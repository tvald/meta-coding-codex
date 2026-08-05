# Framework Changelog

Record edits to this project's installed framework core here so they can be audited,
evaluated, reverted, or proposed upstream without relying on session memory. Newest
entries go first. See [framework improvement](framework-improvement.md) for the change
lifecycle and [knowledge management](knowledge-management.md#artifact-budgets-and-overflow)
for the active-file budget.

This preamble is the blank seed shipped in a clean framework package. Entries are
installed-framework state inside a project whose primary product is elsewhere: never
copy them into another project's clean package. A repository developing the framework
itself keeps its tasks and framework-development history in its project-side owners.
When backporting a local change, transfer every unique fact and piece of evidence into
those upstream task, decision, quality, or changelog records before restoring the
upstream seed to this preamble.

Keep entries append-only after instantiation and place them below the local-entry marker.
Each entry contains:

- `## YYYY-MM-DD: Short Title`
- `Status:` Adopt, Pilot, Revise, or Reject disposition
- `Evidence:` decisive local evidence and links to its canonical project records
- `Change:` concise before/after behavior and affected framework owners
- `Success signal:` observable evidence that the disposition works
- `Review or sunset trigger:` condition that requires another look

Limit the active file to 20 entries or 160 lines. Move older entries unchanged to
`readme/archive/framework-changelog-YYYY.md` and leave an archive pointer here.

<!-- Local framework entries go below this line. -->
