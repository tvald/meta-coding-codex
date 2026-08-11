import path from 'node:path';

function isClientBin(entry) {
  if (entry === '') return true;
  const normalized = path.normalize(entry);
  const parts = normalized.split(path.sep);
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (parts[index] === 'node_modules' && parts[index + 1] === '.bin') return true;
  }
  return false;
}

export function gitSubprocessEnvironment(environment = process.env) {
  const sanitized = {};
  for (const [name, value] of Object.entries(environment)) {
    if (name.startsWith('GIT_') || name === 'PATH') continue;
    sanitized[name] = value;
  }
  sanitized.PATH = (environment.PATH ?? '').split(path.delimiter)
    .filter((entry) => !isClientBin(entry))
    .join(path.delimiter);
  sanitized.GIT_TERMINAL_PROMPT = '0';
  sanitized.GIT_OPTIONAL_LOCKS = '0';
  return sanitized;
}
