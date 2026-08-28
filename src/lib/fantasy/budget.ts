import type { FantasyBudgetMode, FantasyCompetition, FantasySquadRules } from '@/types/fantasy';

/**
 * The budget mode a competition runs under.
 *
 * Absent means `credits`, because every competition record written before budget-free
 * existed was priced. Defaulting the other way would silently drop the price constraint
 * from a competition whose squads were built under it, which changes an already-played
 * game rather than enabling a new one.
 */
export function fantasyBudgetMode(
  competition: Pick<FantasyCompetition, 'budgetMode'> | null | undefined,
): FantasyBudgetMode {
  return competition?.budgetMode === 'budget_free' ? 'budget_free' : 'credits';
}

/** Whether squad selection is constrained by credits at all. */
export function budgetApplies(
  competition: Pick<FantasyCompetition, 'budgetMode'> | null | undefined,
): boolean {
  return fantasyBudgetMode(competition) === 'credits';
}

/**
 * The budget shown to a manager, or null when there is none to show.
 *
 * A budget-free game must not display "0 credits left", which reads as a broken game rather
 * than an absent constraint.
 */
export function displayBudget(
  competition: Pick<FantasyCompetition, 'budgetMode'> | null | undefined,
  rules: Pick<FantasySquadRules, 'budgetCredits'>,
): number | null {
  return budgetApplies(competition) ? rules.budgetCredits : null;
}
