# Concurrent Implementation Controller Protocol

Status: Implementation contract for Decisions 0025 and 0027

Version: 1

This is the canonical serialization and reducer contract for the concurrent
implementation controller. Decision 0025 owns the architecture and default-disabled live
activation; Decision 0027 owns the two-fence resume grammar and bounded stop-control
authority; the threat model owns risks; the T-0054 quality record owns implementation
verification.

## Encoding And Common Types

Every persisted value uses the JSON Canonicalization Scheme (JCS) defined by RFC 8785.
Its file bytes are exactly the JCS serialization encoded as UTF-8: recursive UTF-16 code
unit key ordering, ECMAScript string escaping, no insignificant whitespace, no BOM or
trailing newline, and no Unicode normalization. Inputs with duplicate keys, invalid
Unicode, non-integer numbers, or integers outside the interoperable signed 53-bit range
are rejected before schema validation. `Digest` and `previousDigest` are SHA-256 over
those exact file bytes; a `Ref.digest` is the digest of the exact referenced file bytes.
Diagnostic presentation JSON, when emitted, is never persisted or hashed as a record.

Times are UTC RFC 3339. Paths are normalized repository-relative POSIX paths without
empty, `.`, `..`, absolute, NUL, or backslash segments. Controller identifiers match
`^[a-z][a-z0-9_-]{0,63}$`; task IDs retain the task-store `T-` grammar. A digest is
`sha256:` plus 64 lowercase hex digits; a Git OID is the exact lowercase hex length
reported by the repository object format.

Default limits are 256 KiB per record, 128 items per bounded array, 4,096 bytes per prose
field, 96 KiB per Root orientation, 128 KiB per typed model result, 10,000 events and
64 MiB of sanitized provider diagnostics per run. Hitting a limit quiesces the run and
records reconciliation; it never truncates authority, paths, checks, or lifecycle data.

```ts
type Binding = {
  runId: string; epoch: number; snapshotRevision: number;
  taskId: string; taskRevision: number; taskRecordVersion: number;
  capsuleDigest: Digest; controlGeneration: number; correctionGeneration: number;
}
type Ref = { kind: RefKind; id: string; digest: Digest }
type ResourceClaim = {
  key: string; mode: "shared_read" | "namespaced_write" | "exclusive";
  namespace: string | null
}
type RefKind = "assignment" | "attempt" | "operation" | "event" | "candidate" |
  "check_receipt" | "resource_receipt" | "process_receipt" | "launch_receipt" |
  "model_result" | "terminal_receipt" | "evidence" | "detail" | "decision"
type OperationKind = "activate_task" | "launch_job" | "allocate_workspace" |
  "interrupt_job" |
  "freeze_attempt" | "ingest_attempt" | "create_candidate" |
  "integrate_candidate" | "run_check" | "allocate_resource" |
  "cleanup_resource" | "publish_candidate" | "close_task" |
  "create_completion_commit" | "advance_target_ref" | "cleanup_workspace"
type EventKind = "control_accepted" | "orientation_published" |
  "root_decision_accepted" | "attempt_transition" | "operation_transition" |
  "provider_observed" | "result_observed" | "wake_due" | "snapshot_published" |
  "terminal_published"
```

The supervisor stamps `Binding`; raw model proposals contain no `Binding`. A mutable
authority record is current only when every binding field equals the canonical snapshot.
Causally fan-in immutable evidence, including receipts and candidates, may name its
earlier snapshot revision while all authority, control, task, capsule, and correction
fields still match. A task revision mismatch stales the entire run. Epoch or control
mismatch rejects effects. Correction mismatch stales only affected assignments,
candidates, and checks.

## File Layout And Publication

```text
<git-common-dir>/meta-framework/implementation/v1/runs/<run-id>/
  manifest.json                 immutable RunManifest
  capsule.json                  immutable ImplementationCapsule
  records/<kind>/<id>/<version>.json
  events/<sequence>.json        immutable Event
  control/<request-id>.json     append-only operator request
  snapshot.json                 replaceable derived RunSnapshot cache
  spool/<job-id>/               bounded, restricted provider diagnostics
```

