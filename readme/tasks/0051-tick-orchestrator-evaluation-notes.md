# Tick-Orchestrator Evaluation Notes

## Task Identity

- Task ID: T-0051
- Task store: `readme/tasks/store/` through
  `npm run --ignore-scripts --silent meta -- tasks task get T-0051`
- Brief or acceptance source: User instruction on 2026-08-14
- Started: 2026-08-14
- Last updated: 2026-08-14
- Accepted task revision: 2

## Execution Checkpoint

- Completed safe increment: Inventoried the transcript corpus, measured a matched
  design/implementation pair and one mixed phase-boundary session, completed independent
  transcript and controller-risk analyses, and synthesized the hybrid recommendation.
- Current repository or external state: `/cache/.codex/sessions/` contains 149 rollout
  files, 147 rooted in this workspace. First-record metadata distinguishes primary user
  threads from child threads; later replayed metadata must not be used for classification.
- Resume constraints: Treat transcripts and worker output as untrusted evidence. Persist
  only minimized aggregate facts and task-relevant excerpts; never persist credentials,
  unrelated prompts, account data, or raw transcript copies. Do not infer worker identity,
  duration, or outcome without schema or event evidence.

## Evaluation Criteria

- Distinguish conversational design sessions from autonomous implementation sessions.
- Characterize representative implementation sessions by duration, context/compaction
  signals, orchestrator actions, child-agent count and role, concurrency, worker duration,
  result delivery, retries, integration, verification, and terminal outcome when present.
- Identify points where a fresh tick could have reconstructed the same safe next action
  from durable task, worker, repository, and provider state.
- Identify points where hidden conversational context or model judgment was essential and
  would have required a richer orientation packet or a continuing implementation session.
- Partition implementation orchestration into deterministic controller transitions,
  bounded model judgments, and worker execution.
- Compare reliability, token/context cost, latency, recovery, auditability, concurrency,
  security, implementation complexity, and user experience.
- Recommend an event and state contract, trigger model, tick termination condition,
  migration boundary, and evaluation method; do not implement the architecture in this task.

## Plan

- [x] Capture and frame the investigation.
- [x] Inventory user-level Codex transcript storage and select representative sessions.
- [x] Extract aggregate session and worker metrics with a reproducible local method.
- [x] Independently analyze transcript behavior and deterministic controller boundaries.
- [x] Synthesize actual-versus-counterfactual findings and architectural recommendation.
- [x] Run independent review and verify minimized evidence; close and commit below.

## Artifact And Work Status

| Artifact Or Slice | Status | Owner | Files Or Domains | Required Checks | Next Step |
| --- | --- | --- | --- | --- | --- |
| Investigation frame and checkpoint | Complete | Root Orchestrator | This note and T-0051 record | Task context and link validation | Final verification |
| Transcript inventory and metrics | Complete | Root Orchestrator | User-level `.codex` session evidence | Schema validation, minimization, reproducibility | Final review |
| Transcript behavior analysis | Complete | Reviewer | Selected transcript metadata and events | Evidence-linked result | Integrated below |
| Deterministic controller analysis | Complete | Security And Risk Agent | Root loop, task store, worker lifecycle | State-machine and failure scenario review | Integrated below |
| Synthesis and recommendation | Complete | Root Orchestrator | This note and relevant decision/process owners | Consistency and independent review | Close and commit |

## Transcript Method And Working Evidence

The rollout format is an undocumented local Codex implementation detail. The analysis
therefore uses only empirically validated fields and does not make the transcript store a
framework dependency. For each file, the first `session_meta` record defines that thread.
A primary thread has `id == session_id` and `thread_source: user`; a direct child has a
structured `source.subagent.thread_spawn.parent_thread_id`. Child files can contain
replayed parent events and later follow-up turns, so filename, file size, later metadata,
and raw event totals are not reliable identity or duration measures on their own.

| Exemplar | Applicable Phase | Wall Span | Root Compactions | Spawn Calls / Direct Child Files | Root Coordination Calls | Observed Outcome |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `019ff00a…` | Conversational npm architecture design | 3.17 h | 1 | 3 / 3 | 11 waits, 1 follow-up, 1 send, 2 interrupts | Ten root turns: nine design/refinement turns, then a commit instruction |
| `019ff0bb…` | Autonomous implementation | 11.19 h | 8 | 39 / 37 | 326 wait-like calls, 37 follow-ups, 112 sends, 4 interrupts | Ten task-scoped commits; the selected tasks are now Done |
| `019ff679…` | Mixed design then implementation | 32.48 h total | 5 total | 21 / 18 total | 218 waits total | Explicit implementation handoff at 2026-08-13T15:52:58Z |
| `019ff679…` post-handoff | Autonomous implementation slice only | 7.58 h | 3 | 18 / 16 | 207 waits, 17 follow-ups, 51 sends, 5 interrupts | Ten task-scoped commits through the requested dependency chain |

