# 0027: Revise Controller Operator Activation And Control Fencing

Status: Accepted

Date: 2026-08-15

Owners:

- Root Orchestrator under the accepted T-0054 implementation authority

Supersedes:

- Decision 0025 only where its resume grammar omitted the control generation and where
  it did not distinguish safety-reducing stop publication from forward effect
  activation. Its controller architecture, ownership, concurrency, isolation,
  recovery, and live-canary gates remain in force.

Superseded by:

- None

## Context

T-0054 composition proved two operator-boundary defects before live activation. First,
`resume` must compare both the expected epoch and expected control generation. Epoch
fences the controller writer and process domain; control generation fences the exact
sticky stop/revision decision being reconciled. Discarding either value permits a stale
operator observation to clear a newer control.

Second, the activation module validates a supplied receipt against supplied current
context, but deliberately does not mint receipts or establish a protected issuer,
recognition store, or revocation authority. Treating an environment, argument, model
output, or caller-supplied receipt-shaped object as that authority would turn a
validation seam into a trust root.

The original coarse command mapping also classified stop as an ordinary ledger-write
effect. A live run must remain stoppable after a forward-effect receipt expires or is
revoked. Stop publication reduces authority: it appends one exact-run,
generation-compare-and-swap request and grants no signal, cleanup, task, workspace, Git,
provider, resume, or lock-recovery capability.

## Decision

### Revise

Revise the public resume command to require both fences:

```text
meta implement resume RUN --expected-epoch N --expected-control-generation N
```

The persisted resume request binds both values. Acceptance occurs only under the exact
current run lock after replay and reconciliation; it rotates the epoch, advances the
control generation, and clears sticky stop only after every prior effect has a safe
observed disposition. A request publisher does not itself authorize provider launch or
any other forward effect.

Treat exact-generation stop request publication as a non-amplifying operator control,
not as general `ledger_write` activation. The installed operator may append a closed,
bounded stop request when all of the following are true:

- the Git-common ledger already contains the named run;
- the request names the caller's exact expected control generation;
- the request ID is deterministically bound to the run, generation, and reason;
- filesystem ownership and mode checks for the existing ledger pass; and
- publication uses the existing no-replace, durable, append-only control path.

This authority ends at publication. Accepting the stop, interrupting a provider or
process, cleaning a resource or workspace, recovering a lock, or advancing any task or
Git state requires its own current authority and postcondition evidence. Duplicate stop
publication is byte-identical; a conflicting request or stale generation fails closed.
After durable publication, the operator may best-effort notify a run/lock/epoch-scoped
ephemeral doorbell. The hint is untrusted and carries no authority; the owner acts only
after replaying the durable request. Notification failure never invalidates or rolls back
the stop request.

Keep every forward or destructive operator path deny-by-default. A package-owned
operator composer may be implemented and exercised with injected offline capabilities,
but the installed command has no production activation source until a later accepted
decision defines all of the following:

- the protected issuer and issuance ceremony;
- durable recognition and revocation state;
- reconstruction of current policy, task, ledger, process, workspace, and Git evidence;
- capability delivery that is unavailable to model prompts, repositories, workers,
  tool environments, sibling processes, and ordinary command arguments; and
- expiry, rotation, audit, recovery, disablement, and emergency-stop behavior.

Receipt validators remain pure fail-closed predicates. They are not an issuer, a secret,
or proof that the operating system, Codex, process domain, filesystem, or workspace
enforces the claimed mechanism. The real provider, signal, cleanup, resume, lock
recovery, Git, task, final-ref, and live-canary paths remain disabled until their
separate activation and compatibility evidence is recorded.

Normal `status` is a bounded public projection of normalized IDs, digests, phases,
generations, counts, and reconciliation state. It must not expose lock recovery tokens,
provider executable paths, raw manifests, prompts, streams, environment data, or
uncontrolled filesystem paths. Exact recovery tokens remain available only through the
explicit lock-inspection command and retain their existing filesystem access boundary.

## Options Considered

| Option | Benefit | Cost Or Risk | Disposition |
| --- | --- | --- | --- |
| Resume with epoch only | Matches the earlier help text | Can clear a newer stop/control observation | Reject |
| Map each command to one coarse receipt | Small CLI | One capability silently authorizes unrelated nested effects | Reject |
| Treat supplied receipt and context as a trust root | Easy live toggle | Forgeable authority with no issuer or revocation proof | Reject |
| Require forward activation even to publish stop | Uniform gate | An expired/revoked capability can make a live run unstoppable | Reject |
| Exact stop publication plus separately gated effects | Preserves emergency control and least authority | Requires a split operator adapter | Adopt |

## Consequences

Positive:

- A stale resume cannot discard a newer control generation.
- Revoking forward authority cannot remove the operator's bounded stop-request path.
- Offline package tests can exercise the complete composer without implying live trust.
- Status no longer leaks the capability needed for lock recovery.

Negative:

- The CLI and operator adapter need separate control-publication and effect-capability
  paths.
- Live activation remains unavailable until a protected issuer and compatibility proof
  are separately accepted.

Neutral:

- Existing immutable run records remain readable. No live T-0054 run was activated, so
  the stricter resume grammar requires no persisted-state migration.
- Lock inspection remains an explicit sensitive diagnostic rather than part of status.

## Confidence

Confidence: High for the two-fence resume and stop/control split; Medium for the eventual
activation delivery mechanism because it is intentionally undecided and disabled.

## Review Trigger

Revisit when a protected activation issuer is proposed, Codex or the operating system
can prove descendant-complete containment, stop publication is moved across a remote
trust boundary, or the controller gains a non-filesystem ledger.