The run directory, manifest, and capsule are created exclusively. A logical record update
writes a new immutable numbered version whose `previousDigest` matches the prior version.
The one supervisor writer publishes temporary file, file flush, rename, and directory
flush before advancing `snapshot.json`. Events notify only after their causal record is
durable. Control requests are the only multi-writer files; they are exclusive-created,
exact-run/generation bound, and become effective only after supervisor validation and an
event. Recovery ignores the snapshot cache and reduces immutable records again.
When that derived cache is missing, corrupt, or disagrees with immutable replay, only the
current lock holder may replace it, and only after rechecking the exact raw cache digest
observed before an atomic stage/rename/directory-flush repair. Cache repair never changes
records, events, controls, or run identity.

For a Ready task, run initialization and the epoch-one lock precede task mutation. The
controller then publishes the exact Ready-source/Active-target activation detail and an
`activate_task` Operation v1 before invoking the task CLI CAS. It always observes the
task afterward. Exact Active postcondition publishes the receipt, Operation v2, causal
event, and derived cache; exact unchanged Ready may retry the same operation; any other
task/store observation reconciles. A restart discovers this pre-mutation run before
planning from the newer Active observation, so response loss never creates a second run.

## Canonical Records

```ts
type RunManifest = {
  schemaVersion: 1; runId: string; createdAt: string;
  task: { id: string; taskRevision: number; recordVersion: number;
          storeId: string; storeGeneration: string };
  capsuleDigest: Digest;
  controller: { packageName: string; packageVersion: string; protocolVersion: 1 };
  provider: { adapter: string; adapterVersion: string; harness: string;
              executableRealpath: string; executableVersion: string };
  repository: { rootIdentity: Digest; objectFormat: string; baseCommit: GitOid;
                baseTree: GitOid; canonicalWorktreeIdentity: Digest };
  limits: { backgroundWip: number; rootWip: 1; maxEvents: number;
            maxDiagnosticBytes: number; orientationBytes: number };
  policyDigests: { promptRegistry: Digest; checks: Digest; resources: Digest };
}

type ImplementationCapsule = {
  schemaVersion: 1; taskId: string; taskRevision: number; taskRecordVersion: number;
  storeId: string; storeGeneration: string; createdAt: string;
  authority: string; outcome: string; acceptance: Ref[]; nonGoals: string[];
  assumptions: string[]; decisions: Ref[]; route: string; risk: string;
  gateDigest: Digest; checkCatalogDigest: Digest; detailDigests: Ref[];
  baseCommit: GitOid; baseStatusDigest: Digest;
}

type RunSnapshot = {
  schemaVersion: 1; runId: string; revision: number; previousDigest: Digest | null;
  epoch: number; controlGeneration: number; phase: RunPhase;
  taskRecordVersion: number; correctionGeneration: number;
  integration: { candidateId: string | null; tree: GitOid; privateHead: GitOid };
  eventCursor: number; assignments: Ref[]; attempts: Ref[]; operations: Ref[];
  checks: Ref[]; resources: Ref[]; pendingWakeReasons: string[];
  stop: { requested: boolean; mode: "checkpoint" | "cancel" | null;
          reasonDigest: Digest | null };
  reconciliation: { required: boolean; reasonCode: string | null; refs: Ref[] };
  updatedAt: string;
}

type Assignment = {
  schemaVersion: 1; assignmentId: string; generation: number; binding: Binding;
  sourceDecisionId: string | null; sourceProposalId: string | null;
  role: "root_analysis" | "root_decision" | "implementer" | "reviewer" | "qa" | "security";
  profileDigest: Digest; goal: string; scope: string[]; nonGoals: string[];
  dependencies: { assignmentId: string;
    condition: "result" | "integrated" | "gate_pass"; generation: number }[];
  ownership: { writePaths: string[]; readPaths: string[] };
  resources: ResourceClaim[]; baseCandidateId: string; baseTree: GitOid;
  permissions: { sandbox: "read-only" | "workspace-write"; network: boolean;
                 approvalPolicy: "never"; nestedAgents: false };
  checks: string[]; deadlineAt: string; restartPolicy: "fresh_attempt" | "never";
}

type Attempt = {
  schemaVersion: 1; attemptId: string; assignmentId: string; attemptNumber: number;
  recordVersion: number; previousDigest: Digest | null; binding: Binding;
  state: AttemptState; workspace: { workspaceId: string; rootIdentity: Digest;
    kind: "linked_worktree" | "isolated_clone" | "mount" | "overlay";
    baseTree: GitOid };
  launchRequestId: string | null; processDomainId: string | null;
  result: Ref | null; candidateId: string | null;
  observedAt: string; terminalReason: string | null;
}

type Operation = {
  schemaVersion: 1; operationId: string; recordVersion: number;
  previousDigest: Digest | null; idempotencyKey: string; kind: OperationKind;
  subject: Ref; binding: Binding; inputDigest: Digest; expected: Ref[];
  state: OperationState; attemptNumber: number; receipt: Ref | null;
  observedAt: string; failureCode: string | null;
}

type Event = {
  schemaVersion: 1; eventId: string; sequence: number; binding: Binding;
  kind: EventKind; subject: Ref; causationId: string | null; correlationId: string;
  producer: { kind: "controller" | "launcher" | "operator" | "provider";
              connectionId: string | null };
  dedupeKey: string; observedAt: string; payload: Ref;
}

type Candidate = {
  schemaVersion: 1; candidateId: string; binding: Binding;
  parentCandidateId: string | null; baseTree: GitOid; tree: GitOid;
  privateCommit: GitOid; producerAttempts: string[]; changedPaths: string[];
  ownershipDigest: Digest; patchDigest: Digest; createdAt: string;
}
```

