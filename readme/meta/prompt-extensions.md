# Prompt Extensions

Prompt extensions are reviewed, data-only npm packages whose Markdown skill facets are
appended to selected compiled agent profiles. They do not register code, commands,
tools, hooks, permissions, provider plugins, or native harness skills. An extension is
used only when the client names it explicitly and the installed dependency matches the
client manifest and npm lock exactly.

## Client Declaration

Declare every extension as an exact stable version in `dependencies` and list it in the
desired composition order under `metaFramework.extensions`:

```json
{
  "dependencies": {
    "@example/review-skill": "1.2.3",
    "meta-framework": "npm:@tvald/meta-framework@1.0.0"
  },
  "metaFramework": {
    "extensions": ["@example/review-skill"]
  }
}
```

The allowlist may be absent or empty to disable extensions. The framework never scans
`node_modules`. An allowlisted package must be a top-level production dependency, not a
development, optional, peer, transitive, aliased, linked, workspace, file, Git, URL, or
tag dependency. Install the reviewed lock with scripts disabled unless the project has
separately approved a lifecycle-script allowlist:

```sh
npm ci --ignore-scripts
```

The v3 lock entry must carry the same exact version, a credential-free HTTPS `.tgz`
resolution, and canonical SHA-512 integrity. A competing `npm-shrinkwrap.json`, a
dependency-bearing extension, or an installed identity/root mismatch fails before any
prompt is emitted.

## Extension Package

An extension root contains only `package.json`, `meta-framework.extension.json`, its
declared `.md` facets under `facets/`, and optional root `README`, `README.md`, `LICENSE`,
`LICENSE.md`, `NOTICE`, `NOTICE.md`, or `CHANGELOG.md` prose. Package scripts,
dependencies, entrypoints, executable or code-like files, symbolic or hard links,
nested dependencies, provider-discovery trees, and undeclared content are forbidden.
Extension-root directories and files must not be group/world-writable or carry special
permission bits. Declared paths reject `node_modules` and provider-native agent, skill,
command, hook, plugin, or tool discovery segments case-insensitively.

The manifest is canonical JSON followed by one LF and has this closed v1 shape:

```json
{"apiVersion":1,"facets":[{"id":"review","kind":"skill","order":10,"path":"facets/review.md","profiles":["implementer","root"],"slot":"extension.review"}],"frameworkRange":">=1.0.0 <2.0.0","manifestVersion":1,"name":"@example/review-skill","namespace":"example.review","promptFormatVersions":[1],"version":"1.2.3"}
```

Names, versions, and compatibility must match the installed package and executing
framework. Namespaces, local IDs, slots, orders, paths, and profiles are validated
before facet reads. Profiles use canonical order: `implementer`, `qa`, `reviewer`,
`root`, `security`. Facet order is strictly increasing within the package.

Each facet is nonempty UTF-8/LF Markdown of at most 4,096 bytes. It cannot contain
template syntax, framework envelope/marker sentinels, unsafe terminal/control bytes, or
Unicode bidirectional controls. Facets receive emitted IDs of
the form `extension.NAMESPACE.LOCAL_ID`, retain an `extension.NAMESPACE` topic, and are
appended after all core and harness facets. No merge or last-writer-wins behavior is
available. A slot may be reused only when the targeted profiles are disjoint.

## Limits And Provenance

One client may allow at most eight extensions, with at most eight facets per package,
16 facets in aggregate, and 16 selected extension facets per profile. Package inventory,
manifest, facet, extension-body, combined-body, prompt-manifest, and final-output limits
are checked before the CLI performs its single stdout write.

Compiled manifests record the selected package name/version, namespace, compatibility,
lock integrity, and exact package/extension-manifest digests. Selected facet records
carry the namespaced ID/topic/path plus identical raw/rendered content digests. Resolved
URLs, filesystem paths, client policy, environment data, provider data, and unselected
prose are never included. Use the namespaced identifier to inspect an allowed facet:

```sh
npm run --ignore-scripts --silent meta -- explain extension.example.review.review
```

Lock integrity proves the selected package archive, not that its instructions are
semantically safe. Client maintainers remain responsible for reviewing publisher and
facet content before allowlisting it.
