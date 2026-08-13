import {
  MAX_RECORDS,
  MAX_TOTAL_DEPENDENCIES,
  fail,
  formatTaskId,
  parseTaskId,
  validateControl,
  validateTask,
} from "./schema.mjs";

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function compareTaskIds(left, right) {
  return parseTaskId(left) - parseTaskId(right);
}

function highestTaskNumber(tasks) {
  let highest = 0;
  for (const id of tasks.keys()) highest = Math.max(highest, parseTaskId(id));
  return highest;
}

export function nextTaskId(tasks) {
  if (!(tasks instanceof Map)) fail("STATE_INVALID", "task collection must be a Map");
  return formatTaskId(highestTaskNumber(tasks) + 1);
}

function detectCycle(tasks) {
  const state = new Map();
  for (const start of tasks.keys()) {
    if (state.get(start) === 2) continue;
    state.set(start, 1);
    const stack = [{ id: start, index: 0 }];
    while (stack.length > 0) {
      const frame = stack.at(-1);
      const dependencies = tasks.get(frame.id).dependencies;
      if (frame.index >= dependencies.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const dependency = dependencies[frame.index];
      frame.index += 1;
      const dependencyState = state.get(dependency) ?? 0;
      if (dependencyState === 1) fail("DEPENDENCY_CYCLE", "task dependency graph contains a cycle");
      if (dependencyState === 2) continue;
      state.set(dependency, 1);
      stack.push({ id: dependency, index: 0 });
    }
  }
}

export function buildDependencyIndexes(tasks) {
  const ancestors = new Map();
  const dependents = new Map([...tasks.keys()].map((id) => [id, []]));
  for (const [id, task] of tasks) {
    ancestors.set(id, task.dependencies);
    for (const dependency of task.dependencies) dependents.get(dependency)?.push(id);
  }
  return { ancestors, dependents };
}

export function validateState(control, tasks) {
  validateControl(control);
  if (!(tasks instanceof Map) || tasks.size > MAX_RECORDS) {
    fail("STORE_SIZE", "task store exceeds its supported record count");
  }
  let activeCount = 0;
  let dependencyCount = 0;
  for (const [id, task] of tasks) {
    validateTask(task);
    if (id !== task.id) fail("TASK_ID_MISMATCH", "task map key differs from record ID");
    if (task.status === "active") activeCount += 1;
    dependencyCount += task.dependencies.length;
    if (dependencyCount > MAX_TOTAL_DEPENDENCIES) {
      fail("STORE_SIZE", "task store exceeds its supported dependency count");
    }
    for (const dependency of task.dependencies) {
      if (!tasks.has(dependency)) fail("DEPENDENCY_MISSING", "task dependency does not exist");
      if ((task.status === "ready" || task.status === "active") && tasks.get(dependency).status !== "done") {
        fail("STATE_INVALID", "Ready and Active tasks require every dependency to be Done");
      }
    }
  }
  if (activeCount > 1) fail("STATE_INVALID", "more than one task is Active");
  if (control.pause !== null && activeCount !== 0) {
    fail("STATE_INVALID", "paused scheduling cannot retain an Active task");
  }
  detectCycle(tasks);
}

export function semanticProjection(task) {
  return {
    outcome: task.outcome,
    authority: task.authority,
    dependencies: task.dependencies,
    route: task.route,
    risk: task.risk,
    tags: task.tags,
    details: task.details,
  };
}

function unresolvedApproval(gate) {
  return gate.kind === "approval" && gate.status !== "granted";
}

function approvalScope(gate) {
  if (gate.kind !== "approval") return null;
  return {
    id: gate.id,
    source: gate.source,
    action: gate.action,
    boundary: gate.boundary,
    detailPath: gate.detailPath,
  };
}

export function validateTaskTransition(current, next) {
  validateTask(current);
  validateTask(next);
  if (next.taskRevision !== current.taskRevision && next.taskRevision !== current.taskRevision + 1) {
    fail("TRANSITION_INVALID", "taskRevision must remain unchanged or increment exactly once");
  }
  const semanticChanged = !equalJson(semanticProjection(current), semanticProjection(next));
  if (semanticChanged && next.taskRevision !== current.taskRevision + 1) {
    fail("TRANSITION_INVALID", "semantic task changes must increment taskRevision once");
  }
  if (!semanticChanged && next.taskRevision !== current.taskRevision) {
    fail("TRANSITION_INVALID", "taskRevision cannot change without a semantic task change");
  }
  if (next.taskRevision === current.taskRevision + 1 &&
      (next.status !== "pending" || next.gate.kind !== "none" || next.completion !== null)) {
    fail("TRANSITION_INVALID", "semantic amendments must reset the task to Pending with no gate or completion");
  }
  if (!equalJson(current.dependencies, next.dependencies) && current.status === "active") {
    fail("TRANSITION_INVALID", "dependencies cannot be changed while a task is Active");
  }
  if (next.status === "needs_verification" &&
      current.status !== "active" && current.status !== "needs_verification") {
    fail("TRANSITION_INVALID", "Needs verification can only be entered from Active");
  }
  if (next.status === "active" &&
      current.status !== "ready" && current.status !== "needs_verification") {
    fail("TRANSITION_INVALID", "Active can only be entered from Ready or Needs verification");
  }
  if (current.gate.kind === "approval" && next.taskRevision === current.taskRevision &&
      next.gate.kind !== "approval") {
    fail("TRANSITION_INVALID", "checkpointing or closing cannot erase approval evidence");
  }
  if (current.gate.kind === "approval" && next.gate.kind === "approval" &&
      next.taskRevision === current.taskRevision &&
      !equalJson(approvalScope(current.gate), approvalScope(next.gate))) {
    fail("TRANSITION_INVALID", "approval identity and boundary are immutable within a task revision");
  }
  if ((next.status === "cancelled" || next.status === "superseded") &&
      (unresolvedApproval(current.gate) || current.gate.kind === "blocker") &&
      !equalJson(current.gate, next.gate)) {
    fail("TRANSITION_INVALID", "Cancelled and Superseded tasks must retain unresolved gate evidence");
  }
  if (next.status === "done" && unresolvedApproval(current.gate)) {
    fail("TRANSITION_INVALID", "Done cannot bypass an unresolved approval");
  }
}

export function activeTask(tasks) {
  if (!(tasks instanceof Map)) fail("STATE_INVALID", "task collection must be a Map");
  return [...tasks.values()].find((task) => task.status === "active") ?? null;
}

export function taskIsCandidate(task, snapshot) {
  const gateSatisfied = task.gate.kind === "none" ||
    (task.gate.kind === "approval" && task.gate.status === "granted" &&
      task.gate.boundTaskRevision === task.taskRevision &&
      typeof task.gate.id === "string" && typeof task.gate.source === "string" &&
      typeof task.gate.action === "string" && typeof task.gate.boundary === "string" &&
      typeof task.gate.detailPath === "string");
  return snapshot.control.pause === null && task.status === "ready" &&
    task.route !== "unrouted" && task.risk !== null && gateSatisfied &&
    task.dependencies.every((id) => snapshot.tasks.get(id)?.status === "done");
}