`changedPaths`, ownership, tree, patch, process, and exit facts are supervisor-derived.
Worker-declared copies are diagnostic only. Paths are sorted and unique; a write claim
conflicts when either path is equal to or a segment-prefix of the other. Candidates cannot
include mandatory agent instructions, harness configuration, Git administration,
prompts, framework policy, task-store entry/state, the project cursor, package manifests,
lock/inventory, validation scripts, controller sources, or any other path in the closed
protected-path policy. Caller-supplied protected paths only add restrictions; assignment
ownership and Root decisions cannot subtract the mandatory set.

```ts
type CheckReceipt = {
  schemaVersion: 1; receiptId: string; binding: Binding; checkId: string;
  catalogDigest: Digest; candidateId: string; candidateTree: GitOid;
  inputScopeDigest: Digest; commandDigest: Digest; environmentDigest: Digest;
  resourcesDigest: Digest; outcome: "pass" | "fail" | "not_run" | "not_applicable";
  exitCode: number | null; evidence: Ref[]; startedAt: string; completedAt: string;
}

type ResourceReceipt = {
  schemaVersion: 1; receiptId: string; binding: Binding; attemptId: string;
  resourceKey: string; action: "allocate" | "observe_collision" | "cleanup";
  ownershipTokenDigest: Digest | null; observedIdentityDigest: Digest | null;
  outcome: "succeeded" | "failed" | "ambiguous"; evidence: Ref[]; observedAt: string;
}

type ProcessReceipt = {
  schemaVersion: 1; receiptId: string; binding: Binding; attemptId: string;
  requestId: string; launcherConnectionId: string; processDomainId: string;
  processIdentityDigest: Digest; action: "observe" | "interrupt";
  state: "running" | "empty" | "ambiguous"; descendantsComplete: boolean;
  membersDigest: Digest; evidence: Ref[]; observedAt: string;
}

type TerminalReceipt = {
  schemaVersion: 1; receiptId: string; binding: Binding;
  disposition: "succeeded" | "failed" | "stopped" | "superseded";
  candidateId: string | null; finalTree: GitOid | null; finalCommit: GitOid | null;
  taskStatus: string; taskRecordVersion: number; checkReceipts: Ref[];
  completionEvidenceDigest: Digest | null; emittedAt: string;
}
```

