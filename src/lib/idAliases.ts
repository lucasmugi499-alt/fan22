export function canonicalEntityId(id: string, prefix: string, legacyPrefix: string) {
  const match = id.match(new RegExp(`^${legacyPrefix}(\\d+)$`, 'i'));
  return match ? `${prefix}_${match[1].padStart(3, '0')}` : id;
}
