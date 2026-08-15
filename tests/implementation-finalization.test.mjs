import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { validateTerminalReceipt } from '../lib/implementation-protocol.mjs';
import { installImplementationCapabilityFixture } from './implementation-capability-fixture.mjs';

installImplementationCapabilityFixture();

const {
  changedPathsBetweenTrees,
  issueSourceInstrumentedTestCapability,
  protectedImplementationCapabilityAllows,
} = await import('../lib/implementation-git.mjs');
const {
  FINALIZATION_BOUNDARIES,
  ImplementationFinalizationError,
  observeFinalizationPostconditions,
  runFinalization: runFinalizationWithoutBoundary,
  runFinalizationAsync: runFinalizationAsyncWithoutBoundary,
  selectFinalizationBoundary,
  validateFinalizationPlan,
} = await import('../lib/implementation-finalization.mjs');

const git = realpathSync(resolve(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim()));
const digest = (character) => `sha256:${character.repeat(64)}`;
const binding = Object.freeze({
  runId: 'run_54', epoch: 1, snapshotRevision: 3, taskId: 'T-0054', taskRevision: 2,
  taskRecordVersion: 5, capsuleDigest: digest('a'), controlGeneration: 0,
  correctionGeneration: 0,
});

const allowCurrentBoundary = () => true;
const runFinalization = (options) => runFinalizationWithoutBoundary({
  authorizeBoundary: allowCurrentBoundary,
  ...options,
});
const runFinalizationAsync = (options) => runFinalizationAsyncWithoutBoundary({
  authorizeBoundary: allowCurrentBoundary,
  ...options,
});

function assertValidTerminalReceipt(receipt) {
  assert.equal(validateTerminalReceipt(receipt), receipt);
  assert.equal(receipt.taskRecordVersion, 6);
  assert.deepEqual(receipt.binding, { ...binding, taskRecordVersion: 6 });
}

function command(root, args, { input = undefined } = {}) {
  return execFileSync(git, args, {
    cwd: root,
    input,
    encoding: 'utf8',
    env: {
      LANG: 'C',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_AUTHOR_DATE: '2026-08-14T09:00:00Z',
      GIT_COMMITTER_DATE: '2026-08-14T09:00:00Z',
    },
  }).trim();
}