A passing check is reusable only when candidate tree or complete `inputScopeDigest`,
command, environment, resource and catalog digests match. `not_run` never satisfies a
required check. Terminal success requires task status `done`, exact final tree/commit,
current binding, all required passes, and canonical HEAD/index/worktree agreement.

## Provider Launch And Model Results

```ts
type LaunchRequest = {
  schemaVersion: 1; requestId: string; jobId: string; binding: Binding;
  assignmentId: string; attemptId: string; role: Assignment["role"];
  providerAdapter: string; executableVersion: string; cwdIdentity: Digest;
  baseTree: GitOid; profileDigest: Digest; promptDigest: Digest;
  outputSchemaDigest: Digest; sandbox: "read-only" | "workspace-write";
  approvalPolicy: "never"; network: false; nestedAgents: false;
  environmentDigest: Digest; deadlineAt: string;
}

type LaunchReceipt = {
  schemaVersion: 1; receiptId: string; recordVersion: number;
  previousDigest: Digest | null; requestId: string; binding: Binding;
  launcherConnectionId: string; processDomainId: string;
  providerHandleRef: Ref | null; argvDigest: Digest; environmentDigest: Digest;
  startedAt: string; completedAt: string | null; exitCode: number | null;
  signal: string | null; stdoutDigest: Digest; stderrDigest: Digest;
  modelResult: Ref | null; outcome: "running" | "exited" | "ambiguous";
}

type RootLaunchIntent = {
  schemaVersion: 1; recordType: "root_launch_intent";
  orientation: Ref; orientationDigest: Digest;
  request: LaunchRequest; requestDigest: Digest;
}

type WorkerResult = {
  schemaVersion: 1; disposition: "completed" | "partial" | "blocked" | "failed";
  summary: string; changedPathsClaim: string[]; checks: {
    id: string; outcome: "pass" | "fail" | "not_run" | "not_applicable";
    evidenceDigest: Digest | null }[];
  findings: { severity: string; summary: string; evidenceDigest: Digest | null }[];
  risks: string[]; knowledgeProposals: string[]; followUp: string[];
}

type RootModelResult = {
  schemaVersion: 1; recordType: "root_decision_result";
  worker: WorkerResult; proposal: RootDecisionProposal;
  orientationDigest: Digest; promptDigest: Digest; rawResultDigest: Digest;
}
```

Provider JSONL, `WorkerResult`, and `RootModelResult` are notifications. Before a Root
spawn, the controller persists one closed `RootLaunchIntent`; its request digest is the
canonical digest of the full request, and the `launch_job` Operation binds that digest
and intent ref. The intent names the exact latest durable orientation, Root role,
assignment/attempt/request, static profile, dynamic prompt, environment, permissions,
base tree, and deadline. Its provider adapter and executable version equal the immutable
run manifest, and its cwd identity equals the allocated attempt workspace root. The
launcher creates `LaunchReceipt` from the held
process/transport and wraps the model-result reference with the current binding.
Acceptance requires the intent to precede launch, the terminal receipt request and
environment to match it, and the Root envelope prompt/orientation/proposal to match both
the intent and current durable orientation. Conflicting terminal results for one request
become ambiguous. A worker cannot assert trusted paths, checks, integration, task
completion, or producer identity.

