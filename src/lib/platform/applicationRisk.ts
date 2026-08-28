export type ApplicationRiskLevel = 'low' | 'medium' | 'high';

export type ApplicationRiskCandidate = {
  id: string;
  kind: 'league' | 'application';
  title: string;
  city?: string;
  status?: string;
  applicantEmail?: string;
};

export type ApplicationRiskComparison = Omit<ApplicationRiskCandidate, 'applicantEmail'> & {
  score: number;
  reason: string;
};

export type ApplicationRiskAssessment = {
  riskLevel: ApplicationRiskLevel;
  riskFlags: string[];
  duplicateCandidates: ApplicationRiskComparison[];
};

type ApplicationInput = {
  applicantEmail: string;
  applicantPhone?: string;
  leagueName: string;
  city: string;
  evidenceNote: string;
};

export function normalizeApplicationIdentity(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function similarity(left: string, right: string) {
  const leftTokens = new Set(normalizeApplicationIdentity(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeApplicationIdentity(right).split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

/**
 * Deterministic intake signals only. They route a human review; they never decide an
 * application or grant authority.
 */
export function assessApplicationRisk(input: {
  application: ApplicationInput;
  candidates: ApplicationRiskCandidate[];
}): ApplicationRiskAssessment {
  const normalizedName = normalizeApplicationIdentity(input.application.leagueName);
  const normalizedEmail = input.application.applicantEmail.trim().toLowerCase();
  const normalizedCity = normalizeApplicationIdentity(input.application.city);
  const flags = new Set<string>();
  const comparisons: ApplicationRiskComparison[] = [];

  for (const candidate of input.candidates) {
    const sameName = normalizeApplicationIdentity(candidate.title) === normalizedName;
    const sameEmail = candidate.kind === 'application'
      && candidate.applicantEmail?.trim().toLowerCase() === normalizedEmail;
    const closeName = similarity(candidate.title, input.application.leagueName) >= 0.75;
    const sameCity = candidate.city ? normalizeApplicationIdentity(candidate.city) === normalizedCity : false;

    let score = 0;
    let reason = '';
    if (sameName) {
      flags.add('duplicate_league_name');
      score = 100;
      reason = 'Exact normalized league name';
    } else if (sameEmail) {
      flags.add('duplicate_applicant_email');
      score = 95;
      reason = 'Same applicant email';
    } else if (closeName && sameCity) {
      flags.add('similar_league_same_city');
      score = 75;
      reason = 'Similar league name in the same city';
    }
    if (sameEmail) flags.add('duplicate_applicant_email');
    if (score) {
      comparisons.push({
        id: candidate.id,
        kind: candidate.kind,
        title: candidate.title,
        ...(candidate.city ? { city: candidate.city } : {}),
        ...(candidate.status ? { status: candidate.status } : {}),
        score,
        reason,
      });
    }
  }

  comparisons.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const riskLevel: ApplicationRiskLevel = flags.has('duplicate_league_name')
    ? 'high'
    : flags.size ? 'medium' : 'low';
  return { riskLevel, riskFlags: [...flags].sort(), duplicateCandidates: comparisons };
}
