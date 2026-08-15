import * as moduleApi from 'node:module';

const targetUrls = Object.freeze({
  git: new URL('../lib/implementation-git.mjs', import.meta.url).href,
  effect: new URL('../lib/implementation-effect-capability.mjs', import.meta.url).href,
});
let loaderTargetUrls = null;
let installed = false;

/**
 * Installs source-only instrumentation before dynamically importing the destructive
 * implementation modules. The injected issuer is absent from both source and packed
 * package namespaces; it exists only in this test process's transformed module.
 */
export function installImplementationCapabilityFixture() {
  if (installed) return;
  if (typeof moduleApi.registerHooks === 'function') {
    moduleApi.registerHooks({ load: instrumentImplementationGit });
  } else {
    moduleApi.register(import.meta.url, {
      parentURL: import.meta.url,
      data: { targetUrls },
    });
  }
  installed = true;
}

export function initialize({ targetUrls: initializedTargetUrls }) {
  loaderTargetUrls = initializedTargetUrls;
}

function instrumentLoadedModule(url, loaded, expectedTargetUrls) {
  if (!Object.values(expectedTargetUrls).includes(url)) return loaded;
  if (loaded.format !== 'module' || loaded.source === null || loaded.source === undefined) {
    throw new Error('implementation Git test fixture could not instrument the source module');
  }
  const source = Buffer.isBuffer(loaded.source) ? loaded.source.toString('utf8') : String(loaded.source);
  const instrumentation = url === expectedTargetUrls.git ? `${source}\n
export function issueSourceInstrumentedTestCapability(effectKind) {
  const capability = Object.freeze(Object.create(null));
  PROTECTED_CAPABILITIES.set(capability, Object.freeze({ effectKind }));
  return capability;
}\n` : `${source}\n
export function issueSourceInstrumentedEffectCapability(effectKind) {
  const capability = Object.freeze(Object.create(null));
  PROTECTED_EFFECT_CAPABILITIES.set(capability, Object.freeze({ effectKind }));
  return capability;
}\n`;
  return {
    ...loaded,
    source: instrumentation,
  };
}

function instrumentImplementationGit(url, context, nextLoad) {
  return instrumentLoadedModule(url, nextLoad(url, context), targetUrls);
}

export async function load(url, context, nextLoad) {
  return instrumentLoadedModule(url, await nextLoad(url, context), loaderTargetUrls);
}
