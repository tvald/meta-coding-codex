# Native Harness Prompt Facets

This package-owned document is the sole canonical owner for the narrow native mechanics
that a nonportable root prompt adds. Semantic role and delegation policy remain in the
long-form framework owners selected by the profile.

<!-- meta-framework-facet:v1:start harness.delegation -->
## Native Delegation Mechanics

Use only `{{NATIVE_SURFACE}}` for the selected `{{HARNESS}}` harness. Before each spawn
or resume, run both probes:

```sh
npm run --ignore-scripts --silent meta -- capability --harness {{HARNESS}} --name delegation
npm run --ignore-scripts --silent meta -- quota --harness {{HARNESS}}
```

Only exit zero with capability `disposition: "enabled"` and quota `disposition:
"proceed"` permits delegation. Otherwise follow the capacity and recovery facets. Use
the native surface only for root-authorized bounded assignments; never use another
delegation mechanism. Each assignment must name one of
`implementer`, `reviewer`, `qa`, or `security`. {{PROFILE_LOADING}}
Never infer a profile, inherit `root`, broaden it, or use global, `npx`, network, or
package-path fallback.
<!-- meta-framework-facet:v1:end harness.delegation -->

The placeholders above are compiler-controlled values from the closed harness registry;
client, environment, provider response, and task data never supply substitutions.
