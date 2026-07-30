export function isFantasyFanRole(
  claimRole: unknown,
  profileRole: unknown,
): boolean {
  const trustedRole = typeof claimRole === 'string' ? claimRole : profileRole;
  return trustedRole === 'fan';
}
