# Native Harness Prompt Facets

This package-owned document is the sole canonical owner for the narrow native mechanics
that a nonportable root prompt adds. Semantic role and delegation policy remain in the
long-form framework owners selected by the profile.

<!-- meta-framework-facet:v1:start harness.delegation -->
## Native Delegation Mechanics

For the selected `{{HARNESS}}` harness, use only `{{NATIVE_SURFACE}}` for child-agent
work. Before every spawn or resume, run both package-owned probes:

```sh
npm run --silent meta -- capability --harness {{HARNESS}} --name delegation
npm run --silent meta -- quota --harness {{HARNESS}}
```

Treat only exit zero with capability `disposition: "enabled"` and quota `disposition:
"proceed"` as permission to use the native surface. Any other result fails closed: do
not start or resume a child, and follow the selected capacity and recovery facets. Use
the native surface only for the bounded assignments authorized by the root profile;
never invoke an alternate delegation mechanism.
<!-- meta-framework-facet:v1:end harness.delegation -->

The placeholders above are compiler-controlled values from the closed harness registry;
client, environment, provider response, and task data never supply substitutions.
