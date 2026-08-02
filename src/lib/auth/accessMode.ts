export type AccessEngineMode = 'legacy' | 'compare' | 'assignments';

const accessEngineModes = new Set<AccessEngineMode>(['legacy', 'compare', 'assignments']);

export function accessEngineMode(value = process.env.GOALPLACE_ACCESS_ENGINE_MODE): AccessEngineMode {
  return accessEngineModes.has(value as AccessEngineMode) ? value as AccessEngineMode : 'compare';
}

export function returnsLegacyProjection(mode: AccessEngineMode) {
  return mode === 'legacy' || mode === 'compare';
}