function patchDigest(root, fromTree, toTree) {
  const bytes = execFileSync(git, [
    'diff-tree', '--binary', '--full-index', '--no-ext-diff', '-r', '--no-renames',
    fromTree, toTree, '--',
  ], { cwd: root });
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function activation(effectKind) {
  return issueSourceInstrumentedTestCapability(effectKind);
}

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'implementation-finalization-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  command(root, ['init', '--quiet', '--initial-branch=main']);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'feature.txt'), 'before\n');
  writeFileSync(join(root, 'task.json'), '{"status":"active","version":5}\n');
  command(root, ['add', '--', 'src/feature.txt', 'task.json']);
  command(root, ['commit', '--quiet', '-m', 'base']);
  const baseCommit = command(root, ['rev-parse', 'HEAD']);
  const baseTree = command(root, ['rev-parse', 'HEAD^{tree}']);
  command(root, ['checkout', '--quiet', '--detach', baseCommit]);
  writeFileSync(join(root, 'src', 'feature.txt'), 'after\n');
  command(root, ['add', 'src/feature.txt']);
  command(root, ['commit', '--quiet', '-m', 'candidate']);
  const candidateCommit = command(root, ['rev-parse', 'HEAD']);
  const candidateTree = command(root, ['rev-parse', 'HEAD^{tree}']);
  command(root, ['checkout', '--quiet', 'main']);
  const candidate = Object.freeze({
    schemaVersion: 1,
    candidateId: 'candidate_final',
    binding: { ...binding },
    parentCandidateId: null,
    baseTree,
    tree: candidateTree,
    privateCommit: candidateCommit,
    producerAttempts: ['attempt_1'],
    changedPaths: ['src/feature.txt'],
    ownershipDigest: digest('d'),
    patchDigest: patchDigest(root, baseTree, candidateTree),
    createdAt: '2026-08-14T10:01:00Z',
  });
  const plan = Object.freeze({
    schemaVersion: 1,
    finalizationId: 'finalize_54',
    binding: { ...binding },
    candidate,
    repository: {
      targetRef: 'refs/heads/main',
      expectedParentCommit: baseCommit,
      expectedParentTree: baseTree,
    },
    publicationPaths: ['src/feature.txt'],
    task: {
      taskId: 'T-0054',
      taskRevision: 2,
      expectedRecordVersion: 5,
      completedRecordVersion: 6,
      expectedStatus: 'active',
      completedStatus: 'done',
      completionEvidenceDigest: digest('e'),
      taskPaths: ['task.json'],
    },
    requiredCheckReceipts: [
      { kind: 'check_receipt', id: 'check_qa', digest: digest('1') },
      { kind: 'check_receipt', id: 'check_security', digest: digest('2') },
    ],
    completion: {
      authorName: 'Meta Framework',
      authorEmail: 'meta@example.invalid',
      committerName: 'Meta Framework',
      committerEmail: 'meta@example.invalid',
      timestamp: '2026-08-14T10:06:00Z',
      message: 'feat(controller): finish T-0054\n',
    },
    terminal: { receiptId: 'terminal_54', emittedAt: '2026-08-14T10:07:00Z' },
  });

  let task = {
    taskId: 'T-0054', taskRevision: 2, recordVersion: 5, status: 'active',
    completionEvidenceDigest: null, changedPaths: [],
  };
  const taskPort = {
    closeCalls: 0,
    observe() {
      return { ...task, changedPaths: [...task.changedPaths] };
    },
    close(request, capability) {
      assert.equal(protectedImplementationCapabilityAllows(capability, 'task_mutation'), true);
      assert.deepEqual(request, {
        schemaVersion: 1,
        operation: 'close_task',
        taskId: 'T-0054',
        taskRevision: 2,
        expectedRecordVersion: 5,
        completedRecordVersion: 6,
        completionEvidenceDigest: digest('e'),
        expectedChangedPaths: ['task.json'],
      });
      if (task.recordVersion === 6) return;
      assert.equal(task.recordVersion, 5);
      taskPort.closeCalls += 1;
      writeFileSync(join(root, 'task.json'), '{"status":"done","version":6}\n');
      task = {
        taskId: 'T-0054', taskRevision: 2, recordVersion: 6, status: 'done',
        completionEvidenceDigest: digest('e'), changedPaths: ['task.json'],
      };
    },
    replace(value) {
      task = value;
    },
  };
  const records = new Map();
  const journalPort = {
    appendCalls: 0,
    read(finalizationId) {
      assert.equal(finalizationId, plan.finalizationId);
      return [...records.values()];
    },
    append(record, capability) {
      assert.equal(protectedImplementationCapabilityAllows(capability, 'ledger_write'), true);
      journalPort.appendCalls += 1;
      const previous = records.get(record.idempotencyKey);
      if (previous !== undefined) {
        assert.deepEqual(previous, record);
        return;
      }
      records.set(record.idempotencyKey, record);
    },
  };
  const capabilities = {
    gitAdmin: activation('git_admin'),
    taskMutation: activation('task_mutation'),
    finalRef: activation('final_ref'),
    ledgerWrite: activation('ledger_write'),
  };
  return { root, baseCommit, baseTree, candidateTree, plan, taskPort, journalPort, capabilities };
}

function asyncPorts(value, { loseAfterAppend = () => false } = {}) {
  let lossPending = true;
  const events = [];
  const taskPort = {
    async observe(request) {
      await Promise.resolve();
      return value.taskPort.observe(request);
    },
    async close(request, capability) {
      await Promise.resolve();
      value.taskPort.close(request, capability);
    },
  };
  const journalPort = {
    async read(finalizationId) {
      await Promise.resolve();
      return value.journalPort.read(finalizationId);
    },
    async append(record, capability) {
      await Promise.resolve();
      value.journalPort.append(record, capability);
      events.push(`journal:${record.boundary ?? record.kind}:${record.phase ?? 'published'}`);
      if (lossPending && loseAfterAppend(record)) {
        lossPending = false;
        throw new Error(`simulated journal response loss at ${record.idempotencyKey}`);
      }
    },
  };
  return { taskPort, journalPort, events };
}

