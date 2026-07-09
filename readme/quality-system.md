# Quality System

The quality system ensures the repository improves over time while preserving velocity. It combines automated checks, human-style review, risk gates, and consistency checks.

## Quality Gates By Risk

| Risk Level | Examples | Required Gate |
| --- | --- | --- |
| Low | Docs, comments, small styling, harmless config | Read-through and relevant lightweight check |
| Medium | Localized code behavior, non-critical UI, isolated refactor | Tests for touched behavior, lint/type/build as relevant, diff review |
| High | Auth, payments, data migration, security, public API, architecture, production ops | Decision review, expanded tests, security checklist, rollback or mitigation plan |
| Critical | Data deletion, legal/compliance impact, irreversible production action | Explicit user approval or established release process, dry run, backup/rollback, audit trail |

Use the highest applicable risk level.

## Standard Verification Matrix

For each task, decide which checks apply:

- Unit tests.
- Integration tests.
- End-to-end or browser tests.
- Type check.
- Lint.
- Format check.
- Build/package.
- Migration test.
- Accessibility check.
- Security check.
- Performance smoke test.
- Documentation link or command validation.
- Manual inspection for UI or workflow changes.

Run the smallest set that gives credible confidence. State skipped checks and why.

## Review Rubric

Review changes in this order:

1. Correctness: does it satisfy the request and acceptance criteria?
2. User impact: does the workflow make sense for affected users?
3. Safety: are data, permissions, secrets, and external actions protected?
4. Maintainability: is the design understandable and consistent?
5. Tests: would the tests fail for meaningful regressions?
6. Complexity: is this simpler than the problem requires?
7. Documentation: are changed behaviors and commands documented?
8. Consistency: does it match decisions, standards, and product language?

Prefer approving work that improves code health even if it is not perfect. Block issues that create real bugs, regressions, security risk, or misleading documentation.

## Security Checklist

Run for security-sensitive changes:

- External input validated on trusted side.
- Output encoded or escaped for target context.
- Authenticated routes require authentication by default.
- Authorization checks cover object-level and action-level access.
- Privileged logic is isolated and auditable.
- Secrets are not committed, logged, exposed to clients, or embedded in build output.
- Sensitive data is minimized, encrypted where required, and excluded from logs.
- Database calls use parameterized queries or safe ORM patterns.
- File upload/download paths validate type, size, path, permissions, and storage location.
- Errors do not expose stack traces, system details, or sensitive records.
- Dependencies and transitive risks are acceptable.
- AI tools cannot perform high-impact actions without appropriate guardrails.

## UI And UX Verification

For user-facing UI:

- Inspect desktop and mobile layouts.
- Check loading, empty, error, success, and permission states.
- Verify text fits containers and does not overlap.
- Verify keyboard and screen-reader basics for interactive controls.
- Confirm visual hierarchy fits the product domain.
- Test the primary workflow end to end.

## Release Readiness

Before release or merge, confirm:

- Acceptance criteria are met.
- Required tests and builds pass.
- Decision records are updated for significant choices.
- Documentation reflects current behavior.
- Rollback, migration, or mitigation path exists for high-risk changes.
- Monitoring, logging, or audit needs are covered.
- Known limitations are documented.

## Defect Handling Loop

When a defect is found:

1. Reproduce or characterize the failure.
2. Identify expected behavior from product context or user instruction.
3. Write or update a regression test when practical.
4. Fix the smallest responsible surface.
5. Run relevant checks.
6. Add a note to assumptions, standards, or decisions if the defect revealed missing knowledge.
7. Summarize impact and verification.

## Review Report

Use [templates/review-report.md](templates/review-report.md) when a change needs formal review. Keep findings concrete and ordered by severity.

