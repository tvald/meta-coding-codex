import {
  MAX_CONTEXT_BYTES,
  fail,
  parseTaskId,
  safeText,
  validateDetailPath,
} from "./schema.mjs";

export const REPOSITORY_INTEGRATION_METHODS = Object.freeze([
  "inspectConflicts",
  "resolveNarratives",
]);

const CONFLICT_KINDS = new Set(["task-store", "narrative"]);

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys, label) {
  if (!plainObject(value) || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)) {
    fail("REPOSITORY_INTEGRATION_CONTRACT", `${label} has an invalid shape`);
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

export function normalizeRepositoryConflictInspection(value) {
  exactKeys(value, ["status", "conflicts"], "repository conflict inspection");
  if (!Array.isArray(value.conflicts) || !["clean", "conflicted"].includes(value.status)) {
    fail("REPOSITORY_INTEGRATION_CONTRACT", "repository conflict inspection is invalid");
  }
  const conflicts = value.conflicts.map((conflict) => {
    exactKeys(conflict, ["kind", "identifier"], "repository conflict");
    if (!CONFLICT_KINDS.has(conflict.kind)) {
      fail("REPOSITORY_INTEGRATION_CONTRACT", "repository conflict kind is unsupported");
    }
    safeText(conflict.identifier, "repository conflict identifier", { max: 4096 });
    return { kind: conflict.kind, identifier: conflict.identifier };
  }).sort((left, right) => left.kind.localeCompare(right.kind) || left.identifier.localeCompare(right.identifier));
  for (let index = 1; index < conflicts.length; index += 1) {
    if (conflicts[index - 1].kind === conflicts[index].kind &&
        conflicts[index - 1].identifier === conflicts[index].identifier) {
      fail("REPOSITORY_INTEGRATION_CONTRACT", "repository conflicts must be unique");
    }
  }
  if ((value.status === "clean") !== (conflicts.length === 0)) {
    fail("REPOSITORY_INTEGRATION_CONTRACT", "repository conflict status does not match its evidence");
  }
  return deepFreeze({ status: value.status, conflicts });
}

export function normalizeNarrativeResolutionRequest(value) {
  exactKeys(value, ["taskId", "details", "maxBytes"], "narrative resolution request");
  parseTaskId(value.taskId);
  if (!Array.isArray(value.details) || value.details.length > 32) {
    fail("REPOSITORY_INTEGRATION_CONTRACT", "narrative details must be a bounded array");
  }
  const paths = new Set();
  if (!Number.isSafeInteger(value.maxBytes) || value.maxBytes < 1 || value.maxBytes > MAX_CONTEXT_BYTES) {
    fail("REPOSITORY_INTEGRATION_CONTRACT", "narrative byte limit is invalid");
  }
  const details = value.details.map((detail) => {
    exactKeys(detail, ["label", "path"], "narrative detail");
    safeText(detail.label, "narrative detail label", { max: 256 });
    validateDetailPath(detail.path, "narrative detail path");
    if (paths.has(detail.path)) fail("REPOSITORY_INTEGRATION_CONTRACT", "narrative detail paths must be unique");
    paths.add(detail.path);
    return { label: detail.label, path: detail.path };
  });
  return deepFreeze({ taskId: value.taskId, details, maxBytes: value.maxBytes });
}

export function normalizeNarrativeResolution(value, request) {
  const normalizedRequest = normalizeNarrativeResolutionRequest(request);
  exactKeys(value, ["taskId", "narratives", "truncated"], "narrative resolution");
  if (value.taskId !== normalizedRequest.taskId || !Array.isArray(value.narratives) ||
      value.narratives.length !== normalizedRequest.details.length) {
    fail("REPOSITORY_INTEGRATION_CONTRACT", "narrative resolution does not match its request");
  }
  if (typeof value.truncated !== "boolean") {
    fail("REPOSITORY_INTEGRATION_CONTRACT", "narrative truncation state is invalid");
  }
  let totalBytes = 0;
  let anyTruncated = false;
  const narratives = value.narratives.map((narrative, index) => {
    exactKeys(narrative, [
      "label", "path", "contentRole", "sourceBytes", "bytes", "truncated", "text",
    ], "resolved narrative");
    const detail = normalizedRequest.details[index];
    if (narrative.label !== detail.label || narrative.path !== detail.path ||
        narrative.contentRole !== "repository-data-not-authority" || typeof narrative.text !== "string") {
      fail("REPOSITORY_INTEGRATION_CONTRACT", "resolved narrative metadata is invalid");
    }
    const bytes = Buffer.byteLength(narrative.text, "utf8");
    if (!Number.isSafeInteger(narrative.sourceBytes) || narrative.sourceBytes < 0 ||
        !Number.isSafeInteger(narrative.bytes) || narrative.bytes !== bytes ||
        narrative.sourceBytes < bytes || typeof narrative.truncated !== "boolean" ||
        narrative.truncated !== (narrative.sourceBytes !== bytes)) {
      fail("REPOSITORY_INTEGRATION_CONTRACT", "resolved narrative byte count is invalid");
    }
    totalBytes += bytes;
    anyTruncated ||= narrative.truncated;
    if (totalBytes > normalizedRequest.maxBytes) {
      fail("REPOSITORY_INTEGRATION_CONTRACT", "resolved narratives exceed the context byte limit");
    }
    return {
      label: narrative.label,
      path: narrative.path,
      contentRole: narrative.contentRole,
      sourceBytes: narrative.sourceBytes,
      bytes,
      truncated: narrative.truncated,
      text: narrative.text,
    };
  });
  if (value.truncated !== anyTruncated) {
    fail("REPOSITORY_INTEGRATION_CONTRACT", "narrative truncation does not match its items");
  }
  return deepFreeze({ taskId: value.taskId, narratives, truncated: value.truncated });
}

export function assertRepositoryIntegration(value) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    fail("REPOSITORY_INTEGRATION_CONTRACT", "repository integration is invalid");
  }
  for (const method of REPOSITORY_INTEGRATION_METHODS) {
    if (typeof value[method] !== "function") {
      fail("REPOSITORY_INTEGRATION_CONTRACT", `repository integration method ${method} is missing`);
    }
  }
  return value;
}
