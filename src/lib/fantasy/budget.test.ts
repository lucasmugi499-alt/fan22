import { describe, expect, it } from 'vitest';
import { budgetApplies, displayBudget, fantasyBudgetMode } from './budget';

const RULES = { budgetCredits: 100 };

describe('fantasy budget mode', () => {
  it('treats an unset mode as credits, so priced competitions keep their constraint', () => {
    expect(fantasyBudgetMode({})).toBe('credits');
    expect(fantasyBudgetMode(undefined)).toBe('credits');
    expect(fantasyBudgetMode(null)).toBe('credits');
    expect(budgetApplies({})).toBe(true);
  });

  it('reads an explicit budget-free competition', () => {
    expect(fantasyBudgetMode({ budgetMode: 'budget_free' })).toBe('budget_free');
    expect(budgetApplies({ budgetMode: 'budget_free' })).toBe(false);
  });

  it('has no budget to display when there is no budget', () => {
    expect(displayBudget({ budgetMode: 'budget_free' }, RULES)).toBeNull();
    expect(displayBudget({ budgetMode: 'credits' }, RULES)).toBe(100);
  });
});