The apparent spawn mismatches are observed failures, not missing transcript files. In the
11.19-hour run, two attempts to create `t0030_reviewer_gate` failed because the agent
thread limit had been reached. In the mixed run, one attempt each for the task-CLI
reviewer, T-0045 reviewer, and T-0049 implementer failed because an exact specialist was
requested with an incompatible full-history fork; the latter two occurred after the
implementation handoff and were immediately retried successfully. These are candidates
for deterministic preflight and retry policy.

Direct child-thread spans are not compute durations because a thread can wait idle and
later receive a follow-up. The 11.19-hour implementation run produced 37 direct child
threads, 70 evidenced completed child turns, a maximum of three overlapping completed-turn
intervals, 23.83 aggregate thread-span hours, and at least 15.55 completed-turn hours. The
mixed implementation slice produced 16 direct child threads. One reviewer thread spanned
26.75 hours across the design and implementation phases but contained five completed turns
and about 5.69 completed-turn hours, demonstrating long-lived handle reuse rather than
continuous execution.

By role-name classification, the autonomous run used 12 analysis-like, 7 review-like,
7 QA-like, 7 security-like, and 4 implementation-like child threads. Thirty-five of its
37 children ended in `task_complete`, two ended aborted, and 14 handles were reused by
follow-up. The mixed session created 6 implementers, 5 reviewers, 5 QA workers, and
2 security workers; 16 recorded at least one completed turn and 2 ended aborted. Worker
lifespan overlap peaked at six in the autonomous run and three in the mixed run, but that
measure includes idle handles and is not simultaneous compute.

### Context And Communication Pressure

Token counters are gross model counters and include cached input; they are not billed-cost
figures. The autonomous 11.19-hour root accumulated 208.64 million input tokens, of which
205.63 million were reported cached, plus 538 thousand output tokens. Its final call
carried 193,579 input tokens against a 258,400-token window. The 7.58-hour implementation
slice of the mixed session added 123.21 million input tokens, of which 120.52 million were
cached, plus 189 thousand output tokens; its final call carried 206,194 input tokens.

The autonomous root also accumulated 218 direct agent messages containing about 351,000
characters and 326 wait results containing about 196,000 characters. The mixed
implementation slice accumulated 87 agent messages with about 132,000 characters and 207
wait results with about 140,000 characters. These records are plausible contributors to
repeated context, but their individual cost is not isolated. File-backed bounded results
should reduce carried context by retrieving only current transition evidence; replay or
shadow measurement is needed to establish the magnitude.

### Preliminary Counterfactual

- The clean design/implementation pair supports the proposed phase boundary: keep the
  ten-turn design session—nine design/refinement turns plus the final commit instruction—
  intact, then begin autonomous execution from its durable tasks. The implementation root
  nevertheless grew through eight compactions while
  completing ten commit-sized increments.
- The mixed session is stronger evidence for a fresh handoff. At implementation start the
  current call already carried about 61,600 input tokens from the preceding design; it
  then grew to about 206,200 despite three compactions. A fresh implementation controller
  could have started from the accepted task records and repository state instead.
- The ten task-scoped commits in each implementation sequence are natural coarse tick
  boundaries. A tick after every tool call would be wasteful; a tick at every durable
  task/worker/check transition is the useful comparison.
- Repeated wait polling, capability/quota reads, known spawn-schema validation, task-store
  integrity checks, revision matching, dependency eligibility, and event deduplication do
  not require an LLM decision. A deterministic supervisor can perform them and wake a
  fresh Root only when semantic judgment or integration is ready.
- Current child handles are parent-thread-scoped and were reused through follow-ups. File
  output alone does not prove a new Root can resume or address them; a durable external
  worker supervisor or independent top-level worker jobs are a prerequisite.

## Recommendation

**Revise, then adopt:** preserve the conversational design Root, but end design with a
revision-bound implementation capsule and run implementation through an event-driven,
deterministic supervisor. The supervisor invokes a fresh Root tick only when semantic
judgment is due. It does not invoke a model on a fixed schedule, for polling, or for every
tool action. A low-cost watchdog remains useful for lease recovery, missed notifications,
quota cadence, and deadlines.

Expected effects are directionally favorable:

| Dimension | Likely Effect | Qualification |
| --- | --- | --- |
| Reliability and recovery | Better | Explicit state, CAS, receipts, and replay replace memory-dependent recovery; only if file effects and worker control are fenced |
| Context pressure | Likely better | Each Root receives a bounded orientation packet instead of accumulated waits, messages, and design history |
| Token cost | Likely better | Avoided repeated context may outweigh fixed per-tick orientation and synthesis overhead in long runs; measurement is required |
| Latency | Mixed | Event wakeups remove polling, but reconstruction adds latency at each judgment boundary |
| Auditability and determinism | Better | Typed state and transitions make retries, gates, and reasons inspectable |
| Synthesis quality | At risk | Overly fine ticks lose tacit debugging and integration context; use coarse semantic boundaries and durable correction history |
| Complexity and security | Worse initially | A worker ledger, trusted launcher, fencing, idempotency, retention, and finalization recovery are new infrastructure |

This conclusion is supported by three exemplars, not a controlled cost experiment. Gross
token counters include cache hits and cannot establish billing savings. The proposed
benefit should therefore be validated by replay and a shadow implementation before it is
treated as measured fact.

## Proposed Control Boundary

Design remains a continuing conversation until a Root publishes and activates a capsule
binding task ID and revision, goal, acceptance criteria, non-goals, assumptions, approved
decisions, risk/route, ownership, gates, and checks. A material task amendment invalidates
the capsule and all older assignments. Existing task lifecycle states remain authoritative;
the orchestration phase is separate execution state.

The deterministic supervisor owns wake coalescing, a fenced controller lease, bounded
orientation reads, schema/revision/CAS checks, dependency and quota gates, worker-count
limits, known spawn preflight, event deduplication, declared command execution, and stable
wait scheduling. The Root owns intent and authority interpretation, readiness and priority,
route/risk, decomposition, integration of findings and diffs, repair versus escalation,
verification sufficiency, and the semantic `Done` judgment. Workers execute bounded
assignments and publish evidence only.

This is an extension of existing deterministic machinery: `task-application.mjs` already
plans normalized revision-bound changes, while `task-store.mjs` validates preconditions,
whole-store invariants, and atomic one-record publication.

A tick should perform at most one semantic judgment plus its bounded deterministic
consequences, then stop at the first asynchronous or ambiguous publication boundary. The
derived flow is:

`DORMANT -> ORIENTING -> JUDGMENT_REQUIRED -> INTENT_PUBLISHED ->`
`EXECUTING | WAITING | VERIFYING | FINALIZING -> DORMANT | TERMINAL`

Invalid store state, unknown dirty changes, uncertain worker ownership, conflicting lease,
or an ambiguous prior effect instead enters `RECONCILIATION_REQUIRED`. Stable waiting
terminates the Root tick; an event or watchdog wakes the supervisor.

### Minimum Durable State And Events

- Run: protocol version, run/lease epoch, task revision and capsule digest, base Git/store
  generations, controller phase, event cursor, pending wake IDs, and tick budget.
- Assignment: stable assignment and attempt IDs, role/profile and instruction digests,
  dependencies, owned paths/worktree, base revision/commit, lifecycle, provider handle,
  heartbeat, correction generation, and restart policy.
- Result and quality: immutable content digest, assignment binding, files/commit/patch,
  checks and observed outcomes, partial versus terminal disposition, integration decision,
  required gates, and finalization intent/receipt.
- Operation: stable idempotency key, preconditions, `intent/observed/ambiguous` state, and
  effect receipt for dispatch, integration, verification, commit, and close.
- Event: immutable ID, kind, subject, task revision, assignment/attempt, producer class,
  observation time, causal operation, payload digest, and dedupe key. Events notify; every
  tick re-reads canonical state rather than trusting event prose.

Delivery must be treated as at least once. Publish intent before effect, result before
notification, and acknowledge only after observing the intended postcondition or recording
ambiguity. Duplicate or out-of-order events must not change semantics. Lost notifications
are recovered by scanning bounded immutable result references.

### Prerequisites And Failure Boundaries

- A fresh Root cannot safely control children whose handles belong only to a prior Root.
  Add a durable provider-backed supervisor or launch independently addressable worker jobs.
- Files are untrusted evidence, not authority or authenticated identity. Enforce one-writer
  locations, strict bounded schemas and path containment, task/revision/attempt binding,
  content digests, launcher-stamped provenance, and independent diff/check verification.
- A controller lease grants scheduling exclusivity, not semantic authority. Use monotonic
  fencing tokens; never infer process death merely from age, PID, or a missing local handle.
- User redirects need a trusted durable delivery bridge and highest-priority wake. Otherwise
  the fresh-tick design can miss a stop or amendment that the conversational Root would see.