```ts
type AssignmentProposal = {
  proposalId: string;
  role: "root_analysis" | "implementer" | "reviewer" | "qa" | "security";
  goal: string; scope: string[]; nonGoals: string[];
  dependencies: { targetKind: "assignment" | "proposal"; targetId: string;
    condition: "result" | "integrated" | "gate_pass" }[];
  ownership: { writePaths: string[]; readPaths: string[] };
  resources: ResourceClaim[]; checks: string[];
  restartPolicy: "fresh_attempt" | "never";
}

type RootDecisionProposal = { schemaVersion: 1; rationale: string } & (
  | { kind: "declare_assignments"; assignments: AssignmentProposal[] }
  | { kind: "integrate_candidate"; candidateId: string }
  | { kind: "reject_candidate"; candidateId: string; evidence: Ref[] }
  | { kind: "request_correction"; supersededAssignmentIds: string[];
      assignments: AssignmentProposal[]; affectedCheckIds: string[] }
  | { kind: "schedule_gates"; candidateId: string;
      assignments: AssignmentProposal[] }
  | { kind: "checkpoint_task"; status: "active" | "needs_verification";
      nextSafeAction: string }
  | { kind: "request_approval"; action: string; boundary: string; detailRef: Ref }
  | { kind: "wait"; reasonCode: string; wakeOn: string[]; deadlineAt: string | null }
  | { kind: "finalize"; candidateId: string; requiredCheckReceiptIds: string[];
      completionEvidenceDigest: Digest }
  | { kind: "stop"; mode: "checkpoint" | "cancel"; reason: string }
  | { kind: "fail"; reasonCode: string; evidence: Ref[] }
)

type RootDecision = {
  schemaVersion: 1; decisionId: string; binding: Binding;
  orientationDigest: Digest; proposalDigest: Digest;
  source: { launchIntent: Ref; launchReceipt: Ref; modelResult: Ref };
  proposal: RootDecisionProposal; derivedAssignments: Ref[]; acceptedAt: string;
}
```

The proposal union is closed and has no binding, assignment ID, executable, shell, Git,
arbitrary task mutation, provider configuration, or approval-grant variant. The
supervisor validates a raw proposal against the exact current orientation and the Root
job's durable launch intent and terminal receipt, computes `proposalDigest` over its JCS
bytes, and verifies that `source.modelResult` equals that receipt's model-result reference.
It then stamps the current binding, publishes canonical `Assignment` records with policy-derived IDs,
profiles, base, permissions, and deadlines, records their references in
`derivedAssignments`, and publishes `RootDecision`. Same-decision proposal dependencies
resolve by `proposalId`; unresolved, duplicate, cyclic, or conflicting proposals reject
the whole decision. A supervisor-scheduled `root_decision` assignment has null source
fields; every proposal-derived assignment has both source fields. Neither an echo inside
model output nor a digest alone establishes producer identity or authority.

## Reducer And Legal Transitions

```ts
type RunPhase = "preflight" | "dormant" | "orienting" | "judgment_required" |
  "intent_published" | "executing" | "verifying" | "waiting" | "stopping" |
  "finalizing" | "reconciliation_required" | "succeeded" | "failed" |
  "stopped" | "superseded"
type AttemptState = "allocated" | "launch_intended" | "running" | "ambiguous" |
  "terminal_observed" | "frozen" | "ingested" | "accepted" | "rejected" |
  "stale" | "cleanup_pending" | "cleaned" | "quarantined"
type OperationState = "intended" | "started" | "observed_succeeded" |
  "observed_failed" | "ambiguous" | "abandoned"
```

| From | Legal next run phases | Required observation |
| --- | --- | --- |
| `preflight` | `dormant`, `failed`, `reconciliation_required` | Compatible capsule/task/Git/provider/quota or typed failure |
| `dormant` | `orienting`, `waiting`, `stopping`, `reconciliation_required`, `superseded` | Coalesced wake, stop, ambiguity, or task revision |
| `orienting` | `judgment_required`, `stopping`, `reconciliation_required`, `superseded` | Durable orientation digest or dominant control/revision |
| `judgment_required` | `intent_published`, `waiting`, `stopping`, `failed`, `reconciliation_required`, `superseded` | One current valid decision or classified failure |
| `intent_published` | `executing`, `verifying`, `waiting`, `finalizing`, `stopping`, `reconciliation_required` | Durable operation intent precedes effect |
| `executing` | `dormant`, `verifying`, `waiting`, `stopping`, `reconciliation_required`, `superseded` | Job/result/process observation |
| `verifying` | `dormant`, `waiting`, `finalizing`, `stopping`, `reconciliation_required`, `superseded` | Candidate-bound gate receipts |
| `waiting` | `dormant`, `stopping`, `reconciliation_required`, `superseded` | Changed state/due deadline, control, or ambiguity |
| `stopping` | `stopped`, `reconciliation_required`, `superseded` | Every process/resource is terminal or ambiguity recorded |
| `finalizing` | `succeeded`, `stopping`, `reconciliation_required`, `superseded` | Exact task/Git/check/receipt postconditions |
| `reconciliation_required` | `dormant`, `stopping`, `finalizing`, `failed`, `superseded` | Explicit resume/recover command, new epoch, and resolved prior intents |
| any terminal phase | none | Terminal phases are monotonic |

