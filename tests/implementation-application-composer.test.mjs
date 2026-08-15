import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalDigest } from '../lib/implementation-protocol.mjs';
import { installImplementationCapabilityFixture } from './implementation-capability-fixture.mjs';

installImplementationCapabilityFixture();

const { createOfflineImplementationApplicationComposition,
  isOfflineImplementationApplicationComposition } =
  await import('../lib/implementation-application-composer.mjs');
const { openImplementationLedger } = await import('../lib/implementation-ledger.mjs');
const { issueSourceInstrumentedEffectCapability } =
  await import('../lib/implementation-effect-capability.mjs');

const NOW = '2026-08-15T12:30:00Z';
const digest = (label) => canonicalDigest({ label });
const oid = (character) => character.repeat(40);

function runtimePlan() {
  return {
    command: { command: 'start', taskId: 'T-0054', expectedTaskRevision: 2,
      harness: 'codex', maxConcurrency: 2, shadow: false },
    task: { id: 'T-0054', taskRevision: 2, recordVersion: 8, status: 'active',
      outcome: 'Exercise the shipped offline composition boundary.',
      authority: 'T-0054 revision 2 authorizes offline composition.',
      route: 'initiative', risk: 'critical', gateDigest: digest('gate'), acceptance: [],
      nonGoals: [], assumptions: [], decisions: [], detailDigests: [],
      checkCatalogDigest: digest('checks') },
    activeTaskId: 'T-0054',
    store: { storeId: 'task_store', storeGeneration: digest('store') },
    repository: { rootIdentity: digest('root'), objectFormat: 'sha1', baseCommit: oid('1'),
      head: oid('1'), tree: oid('2'), statusDigest: digest('status'),
      canonicalWorktreeIdentity: digest('worktree') },
    provider: { adapter: 'codex_exec_v1', adapterVersion: '1.0.0', harness: 'codex',
      executableRealpath: '/opt/codex', executableVersion: '0.147.0' },
    controller: { packageName: '@tvald/meta-framework', packageVersion: '1.0.0' },
    policies: { promptRegistry: digest('prompts'), checks: digest('checks'),
      resources: digest('resources') },
    quota: { disposition: 'proceed' }, approvals: { current: true }, observedAt: NOW,
  };
}

function assignmentTemplate() {
  return {
    schemaVersion: 1,
    assignmentId: 'assignment_composed',
    generation: 1,
    sourceDecisionId: null,
    sourceProposalId: null,
    role: 'implementer',
    profileDigest: digest('implementer-profile'),
    goal: 'Remain blocked on an explicit dependency.',
    scope: ['src/composed.mjs'],
    nonGoals: [],
    dependencies: [{ assignmentId: 'assignment_missing', condition: 'gate_pass', generation: 1 }],
    ownership: { writePaths: ['src/composed.mjs'], readPaths: [] },
    resources: [],
    baseCandidateId: 'candidate_base',
    baseTree: oid('2'),
    permissions: { sandbox: 'workspace-write', network: false,
      approvalPolicy: 'never', nestedAgents: false },
    checks: ['check_composed'],
    deadlineAt: '2026-08-15T13:30:00Z',
    restartPolicy: 'never',
  };
}

const unavailable = () => { throw new Error('offline leaf effect must not run'); };

test('shipped offline composer joins ledger, runtime, and application without issuing effects',
  async (t) => {
    const common = await fs.mkdtemp(path.join(os.tmpdir(), 'implementation-composer-'));
    t.after(() => fs.rm(common, { recursive: true, force: true }));
    const ledger = await openImplementationLedger(common, { create: true,
      writeCapability: issueSourceInstrumentedEffectCapability('journal_write') });
    const input = runtimePlan();
    const composition = createOfflineImplementationApplicationComposition({
      ledger,
      taskPort: { async observe() { return { id: input.task.id,
        taskRevision: input.task.taskRevision, recordVersion: input.task.recordVersion,
        status: input.task.status }; } },
      quotaPort: { async observe() { return { disposition: 'proceed' }; } },
      approvalPort: { async observe() { return { current: true }; } },
      providerPort: { observe: unavailable, prepare: unavailable, start: unavailable, wait: unavailable,
        recover: unavailable, interrupt: unavailable },
      processPort: { observe: unavailable, interrupt: unavailable },
      workspacePort: { async observeRepository() {
        return { baseCommit: input.repository.baseCommit, head: input.repository.head,
          tree: input.repository.tree, statusDigest: input.repository.statusDigest };
      }, observe: unavailable,
        allocate: unavailable, prepareIngestion: unavailable, integrationInput: unavailable,
        observeCleanup: unavailable, cleanup: unavailable },
      resourcePort: { observe: unavailable, allocate: unavailable, cleanup: unavailable },
      checkPort: { requirements: unavailable, run: unavailable },
      finalizationPort: { prepare: unavailable, run: unavailable },
      clock: () => NOW,
    });
    assert.equal(isOfflineImplementationApplicationComposition(composition), true);
    assert.equal(composition.mode, 'offline_injected');
    assert.equal(composition.liveActivation, false);
    assert.equal(composition.activationIssuer, false);
    assert.equal(Object.hasOwn(composition, 'authorize'), false);

    const started = await composition.application.start({ runtimePlan: input,
      bootstrapAssignments: [assignmentTemplate()] });
    assert.equal(started.disposition, 'started');
    assert.equal((await composition.application.step({ runId: started.runId })).disposition,
      'waiting');
    assert.equal((await composition.application.doctor(started.runId)).ok, true);
    await composition.application.release(started.runId);
  });

test('offline composer rejects receipt-shaped values in place of an opened ledger', () => {
  for (const ledger of [null, {}, { schemaVersion: 1, effectKind: 'journal_write' }]) {
    assert.throws(() => createOfflineImplementationApplicationComposition({ ledger }),
      (error) => error.code === 'COMPOSITION_INPUT_INVALID');
  }
});
