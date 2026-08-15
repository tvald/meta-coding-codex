export const IMPLEMENTATION_PROTECTED_EFFECT_KINDS = Object.freeze([
  'cleanup',
  'journal_write',
  'provider_launch',
  'signal',
  'workspace_write',
]);

const PROTECTED_EFFECT_CAPABILITIES = new WeakMap();

export class ImplementationEffectCapabilityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImplementationEffectCapabilityError';
    this.code = code;
  }
}

export function assertImplementationEffectCapability(capability, effectKind) {
  if (!IMPLEMENTATION_PROTECTED_EFFECT_KINDS.includes(effectKind)) {
    throw new ImplementationEffectCapabilityError('EFFECT_KIND_INVALID',
      'implementation protected effect kind is invalid');
  }
  const protectedEffect = capability !== null &&
    (typeof capability === 'object' || typeof capability === 'function')
    ? PROTECTED_EFFECT_CAPABILITIES.get(capability)
    : undefined;
  if (protectedEffect?.effectKind !== effectKind) {
    throw new ImplementationEffectCapabilityError('ACTIVATION_DENIED',
      'implementation protected effect capability is absent or invalid');
  }
  return capability;
}
