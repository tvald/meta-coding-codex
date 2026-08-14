import {
  canonicalDigest,
  canonicalJson,
  validateBinding,
  validateBoundedArray,
  validateBoundedString,
  validateControllerId,
  validateDigest,
  validateRef,
  validateRepositoryPath,
  validateTaskId,
  validateTimestamp,
} from './implementation-protocol.mjs';
import {
  applyCandidateTree,
  assertProtectedImplementationCapability,
  changedPathsBetweenTrees,
  compareAndSwapRef,
  createCompletionCommit,
  expectedCompletionCommit,
  indexMatchesTree,
  observeCandidateFacts,
  observeCanonicalHead,
  observeCommitTree,
  observeCompletionCommit,
  observeWorktreeChanges,
  observeRef,
  stageExactPaths,
  validateImplementationCandidate,
  worktreePathsMatchTree,
  writeIndexTree,
} from './implementation-git.mjs';

export const FINALIZATION_BOUNDARIES = Object.freeze([
  'candidate_apply',
  'task_close',
  'completion_commit',
  'target_ref',
  'terminal_receipt',
]);

const PLAN_KEYS = Object.freeze([
  'schemaVersion', 'finalizationId', 'binding', 'candidate', 'repository',
  'publicationPaths', 'task', 'requiredCheckReceipts', 'completion', 'terminal',
]);
const REPOSITORY_KEYS = Object.freeze(['targetRef', 'expectedParentCommit', 'expectedParentTree']);
const TASK_KEYS = Object.freeze([
  'taskId', 'taskRevision', 'expectedRecordVersion', 'completedRecordVersion',
  'expectedStatus', 'completedStatus', 'completionEvidenceDigest', 'taskPaths',
]);
const TERMINAL_KEYS = Object.freeze(['receiptId', 'emittedAt']);
const TASK_OBSERVATION_KEYS = Object.freeze([
  'taskId', 'taskRevision', 'recordVersion', 'status', 'completionEvidenceDigest',
  'changedPaths',
]);