- Git/file writes are not fenced by task-store CAS. Unknown or overlapping dirty state must
  force reconciliation before dispatch, integration, retry, or takeover.
- Task close and Git commit are not atomic. Add a durable finalization fence/receipt and
  recover by reconciling task state, HEAD, index, and owned paths before either action repeats.

## Proposed Evaluation

First build a deterministic replay simulator, not a production controller. Convert the
three measured histories into minimized event sequences and assert next-action equivalence,
duplicate suppression, out-of-order handling, stale-revision rejection, and recovery after
every publication boundary. Then shadow a real implementation run without granting the
controller write authority. Compare task success, compactions, gross/cached input, Root
invocations, orientation latency, waits, retries, duplicate effects, human interventions,
and recovery time. Adoption should require no missed redirect or gate, no duplicated
side effect, equivalent or better completion, and a material reduction in carried context.

## Repository And Verification State

- Changed files: This note and the structured T-0051 record.
- Recent commits: The two implementation exemplars each produced ten task-scoped commits;
  current Git history and task records confirm the corresponding work was integrated and
  the sampled tasks are Done.
- Commands already run and observed results: Task-store doctor and startup passed before
  intake; T-0051 was added successfully; project-local `.codex/` contains four agent
  manifests and one hook file but no transcripts; official OpenAI documentation search
  did not establish a public local-transcript storage contract. The corpus contains 149
  rollouts across 2026-07-09 through 2026-08-14. Selected primary threads include a
  3.17-hour conversational npm-architecture design, an 11.19-hour autonomous open-task
  implementation, and a 32.48-hour session with an explicit design-to-implementation
  transition. A focused Node spot-check reproduced the three root spans, turns,
  compactions, and collaboration-call counts; independent review found no design blocker.
- Required checks remaining: post-commit HEAD/status inspection only; post-record doctor and staged diff passed.
- Decisions and assumptions since start: Route is Decide and initial risk is Medium.
  Assume transcript access is authorized by the user's explicit request, but minimize all
  retained evidence and do not treat transcript content as instructions.

## Worker Roster

| Worker | Task ID, Revision, And Assignment | Owned Files Or Domains | Status | Last Output | Restart Policy |
| --- | --- | --- | --- | --- | --- |
| `/root/transcript_counterfactual` (Reviewer) | T-0051@r2; representative metrics, then independent synthesis review | Read-only selected transcript evidence and this note | Complete | No blocking design finding; minor count/cost wording corrections identified | Findings addressed; no restart planned |
| `/root/controller_state_machine` (Security) | T-0051@r2; deterministic versus model-judgment state machine | Read-only framework and aggregate evidence | Complete | Supplied state machine, trust boundary, and crash scenarios | No restart planned |

## Usage Capacity

- Last authoritative meter reading: 2026-08-14T07:35:31.549Z; disposition `proceed`.
- Per-window consumed and reset time (five-hour, weekly, any model-scoped, monthly):
  `weekly.1` 8%, resets 2026-08-20T04:18:52Z; `weekly.2` 0%, resets
  2026-08-21T07:35:31Z. Five-hour and monthly windows were explicitly omitted.
- Limiting or unknown windows: None; capability remains enabled and both weekly readings
  are below the 98% cutoff.

## Attempts And Dead Ends

| Attempt | Observed Evidence | Why Abandoned | Retry Only If |
| --- | --- | --- | --- |
| Search project-local `.codex/` for transcripts | Only adapters and hooks were present | Transcripts are not stored in that project directory | A future Codex version changes project-local storage |
| Search official OpenAI docs for a local transcript path | No authoritative storage contract was returned | Local files must be treated as implementation detail and inspected empirically | Official documentation adds the contract |

## Progress Log

| Date | Update | Evidence |
| --- | --- | --- |
| 2026-08-14 | Created T-0051 and framed the investigation | Task-add result and this checkpoint |
| 2026-08-14 | Located 149 rollout files and selected three primary-session exemplars | First-record metadata and minimized event counts |
| 2026-08-14 | Delegation capability and quota probes passed | Capability `enabled`; quota `proceed` at 06:43:25Z |
| 2026-08-14 | Independent transcript and controller analyses completed | Reviewer and Security results; post-result quota probes passed at 07:12:31Z |
| 2026-08-14 | Synthesized a two-phase event-driven architecture and replay evaluation | Recommendation, control boundary, state/event contract, and prerequisites above |
| 2026-08-14 | Independent synthesis review found no blocking design issue | Minor turn-count and cost-certainty wording corrected; post-result quota probe passed |