test('a validated finalization applies, closes through the injected CAS port, commits, CAS-publishes, and receipts', (t) => {
  const value = fixture(t);
  assert.equal(validateFinalizationPlan(value.plan), value.plan);
  const initial = observeFinalizationPostconditions({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: value.taskPort, journalPort: value.journalPort,
    gitAdminCapability: value.capabilities.gitAdmin,
  });
  assert.equal(selectFinalizationBoundary(value.plan, initial), 'candidate_apply');
  const result = runFinalization({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: value.taskPort, journalPort: value.journalPort, capabilities: value.capabilities,
  });
  assert.equal(result.disposition, 'succeeded');
  assert.deepEqual(result.boundariesApplied, FINALIZATION_BOUNDARIES);
  assert.equal(result.receipt.disposition, 'succeeded');
  assertValidTerminalReceipt(result.receipt);
  assert.equal(value.taskPort.closeCalls, 1);
  assert.equal(command(value.root, ['rev-parse', 'HEAD']), result.receipt.finalCommit);
  assert.equal(command(value.root, ['rev-parse', 'HEAD^{tree}']), result.receipt.finalTree);
  assert.equal(command(value.root, ['status', '--porcelain']), '');
  assert.equal(readFileSync(join(value.root, 'src', 'feature.txt'), 'utf8'), 'after\n');
  assert.equal(readFileSync(join(value.root, 'task.json'), 'utf8'), '{"status":"done","version":6}\n');
});

test('sync and async finalization require current boundary authorization before effects', async (t) => {
  const syncValue = fixture(t);
  assert.throws(() => runFinalizationWithoutBoundary({
    plan: syncValue.plan, repositoryRoot: syncValue.root, gitExecutable: git,
    taskPort: syncValue.taskPort, journalPort: syncValue.journalPort,
    capabilities: syncValue.capabilities,
  }), (error) => error.code === 'FINALIZATION_AUTHORITY_REVOKED');
  assert.equal(command(syncValue.root, ['rev-parse', 'HEAD']), syncValue.baseCommit);
  assert.equal(syncValue.taskPort.closeCalls, 0);

  const asyncValue = fixture(t);
  const asyncValuePorts = asyncPorts(asyncValue);
  await assert.rejects(runFinalizationAsyncWithoutBoundary({
    plan: asyncValue.plan, repositoryRoot: asyncValue.root, gitExecutable: git,
    taskPort: asyncValuePorts.taskPort,
    journalPort: asyncValuePorts.journalPort,
    capabilities: asyncValue.capabilities,
  }), (error) => error.code === 'FINALIZATION_AUTHORITY_REVOKED');
  assert.equal(command(asyncValue.root, ['rev-parse', 'HEAD']), asyncValue.baseCommit);
  assert.equal(asyncValue.taskPort.closeCalls, 0);
});

for (const crashBoundary of FINALIZATION_BOUNDARIES) {
  test(`recovery advances from observed postconditions after response loss at ${crashBoundary}`, (t) => {
    const value = fixture(t);
    const effects = [];
    let crashPending = true;
    assert.throws(() => runFinalization({
      plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
      taskPort: value.taskPort, journalPort: value.journalPort, capabilities: value.capabilities,
      hooks: {
        beforeEffect(boundary) { effects.push(boundary); },
        afterEffect(boundary) {
          if (crashPending && boundary === crashBoundary) {
            crashPending = false;
            throw new Error(`simulated response loss after ${boundary}`);
          }
        },
      },
    }), new RegExp(crashBoundary, 'u'));
    const recovered = runFinalization({
      plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
      taskPort: value.taskPort, journalPort: value.journalPort, capabilities: value.capabilities,
      hooks: { beforeEffect(boundary) { effects.push(boundary); } },
    });
    assert.equal(recovered.disposition, 'succeeded');
    assertValidTerminalReceipt(recovered.receipt);
    assert.equal(effects.filter((boundary) => boundary === crashBoundary).length, 1,
      'an effect whose response was lost must not be repeated');
    assert.equal(value.taskPort.closeCalls, 1);
    assert.equal(command(value.root, ['status', '--porcelain']), '');
  });
}