Resume cannot move a terminal run. It validates task/capsule/control, acquires or explicitly
recovers the exact lock, increments epoch, rebuilds state, and enters only `dormant`,
`stopping`, or `finalizing` according to observed postconditions. Unknown ownership or an
unresolved effect remains in reconciliation. Task revision enters `superseded`; it does
not reuse assignments in a new run.

| From | Legal next attempt states | Required observation |
| --- | --- | --- |
| `allocated` | `launch_intended`, `stale`, `quarantined` | Durable launch intent; pre-launch binding change; or invalid workspace identity |
| `launch_intended` | `running`, `terminal_observed`, `ambiguous`, `stale`, `quarantined` | Matching launch receipt; trustworthy pre-run exit with empty process domain; indeterminate launch; proved no live process after binding change; or identity/emptiness unproved |
| `running` | `terminal_observed`, `ambiguous`, `stale`, `quarantined` | Exact process domain is empty plus terminal provider/exit observation; connection/process evidence conflicts; empty domain after interruption for a binding change; or identity/emptiness unproved |
| `ambiguous` | `running`, `terminal_observed`, `stale`, `quarantined` | Held launcher connection and exact live process prove the current job; empty domain plus trusted terminal observation; empty domain plus binding change; or explicit reconciliation cannot prove identity/emptiness |
| `terminal_observed` | `frozen`, `accepted`, `rejected`, `stale`, `quarantined` | Empty process domain and exact workspace identity; exact accepted Root result disposition for a no-candidate analysis attempt; binding change; or failed identity check |
| `frozen` | `ingested`, `stale`, `quarantined` | NUL-safe actual-diff capture and ownership validation; binding change; or unsafe/unknown paths |
| `ingested` | `accepted`, `rejected`, `stale`, `quarantined` | Current accepted Root decision; current rejection decision; binding change; or conflicting evidence |
| `accepted`, `rejected`, `stale` | `cleanup_pending`, `quarantined` | Immutable required evidence and exact cleanup intent; or cleanup preconditions unproved |
| `cleanup_pending` | `cleaned`, `quarantined` | Exact cleanup receipts prove removal; or cleanup/ownership becomes ambiguous |
| `cleaned`, `quarantined` | none | Terminal attempt state; later administrative cleanup of quarantined assets is a separate operation and does not rewrite the attempt |

No other attempt edge is legal. In particular, recovery from `ambiguous` cannot allocate
or relaunch that attempt; it must prove one of the four observations above. A retry always
allocates a new attempt ID and workspace, and never overlaps unresolved ownership.

Every attempt edge is carried by an immutable `attempt_transition` detail containing the
new and previous Attempt refs, one closed observation code, exact ordered evidence refs,
and its observation time. The reducer validates the complete evidence set before any
causal record or event is published. Workspace allocation requires an observed-success
`allocate_workspace` Operation and the exact workspace `ResourceReceipt`. Launch intent
precedes spawn; running and terminal observations bind the same launch and process
identity; an empty domain is authoritative only when `descendantsComplete` is true.
Incomplete or conflicting process evidence quarantines instead of proving termination.
`frozen` is a read-only inspection boundary, while `ingest_attempt` is the separately
journaled Git effect bound to that inspection and exact frozen Attempt ref. Every changed
ordinary file is opened without following links, bounded, hashed over its exact bytes,
and checked for stable descriptor/name identity before and after the read. Frozen
evidence is a closed canonical value that survives restart; a new ingestion reopens and
revalidates exact identity and content, while replay of a durable terminal ingestion
receipt performs no filesystem or Git effect. Cleanup intent precedes cleanup and
`cleaned` requires both the exact workspace cleanup operation and resource receipt.

