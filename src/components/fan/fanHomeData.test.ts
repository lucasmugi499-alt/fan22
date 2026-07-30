import { describe, expect, it } from 'vitest';
import { investorDemo } from '@/data/investorDemo';
import { FAN_HOME_RECORD_LIMIT } from './fanHomeData';

describe('fan homepage data window', () => {
  it('loads enough matches to build active tables for every canonical demo league', () => {
    expect(FAN_HOME_RECORD_LIMIT).toBeGreaterThanOrEqual(investorDemo.matches.length);
  });
});