test('stale task CAS, stale target ref, unknown worktree dirt, and fake capabilities fail before effects', (t) => {
  const skippedVersion = fixture(t);
  assert.throws(() => validateFinalizationPlan({
    ...skippedVersion.plan,
    task: { ...skippedVersion.plan.task,
      completedRecordVersion: skippedVersion.plan.task.expectedRecordVersion + 2 },
  }), (error) => error.code === 'FINALIZATION_INVALID');

  const staleTask = fixture(t);
  staleTask.taskPort.replace({
    taskId: 'T-0054', taskRevision: 2, recordVersion: 7, status: 'active',
    completionEvidenceDigest: null, changedPaths: [],
  });
  assert.throws(() => runFinalization({
    plan: staleTask.plan, repositoryRoot: staleTask.root, gitExecutable: git,
    taskPort: staleTask.taskPort, journalPort: staleTask.journalPort,
    capabilities: staleTask.capabilities,
  }), (error) => error instanceof ImplementationFinalizationError &&
    error.code === 'FINALIZATION_RECONCILIATION_REQUIRED');
  assert.equal(staleTask.taskPort.closeCalls, 0);

  const staleRef = fixture(t);
  const foreign = command(staleRef.root, [
    'commit-tree', staleRef.baseTree, '-p', staleRef.baseCommit,
  ], { input: 'foreign ref move\n' });
  command(staleRef.root, ['update-ref', 'refs/heads/main', foreign, staleRef.baseCommit]);
  assert.throws(() => runFinalization({
    plan: staleRef.plan, repositoryRoot: staleRef.root, gitExecutable: git,
    taskPort: staleRef.taskPort, journalPort: staleRef.journalPort,
    capabilities: staleRef.capabilities,
  }), (error) => error.code === 'FINALIZATION_RECONCILIATION_REQUIRED');
  assert.equal(staleRef.taskPort.closeCalls, 0);

  const dirty = fixture(t);
  writeFileSync(join(dirty.root, 'unexpected.txt'), 'unknown\n');
  assert.throws(() => runFinalization({
    plan: dirty.plan, repositoryRoot: dirty.root, gitExecutable: git,
    taskPort: dirty.taskPort, journalPort: dirty.journalPort, capabilities: dirty.capabilities,
  }), (error) => error.code === 'FINALIZATION_RECONCILIATION_REQUIRED');

  const fakeCapability = fixture(t);
  assert.throws(() => runFinalization({
    plan: fakeCapability.plan, repositoryRoot: fakeCapability.root, gitExecutable: git,
    taskPort: fakeCapability.taskPort, journalPort: fakeCapability.journalPort,
    capabilities: { ...fakeCapability.capabilities, finalRef: {} },
  }), (error) => error.code === 'ACTIVATION_DENIED');
});

test('finalization accepts an earlier candidate snapshot only while effect authority is current', (t) => {
  const value = fixture(t);
  const earlierCandidate = {
    ...value.plan.candidate,
    binding: {
      ...value.plan.candidate.binding,
      snapshotRevision: value.plan.binding.snapshotRevision - 1,
    },
  };
  assert.doesNotThrow(() => validateFinalizationPlan({
    ...value.plan,
    candidate: earlierCandidate,
  }));
  assert.throws(() => validateFinalizationPlan({
    ...value.plan,
    candidate: {
      ...earlierCandidate,
      binding: {
        ...earlierCandidate.binding,
        controlGeneration: value.plan.binding.controlGeneration + 1,
      },
    },
  }), (error) => error.code === 'FINALIZATION_STALE');
});

test('known open-task dirt is preserved until the injected close port replaces it', (t) => {
  const value = fixture(t);
  writeFileSync(join(value.root, 'task.json'), '{"status":"active","version":5,"handoff":true}\n');
  const result = runFinalization({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: value.taskPort, journalPort: value.journalPort, capabilities: value.capabilities,
  });
  assert.equal(result.disposition, 'succeeded');
  assert.equal(value.taskPort.closeCalls, 1);
  assert.equal(command(value.root, ['status', '--porcelain']), '');
});

test('task close response loss is observed and never invokes the close port twice', (t) => {
  const value = fixture(t);
  let lost = true;
  const originalClose = value.taskPort.close.bind(value.taskPort);
  value.taskPort.close = (request, capability) => {
    originalClose(request, capability);
    if (lost) {
      lost = false;
      throw new Error('task CLI response lost');
    }
  };
  assert.throws(() => runFinalization({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: value.taskPort, journalPort: value.journalPort, capabilities: value.capabilities,
  }), /response lost/u);
  const recovered = runFinalization({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: value.taskPort, journalPort: value.journalPort, capabilities: value.capabilities,
  });
  assert.equal(recovered.disposition, 'succeeded');
  assert.equal(value.taskPort.closeCalls, 1);
});