Operations move `intended -> started -> observed_succeeded|observed_failed`; intent may
move directly to an observed state when the postcondition already exists. Either
nonterminal state may become `ambiguous`; reconciliation may then observe success/failure
or explicitly `abandoned` only after proving no effect. Observed and abandoned states are
terminal. The same `idempotencyKey` plus same `inputDigest` returns the existing operation;
the same key with another digest is corruption and forces reconciliation.

## Acceptance And Provenance Rules

- Events never authorize an effect; current canonical records and preconditions do.
- Sequence is assigned only by the supervisor. Duplicate `dedupeKey` with identical
  payload is ignored; another payload is conflicting evidence.
- A launch is accepted only from the controller-held launcher connection named in its
  intent. Provider handles remain restricted ledger data.
- Stop/control or a newer task revision is checked immediately before every spawn,
  integration, signal, approval, task mutation, cleanup, and final ref update.
- Candidate integration requires current bindings, an empty process domain, exact
  workspace identity, allowed actual paths, expected base/integration OIDs, and a durable
  intent. Ref movement uses expected-old-OID comparison.
- Approval is never inferred from a Root/provider request. Only current task-gate evidence
  for the exact action and boundary may unblock that operation.
- Finalization requires no live writer, a current final decision, exact candidate and
  required check receipts, expected canonical task/Git state, explicit staged paths/tree,
  the forward-recovery journal defined by Decision 0025, and fresh exact authorization
  immediately before every synchronous or asynchronous effect boundary. A caller-supplied
  boundary authorizer is defense in depth, not an activation issuer.

## Operator Controls And Activation

`stop` publishes one bounded append-only request only when the named run already exists
and its immutable replay has the caller's exact control generation. Its deterministic
request ID covers run, generation, and reason; an exact retry reuses the original bytes
even after the supervisor accepts it. The stop-control capability cannot initialize a
run, publish lifecycle records or events, acquire or recover a lock, accept the request,
signal a process, or clean any resource.

After durable publication, an operator may send a best-effort wake hint to the current
run owner. The ephemeral endpoint is bound to the ledger-root identity, run ID, lock
token, and epoch. Its bounded request ID payload is never authority: the receiver
subscribes before replay, coalesces hints, and resolves only after immutable replay finds
a current-generation durable control. An absent, stale, unreachable, duplicated, or
spoofed hint cannot roll back the request, trigger a fallback signal, or authorize an
effect.

`resume` requires both `expectedEpoch` and `expectedControlGeneration`. Acceptance occurs
only under the current run lock after prior effects are reconciled; it rotates the epoch
and advances the control generation before new effects. Start, resume, clean, lock
recovery, provider, signal, workspace, Git, task, final-ref, and other forward effects
remain separately deny-by-default. Receipt validation is not a trust issuer. The
installed package has no general live activation source until a later accepted decision
defines protected issuance, recognition, delivery, revocation, and containment evidence.
No shipped library namespace may convert caller-supplied receipt/current objects into an
opaque Git, task, journal, or final-ref capability. Disposable-Git mechanics may be
exercised only through source-test instrumentation excluded from package bytes; the
original installed module retains no issuer.

A shipped offline composer may join a caller-supplied already-open branded ledger,
runtime, application service, and explicit leaf ports. It must identify itself as
`offline_injected`, expose no issuer, open no ledger, accept no receipt-shaped activation
shortcut, and remain unreachable from the installed command's forward paths. This proves
package-owned protocol/lifecycle interoperability without claiming live authority.
