export function isFantasyFanRole(
  claimRole: unknown,
  profileRole: unknown,
  claimAccountClass?: unknown,
  profileAccountClass?: unknown,
): boolean {
  const trustedRole = typeof claimRole === 'string' ? claimRole : profileRole;
  const trustedAccountClass = typeof claimAccountClass === 'string'
    ? claimAccountClass
    : profileAccountClass;
  return trustedRole === 'fan'
    && (trustedAccountClass === undefined || trustedAccountClass === 'fan');
}