test('async finalization awaits durable ports and returns the exact published terminal receipt', async (t) => {
  const value = fixture(t);
  const ports = asyncPorts(value);
  const result = await runFinalizationAsync({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: ports.taskPort, journalPort: ports.journalPort, capabilities: value.capabilities,
    hooks: {
      async beforeEffect(boundary) {
        await Promise.resolve();
        ports.events.push(`effect:${boundary}:before`);
      },
      async afterEffect(boundary) {
        await Promise.resolve();
        ports.events.push(`effect:${boundary}:after`);
      },
    },
  });
  assert.equal(result.disposition, 'succeeded');
  assert.deepEqual(result.boundariesApplied, FINALIZATION_BOUNDARIES);
  assertValidTerminalReceipt(result.receipt);
  const records = await ports.journalPort.read(value.plan.finalizationId);
  const published = records.find((record) => record.kind === 'terminal_receipt');
  assert.deepEqual(result.receipt, published.receipt);
  for (const boundary of FINALIZATION_BOUNDARIES) {
    const intent = ports.events.indexOf(`journal:${boundary}:intent`);
    const before = ports.events.indexOf(`effect:${boundary}:before`);
    assert.notEqual(intent, -1);
    assert.ok(before > intent);
    if (boundary !== 'terminal_receipt') {
      const after = ports.events.indexOf(`effect:${boundary}:after`);
      assert.ok(after > before);
      assert.ok(ports.events.indexOf(`journal:${boundary}:observed`) > after);
    } else {
      assert.ok(ports.events.indexOf('journal:terminal_receipt:published') > before);
    }
  }
  assert.equal(value.taskPort.closeCalls, 1);
  assert.equal(command(value.root, ['status', '--porcelain']), '');
});

for (const revokedBoundary of FINALIZATION_BOUNDARIES) {
  test(`async authority revocation prevents the ${revokedBoundary} effect and exact retry resumes`, async (t) => {
    const value = fixture(t);
    const ports = asyncPorts(value);
    const contexts = [];
    let revokePending = true;
    await assert.rejects(runFinalizationAsync({
      plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
      taskPort: ports.taskPort, journalPort: ports.journalPort, capabilities: value.capabilities,
      async authorizeBoundary(context) {
        await Promise.resolve();
        assert.equal(Object.isFrozen(context), true);
        assert.equal(context.plan, value.plan);
        contexts.push(context);
        if (revokePending && context.boundary === revokedBoundary) {
          revokePending = false;
          return false;
        }
        return true;
      },
    }), (error) => error instanceof ImplementationFinalizationError &&
      error.code === 'FINALIZATION_AUTHORITY_REVOKED');
    const revokedContext = contexts.findLast((context) => context.boundary === revokedBoundary);
    assert.equal(revokedContext.observation.task.state,
      FINALIZATION_BOUNDARIES.indexOf(revokedBoundary) > FINALIZATION_BOUNDARIES.indexOf('task_close') ?
        'closed' : 'open');
    if (revokedContext.observation.task.state === 'closed') {
      assert.equal(revokedContext.observation.task.value.recordVersion,
        value.plan.task.completedRecordVersion);
      assert.equal(revokedContext.observation.task.value.taskRevision, value.plan.task.taskRevision);
    }
    const afterRevocation = observeFinalizationPostconditions({
      plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
      taskPort: value.taskPort, journalPort: value.journalPort,
      gitAdminCapability: value.capabilities.gitAdmin,
    });
    assert.equal(selectFinalizationBoundary(value.plan, afterRevocation), revokedBoundary,
      'revoked boundary effect must not have happened');
    const recovered = await runFinalizationAsync({
      plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
      taskPort: ports.taskPort, journalPort: ports.journalPort, capabilities: value.capabilities,
      async authorizeBoundary(context) {
        if (context.observation.task.state === 'closed') {
          assert.equal(context.observation.task.value.recordVersion,
            value.plan.task.completedRecordVersion);
          assert.equal(context.observation.task.value.taskRevision, value.plan.task.taskRevision);
        }
        return true;
      },
    });
    assert.equal(recovered.disposition, 'succeeded');
    assert.equal(recovered.boundariesApplied[0], revokedBoundary);
    assertValidTerminalReceipt(recovered.receipt);
    assert.equal(value.taskPort.closeCalls, 1);
  });
}