export class ImplementationFinalizationError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ImplementationFinalizationError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new ImplementationFinalizationError(code, message, details);
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, label) {
  if (!plainObject(value)) fail('FINALIZATION_INVALID', `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('FINALIZATION_INVALID', `${label} has unknown or missing fields`);
  }
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail('FINALIZATION_INVALID', `${label} is invalid`);
}

function sortedPaths(values, label) {
  validateBoundedArray(values, label, { maximumItems: 128 });
  for (const [index, value] of values.entries()) validateRepositoryPath(value, `${label}[${index}]`);
  if (values.some((value, index) => index > 0 && values[index - 1] >= value)) {
    fail('FINALIZATION_INVALID', `${label} must be sorted and unique`);
  }
  return values;
}

function oidLength(plan) {
  const lengths = [
    plan.repository.expectedParentCommit.length,
    plan.repository.expectedParentTree.length,
    plan.candidate.tree.length,
    plan.candidate.privateCommit.length,
  ];
  if (!lengths.every((value) => value === lengths[0]) || ![40, 64].includes(lengths[0])) {
    fail('FINALIZATION_INVALID', 'finalization Git object IDs are inconsistent');
  }
  return lengths[0];
}

function gitOid(value, length, label) {
  if (typeof value !== 'string' || value.length !== length || !/^[0-9a-f]+$/u.test(value)) {
    fail('FINALIZATION_INVALID', `${label} is invalid`);
  }
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function oneOfPathSets(actual, candidates) {
  return candidates.some((candidate) => same(actual, [...candidate].sort()));
}

function validateCommitMetadata(value) {
  const keys = ['authorEmail', 'authorName', 'committerEmail', 'committerName', 'message', 'timestamp'];
  exactKeys(value, keys, 'completion metadata');
  for (const field of ['authorName', 'authorEmail', 'committerName', 'committerEmail']) {
    validateBoundedString(value[field], `completion metadata.${field}`, { maxBytes: 320 });
    if (/[<>\r\n]/u.test(value[field])) fail('FINALIZATION_INVALID', `completion metadata.${field} is unsafe`);
  }
  validateTimestamp(value.timestamp, 'completion metadata.timestamp');
  validateBoundedString(value.message, 'completion metadata.message');
  if (!value.message.endsWith('\n')) fail('FINALIZATION_INVALID', 'completion message must end in a newline');
}

export function validateFinalizationPlan(plan) {
  exactKeys(plan, PLAN_KEYS, 'finalization plan');
  if (plan.schemaVersion !== 1) fail('FINALIZATION_UNSUPPORTED', 'finalization plan version is unsupported');
  validateControllerId(plan.finalizationId, 'finalization plan ID');
  validateBinding(plan.binding, 'finalization binding');
  exactKeys(plan.repository, REPOSITORY_KEYS, 'finalization repository');
  validateBoundedString(plan.repository.targetRef, 'target ref', { maxBytes: 512 });
  if (!plan.repository.targetRef.startsWith('refs/heads/')) {
    fail('FINALIZATION_INVALID', 'finalization target must be an explicit local branch ref');
  }
  const length = oidLength(plan);
  gitOid(plan.repository.expectedParentCommit, length, 'expected parent commit');
  gitOid(plan.repository.expectedParentTree, length, 'expected parent tree');
  validateImplementationCandidate(plan.candidate, { oidLength: length });
  if (!same(plan.binding, plan.candidate.binding)) fail('FINALIZATION_STALE', 'candidate binding is stale');
  sortedPaths(plan.publicationPaths, 'publication paths');
  exactKeys(plan.task, TASK_KEYS, 'finalization task');
  validateTaskId(plan.task.taskId, 'finalization task ID');
  positiveInteger(plan.task.taskRevision, 'finalization task revision');
  positiveInteger(plan.task.expectedRecordVersion, 'expected task record version');
  positiveInteger(plan.task.completedRecordVersion, 'completed task record version');
  if (plan.task.completedRecordVersion <= plan.task.expectedRecordVersion ||
      plan.task.expectedStatus !== 'active' || plan.task.completedStatus !== 'done') {
    fail('FINALIZATION_INVALID', 'task CAS states are invalid');
  }
  if (plan.task.taskId !== plan.binding.taskId || plan.task.taskRevision !== plan.binding.taskRevision ||
      plan.task.expectedRecordVersion !== plan.binding.taskRecordVersion) {
    fail('FINALIZATION_STALE', 'task CAS does not match the finalization binding');
  }
  validateDigest(plan.task.completionEvidenceDigest, 'completion evidence digest');
  sortedPaths(plan.task.taskPaths, 'task paths');
  if (plan.task.taskPaths.some((taskPath) => plan.publicationPaths.some((publicationPath) =>
    taskPath === publicationPath || taskPath.startsWith(`${publicationPath}/`) ||
    publicationPath.startsWith(`${taskPath}/`)))) {
    fail('FINALIZATION_INVALID', 'task paths and candidate publication paths overlap');
  }
  validateBoundedArray(plan.requiredCheckReceipts, 'required check receipts');
  for (const [index, reference] of plan.requiredCheckReceipts.entries()) {
    validateRef(reference, `required check receipt[${index}]`);
    if (reference.kind !== 'check_receipt') fail('FINALIZATION_INVALID', 'a final check reference has the wrong kind');
  }
  const checkIds = plan.requiredCheckReceipts.map(({ id }) => id);
  if (checkIds.some((value, index) => index > 0 && checkIds[index - 1] >= value)) {
    fail('FINALIZATION_INVALID', 'required check receipts must be sorted by unique ID');
  }
  validateCommitMetadata(plan.completion);
  exactKeys(plan.terminal, TERMINAL_KEYS, 'terminal plan');
  validateControllerId(plan.terminal.receiptId, 'terminal receipt ID');
  validateTimestamp(plan.terminal.emittedAt, 'terminal emission time');
  return plan;
}

function validateTaskObservation(value, plan) {
  exactKeys(value, TASK_OBSERVATION_KEYS, 'task observation');
  validateTaskId(value.taskId, 'observed task ID');
  positiveInteger(value.taskRevision, 'observed task revision');
  positiveInteger(value.recordVersion, 'observed task record version');
  validateBoundedString(value.status, 'observed task status', { maxBytes: 64 });
  if (value.completionEvidenceDigest !== null) {
    validateDigest(value.completionEvidenceDigest, 'observed completion evidence digest');
  }
  sortedPaths(value.changedPaths, 'observed task changed paths');
  if (value.taskId !== plan.task.taskId || value.taskRevision !== plan.task.taskRevision) {
    fail('FINALIZATION_STALE', 'observed task identity or revision is stale');
  }
  const open = value.recordVersion === plan.task.expectedRecordVersion &&
    value.status === plan.task.expectedStatus && value.completionEvidenceDigest === null &&
    value.changedPaths.length === 0;
  const closed = value.recordVersion === plan.task.completedRecordVersion &&
    value.status === plan.task.completedStatus &&
    value.completionEvidenceDigest === plan.task.completionEvidenceDigest &&
    same(value.changedPaths, plan.task.taskPaths);
  if (!open && !closed) fail('FINALIZATION_RECONCILIATION_REQUIRED', 'task postcondition is neither exact open nor exact closed state');
  return open ? 'open' : 'closed';
}

function readJournal(journalPort, finalizationId) {
  if (!plainObject(journalPort) || typeof journalPort.read !== 'function' ||
      typeof journalPort.append !== 'function') fail('FINALIZATION_PORT_INVALID', 'journal port is invalid');
  const records = journalPort.read(finalizationId);
  if (!Array.isArray(records) || records.length > 128) fail('FINALIZATION_PORT_INVALID', 'journal result is invalid');
  return records;
}

function terminalFromJournal(records, plan) {
  const terminals = records.filter((record) => record?.kind === 'terminal_receipt');
  if (terminals.length === 0) return null;
  const expected = terminals[0].receipt;
  if (terminals.some(({ receipt }) => !same(receipt, expected))) {
    fail('FINALIZATION_RECONCILIATION_REQUIRED', 'terminal receipt evidence conflicts');
  }
  const expectedShape = {
    schemaVersion: 1,
    receiptId: plan.terminal.receiptId,
    binding: plan.binding,
    disposition: 'succeeded',
    candidateId: plan.candidate.candidateId,
    finalTree: expected.finalTree,
    finalCommit: expected.finalCommit,
    taskStatus: plan.task.completedStatus,
    taskRecordVersion: plan.task.completedRecordVersion,
    checkReceipts: plan.requiredCheckReceipts,
    completionEvidenceDigest: plan.task.completionEvidenceDigest,
    emittedAt: plan.terminal.emittedAt,
  };
  if (!same(expected, expectedShape)) {
    fail('FINALIZATION_RECONCILIATION_REQUIRED', 'terminal receipt does not match the finalization plan');
  }
  return expected;
}

function taskPortObservation(taskPort, plan) {
  if (!plainObject(taskPort) || typeof taskPort.observe !== 'function' || typeof taskPort.close !== 'function') {
    fail('FINALIZATION_PORT_INVALID', 'task port is invalid');
  }
  const value = taskPort.observe({ taskId: plan.task.taskId, taskRevision: plan.task.taskRevision });
  const state = validateTaskObservation(value, plan);
  return Object.freeze({ state, value });
}

export function observeFinalizationPostconditions({
  plan,
  repositoryRoot,
  gitExecutable,
  taskPort,
  journalPort,
  gitAdminCapability,
}) {
  validateFinalizationPlan(plan);
  assertProtectedImplementationCapability(gitAdminCapability, 'git_admin');
  const actualPublicationPaths = changedPathsBetweenTrees({
    repositoryRoot,
    gitExecutable,
    fromTree: plan.repository.expectedParentTree,
    toTree: plan.candidate.tree,
  });
  if (!same(actualPublicationPaths, plan.publicationPaths)) {
    fail('FINALIZATION_STALE', 'publication paths are not the actual candidate delta');
  }
  observeCandidateFacts({ repositoryRoot, gitExecutable, candidate: plan.candidate });
  if (observeCommitTree({
    repositoryRoot, gitExecutable, commit: plan.repository.expectedParentCommit,
  }) !== plan.repository.expectedParentTree) {
    fail('FINALIZATION_STALE', 'expected parent commit and tree do not agree');
  }
  const head = observeCanonicalHead({ repositoryRoot, gitExecutable });
  const targetOid = observeRef({ repositoryRoot, gitExecutable, refName: plan.repository.targetRef });
  if (head.refName !== plan.repository.targetRef || head.commit !== targetOid) {
    fail('FINALIZATION_RECONCILIATION_REQUIRED', 'canonical HEAD and target ref do not agree');
  }
  const task = taskPortObservation(taskPort, plan);
  const workingChanges = observeWorktreeChanges({ repositoryRoot, gitExecutable });
  const candidatePathsAtParent = worktreePathsMatchTree({
    repositoryRoot, gitExecutable, tree: plan.repository.expectedParentTree,
    paths: plan.publicationPaths,
  });
  const candidatePathsAtTarget = worktreePathsMatchTree({
    repositoryRoot, gitExecutable, tree: plan.candidate.tree, paths: plan.publicationPaths,
  });
  let indexTree;
  if (indexMatchesTree({ repositoryRoot, gitExecutable, tree: plan.repository.expectedParentTree })) {
    indexTree = plan.repository.expectedParentTree;
  } else if (indexMatchesTree({ repositoryRoot, gitExecutable, tree: plan.candidate.tree })) {
    indexTree = plan.candidate.tree;
  } else {
    indexTree = writeIndexTree({ repositoryRoot, gitExecutable, capability: gitAdminCapability });
  }
  let plannedCommit = null;
  let completionCommit = null;
  let stagedPathsExact = false;
  let finalWorktreeExact = false;
  if (task.state === 'closed' && indexTree !== plan.repository.expectedParentTree &&
      indexTree !== plan.candidate.tree) {
    const stagedPaths = changedPathsBetweenTrees({
      repositoryRoot, gitExecutable, fromTree: plan.candidate.tree, toTree: indexTree,
    });
    stagedPathsExact = same(stagedPaths, plan.task.taskPaths);
    if (stagedPathsExact) {
      plannedCommit = expectedCompletionCommit({
        repositoryRoot, gitExecutable, tree: indexTree,
        parentCommit: plan.repository.expectedParentCommit, metadata: plan.completion,
      });
      completionCommit = observeCompletionCommit({ repositoryRoot, gitExecutable, commit: plannedCommit });
      if (completionCommit !== null && (completionCommit.tree !== indexTree ||
          completionCommit.parentCommit !== plan.repository.expectedParentCommit)) {
        fail('FINALIZATION_RECONCILIATION_REQUIRED', 'completion commit facts conflict with the plan');
      }
      finalWorktreeExact = worktreePathsMatchTree({
        repositoryRoot, gitExecutable, tree: indexTree,
        paths: [...plan.publicationPaths, ...plan.task.taskPaths].sort(),
      });
    }
  }
  const terminalReceipt = terminalFromJournal(readJournal(journalPort, plan.finalizationId), plan);
  return Object.freeze({
    head,
    targetOid,
    task,
    candidatePathsAtParent,
    candidatePathsAtTarget,
    indexTree,
    stagedPathsExact,
    plannedCommit,
    completionCommit,
    finalWorktreeExact,
    terminalReceipt,
    workingChanges,
  });
}

export function selectFinalizationBoundary(plan, observation) {
  validateFinalizationPlan(plan);
  if (!plainObject(observation)) fail('FINALIZATION_INVALID', 'finalization observation is invalid');
  if (observation.terminalReceipt !== null) {
    if (observation.targetOid !== observation.terminalReceipt.finalCommit ||
        observation.head.commit !== observation.terminalReceipt.finalCommit ||
        observation.plannedCommit !== observation.terminalReceipt.finalCommit ||
        observation.indexTree !== observation.terminalReceipt.finalTree ||
        observation.task.state !== 'closed' || !observation.finalWorktreeExact ||
        observation.workingChanges.length !== 0) {
      fail('FINALIZATION_RECONCILIATION_REQUIRED', 'terminal receipt exists before all exact postconditions');
    }
    return 'succeeded';
  }
  const refAtParent = observation.targetOid === plan.repository.expectedParentCommit;
  const refAtCompletion = observation.plannedCommit !== null &&
    observation.targetOid === observation.plannedCommit;
  if (!refAtParent && !refAtCompletion) {
    fail('FINALIZATION_RECONCILIATION_REQUIRED', 'target ref is neither the expected parent nor planned completion commit');
  }
  if (refAtCompletion) {
    if (observation.task.state !== 'closed' || observation.completionCommit === null ||
        observation.indexTree !== observation.completionCommit.tree || !observation.finalWorktreeExact ||
        observation.workingChanges.length !== 0) {
      fail('FINALIZATION_RECONCILIATION_REQUIRED', 'published ref lacks exact task, commit, index, or worktree postconditions');
    }
    return 'terminal_receipt';
  }
  if (observation.task.state === 'open') {
    if (observation.indexTree === plan.repository.expectedParentTree && observation.candidatePathsAtParent &&
        oneOfPathSets(observation.workingChanges, [[], plan.task.taskPaths])) {
      return 'candidate_apply';
    }
    if (observation.indexTree === plan.candidate.tree && observation.candidatePathsAtTarget &&
        oneOfPathSets(observation.workingChanges, [
          plan.publicationPaths,
          [...plan.publicationPaths, ...plan.task.taskPaths],
        ])) {
      return 'task_close';
    }
    fail('FINALIZATION_RECONCILIATION_REQUIRED', 'open task has an ambiguous candidate-apply state');
  }
  if (!observation.candidatePathsAtTarget) {
    fail('FINALIZATION_RECONCILIATION_REQUIRED', 'closed task lacks the exact candidate worktree state');
  }
  if (!same(observation.workingChanges, [...plan.publicationPaths, ...plan.task.taskPaths].sort())) {
    fail('FINALIZATION_RECONCILIATION_REQUIRED', 'closed task has unknown canonical worktree changes');
  }
  if (observation.indexTree === plan.candidate.tree) return 'completion_commit';
  if (!observation.stagedPathsExact || !observation.finalWorktreeExact) {
    fail('FINALIZATION_RECONCILIATION_REQUIRED', 'closed task has an ambiguous staged tree');
  }
  if (observation.completionCommit === null) return 'completion_commit';
  return 'target_ref';
}

function journalRecord(plan, boundary, phase, evidence) {
  return Object.freeze({
    schemaVersion: 1,
    kind: 'boundary',
    finalizationId: plan.finalizationId,
    idempotencyKey: `${plan.finalizationId}:${boundary}:${phase}`,
    boundary,
    phase,
    inputDigest: canonicalDigest({ plan: plan.finalizationId, binding: plan.binding, boundary }),
    evidenceDigest: canonicalDigest(evidence),
    recordedAt: plan.terminal.emittedAt,
  });
}

function appendJournal(journalPort, record, capability) {
  assertProtectedImplementationCapability(capability, 'ledger_write');
  journalPort.append(record, capability);
}

function terminalReceipt(plan, observation) {
  return Object.freeze({
    schemaVersion: 1,
    receiptId: plan.terminal.receiptId,
    binding: Object.freeze({ ...plan.binding }),
    disposition: 'succeeded',
    candidateId: plan.candidate.candidateId,
    finalTree: observation.indexTree,
    finalCommit: observation.plannedCommit,
    taskStatus: plan.task.completedStatus,
    taskRecordVersion: plan.task.completedRecordVersion,
    checkReceipts: Object.freeze(plan.requiredCheckReceipts.map((reference) => Object.freeze({ ...reference }))),
    completionEvidenceDigest: plan.task.completionEvidenceDigest,
    emittedAt: plan.terminal.emittedAt,
  });
}

function closeRequest(plan) {
  return Object.freeze({
    schemaVersion: 1,
    operation: 'close_task',
    taskId: plan.task.taskId,
    taskRevision: plan.task.taskRevision,
    expectedRecordVersion: plan.task.expectedRecordVersion,
    completedRecordVersion: plan.task.completedRecordVersion,
    completionEvidenceDigest: plan.task.completionEvidenceDigest,
    expectedChangedPaths: plan.task.taskPaths,
  });
}

/**
 * Runs forward only. Each retry re-observes task/Git/journal postconditions and selects
 * the next boundary; journal phase markers are audit evidence, never effect authority.
 */
export function runFinalization({
  plan,
  repositoryRoot,
  gitExecutable,
  taskPort,
  journalPort,
  capabilities,
  hooks = {},
  maximumBoundaries = FINALIZATION_BOUNDARIES.length + 1,
}) {
  validateFinalizationPlan(plan);
  if (!plainObject(capabilities)) fail('FINALIZATION_PORT_INVALID', 'finalization capabilities are invalid');
  assertProtectedImplementationCapability(capabilities.gitAdmin, 'git_admin');
  assertProtectedImplementationCapability(capabilities.taskMutation, 'task_mutation');
  assertProtectedImplementationCapability(capabilities.finalRef, 'final_ref');
  assertProtectedImplementationCapability(capabilities.ledgerWrite, 'ledger_write');
  if (!Number.isSafeInteger(maximumBoundaries) || maximumBoundaries < 1 || maximumBoundaries > 16) {
    fail('FINALIZATION_INVALID', 'maximum boundary count is invalid');
  }
  const applied = [];
  for (let step = 0; step < maximumBoundaries; step += 1) {
    const observation = observeFinalizationPostconditions({
      plan, repositoryRoot, gitExecutable, taskPort, journalPort,
      gitAdminCapability: capabilities.gitAdmin,
    });
    const boundary = selectFinalizationBoundary(plan, observation);
    if (boundary === 'succeeded') {
      return Object.freeze({ disposition: 'succeeded', receipt: observation.terminalReceipt,
        boundariesApplied: Object.freeze(applied) });
    }
    appendJournal(journalPort, journalRecord(plan, boundary, 'intent', {
      targetOid: observation.targetOid,
      task: observation.task.value,
      indexTree: observation.indexTree,
      plannedCommit: observation.plannedCommit,
    }), capabilities.ledgerWrite);
    if (typeof hooks.beforeEffect === 'function') hooks.beforeEffect(boundary, observation);
    if (boundary === 'candidate_apply') {
      applyCandidateTree({
        repositoryRoot, gitExecutable, operationId: `${plan.finalizationId}_apply`,
        expectedTree: plan.repository.expectedParentTree, targetTree: plan.candidate.tree,
        allowedPaths: plan.publicationPaths, capability: capabilities.gitAdmin,
      });
    } else if (boundary === 'task_close') {
      taskPort.close(closeRequest(plan), capabilities.taskMutation);
    } else if (boundary === 'completion_commit') {
      let stagedTree = observation.indexTree;
      if (stagedTree === plan.candidate.tree) {
        stagedTree = stageExactPaths({
          repositoryRoot, gitExecutable, baseTree: plan.candidate.tree,
          paths: plan.task.taskPaths, capability: capabilities.gitAdmin,
        });
      }
      const expected = expectedCompletionCommit({
        repositoryRoot, gitExecutable, tree: stagedTree,
        parentCommit: plan.repository.expectedParentCommit, metadata: plan.completion,
      });
      if (observeCompletionCommit({ repositoryRoot, gitExecutable, commit: expected }) === null) {
        createCompletionCommit({
          repositoryRoot, gitExecutable, tree: stagedTree,
          parentCommit: plan.repository.expectedParentCommit, metadata: plan.completion,
          capability: capabilities.gitAdmin,
        });
      }
    } else if (boundary === 'target_ref') {
      compareAndSwapRef({
        repositoryRoot, gitExecutable, refName: plan.repository.targetRef,
        expectedOldOid: plan.repository.expectedParentCommit,
        newOid: observation.plannedCommit, capability: capabilities.finalRef,
      });
    } else if (boundary === 'terminal_receipt') {
      const receipt = terminalReceipt(plan, observation);
      appendJournal(journalPort, Object.freeze({
        schemaVersion: 1,
        kind: 'terminal_receipt',
        finalizationId: plan.finalizationId,
        idempotencyKey: `${plan.finalizationId}:terminal_receipt`,
        receipt,
      }), capabilities.ledgerWrite);
    } else {
      fail('FINALIZATION_INVALID', 'selected finalization boundary is unsupported');
    }
    applied.push(boundary);
    if (typeof hooks.afterEffect === 'function') hooks.afterEffect(boundary);
    if (boundary !== 'terminal_receipt') {
      const after = observeFinalizationPostconditions({
        plan, repositoryRoot, gitExecutable, taskPort, journalPort,
        gitAdminCapability: capabilities.gitAdmin,
      });
      appendJournal(journalPort, journalRecord(plan, boundary, 'observed', {
        targetOid: after.targetOid,
        task: after.task.value,
        indexTree: after.indexTree,
        plannedCommit: after.plannedCommit,
      }), capabilities.ledgerWrite);
    }
  }
  fail('FINALIZATION_RECONCILIATION_REQUIRED', 'finalization exceeded its bounded forward progress');
}