test('async boundary-authorizer response loss after task close retries before the same effect', async (t) => {
  const value = fixture(t);
  const ports = asyncPorts(value);
  let responseLossPending = true;
  let completionAuthorizations = 0;
  await assert.rejects(runFinalizationAsync({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: ports.taskPort, journalPort: ports.journalPort, capabilities: value.capabilities,
    async authorizeBoundary({ boundary, observation }) {
      await Promise.resolve();
      if (boundary === 'completion_commit') {
        completionAuthorizations += 1;
        assert.equal(observation.task.state, 'closed');
        assert.equal(observation.task.value.recordVersion, value.plan.task.completedRecordVersion);
        if (responseLossPending) {
          responseLossPending = false;
          throw new Error('simulated boundary-authorizer response loss');
        }
      }
      return true;
    },
  }), /boundary-authorizer response loss/u);
  const afterLoss = observeFinalizationPostconditions({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: value.taskPort, journalPort: value.journalPort,
    gitAdminCapability: value.capabilities.gitAdmin,
  });
  assert.equal(selectFinalizationBoundary(value.plan, afterLoss), 'completion_commit');
  const recovered = await runFinalizationAsync({
    plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
    taskPort: ports.taskPort, journalPort: ports.journalPort, capabilities: value.capabilities,
    async authorizeBoundary({ boundary, observation }) {
      if (boundary === 'completion_commit') {
        completionAuthorizations += 1;
        assert.equal(observation.task.state, 'closed');
      }
      return true;
    },
  });
  assert.equal(recovered.disposition, 'succeeded');
  assert.equal(recovered.boundariesApplied[0], 'completion_commit');
  assert.equal(completionAuthorizations, 2);
  assert.equal(value.taskPort.closeCalls, 1);
  assertValidTerminalReceipt(recovered.receipt);
});

for (const crashBoundary of FINALIZATION_BOUNDARIES) {
  test(`async recovery does not repeat an effect after response loss at ${crashBoundary}`, async (t) => {
    const value = fixture(t);
    const ports = asyncPorts(value);
    const effects = [];
    let crashPending = true;
    await assert.rejects(runFinalizationAsync({
      plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
      taskPort: ports.taskPort, journalPort: ports.journalPort, capabilities: value.capabilities,
      hooks: {
        async beforeEffect(boundary) {
          await Promise.resolve();
          effects.push(boundary);
        },
        async afterEffect(boundary) {
          await Promise.resolve();
          if (crashPending && boundary === crashBoundary) {
            crashPending = false;
            throw new Error(`simulated async response loss after ${boundary}`);
          }
        },
      },
    }), new RegExp(crashBoundary, 'u'));
    const recovered = await runFinalizationAsync({
      plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
      taskPort: ports.taskPort, journalPort: ports.journalPort, capabilities: value.capabilities,
      hooks: { async beforeEffect(boundary) { effects.push(boundary); } },
    });
    assert.equal(recovered.disposition, 'succeeded');
    assertValidTerminalReceipt(recovered.receipt);
    assert.equal(effects.filter((boundary) => boundary === crashBoundary).length, 1);
    assert.equal(value.taskPort.closeCalls, 1);
    assert.equal(command(value.root, ['status', '--porcelain']), '');
  });
}

for (const cut of [
  { name: 'intent', matches: (record) => record.boundary === 'candidate_apply' && record.phase === 'intent' },
  { name: 'observed postcondition', matches: (record) =>
    record.boundary === 'candidate_apply' && record.phase === 'observed' },
  { name: 'terminal receipt', matches: (record) => record.kind === 'terminal_receipt' },
]) {
  test(`async journal ${cut.name} response loss recovers from its durable idempotency key`, async (t) => {
    const value = fixture(t);
    const ports = asyncPorts(value, { loseAfterAppend: cut.matches });
    const effects = [];
    await assert.rejects(runFinalizationAsync({
      plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
      taskPort: ports.taskPort, journalPort: ports.journalPort, capabilities: value.capabilities,
      hooks: { beforeEffect(boundary) { effects.push(boundary); } },
    }), /journal response loss/u);
    const recovered = await runFinalizationAsync({
      plan: value.plan, repositoryRoot: value.root, gitExecutable: git,
      taskPort: ports.taskPort, journalPort: ports.journalPort, capabilities: value.capabilities,
      hooks: { beforeEffect(boundary) { effects.push(boundary); } },
    });
    assert.equal(recovered.disposition, 'succeeded');
    assertValidTerminalReceipt(recovered.receipt);
    assert.equal(effects.filter((boundary) => boundary === 'candidate_apply').length, 1);
    const records = await ports.journalPort.read(value.plan.finalizationId);
    assert.equal(records.filter((record) => cut.matches(record)).length, 1);
    assert.equal(value.taskPort.closeCalls, 1);
  });
}
