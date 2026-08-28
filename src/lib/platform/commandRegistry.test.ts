import { describe, expect, it } from 'vitest';
import { PLATFORM_COMMANDS, platformCommand, resolvePlatformCommandEndpoint } from './commandRegistry';

describe('platform command registry', () => {
  it('gives every operator command one complete consequence contract', () => {
    expect(PLATFORM_COMMANDS.length).toBeGreaterThan(20);

    for (const command of PLATFORM_COMMANDS) {
      expect(command.id).toBeTruthy();
      expect(command.label).toBeTruthy();
      expect(command.endpoint).toMatch(/^\/api\//);
      expect(command.capability).toBeTruthy();
      expect(['regular', 'consequential', 'governed', 'quiet']).toContain(command.tier);
      expect(command.audit.action).toBeTruthy();
      expect(command.audit.targetCollection).toBeTruthy();
      expect(command.availability).toBeTruthy();

      if (command.tier === 'consequential' || command.tier === 'governed') {
        expect(command.reason).toBe('required');
        expect(command.preview).toBe('server');
      }
      if (command.tier === 'governed') {
        expect(command.confirmation).not.toBe('none');
      }
    }
  });

  it('does not expose sporting truth, capability, or computed-quality writes', () => {
    const forbiddenFields = new Set(['score', 'events', 'event', 'standings', 'statistics', 'dataQuality', 'qualityTier', 'capabilities']);
    for (const command of PLATFORM_COMMANDS) {
      expect(command.inputFields.filter((field) => forbiddenFields.has(field))).toEqual([]);
      expect(command.endpoint).not.toMatch(/^\/api\/(results?|events?|standings?|statistics?)(\/|$)/);
    }
  });
});

describe('command endpoint resolution', () => {
  it('fills path parameters and encodes them', () => {
    const command = platformCommand('integrity.exception.ratify');
    expect(command).not.toBeNull();
    expect(resolvePlatformCommandEndpoint(command!, { exceptionId: 'exc/1' }))
      .toBe('/api/exceptions/exc%2F1/ratify');
  });

  it('refuses to build a URL with an unfilled segment', () => {
    const command = platformCommand('integrity.exception.ratify');
    expect(resolvePlatformCommandEndpoint(command!, {})).toBeNull();
    expect(resolvePlatformCommandEndpoint(command!, { exceptionId: '' })).toBeNull();
  });

  it('leaves a static endpoint untouched', () => {
    const command = platformCommand('network.league.create');
    expect(resolvePlatformCommandEndpoint(command!)).toBe(command!.endpoint);
  });

  it('resolves every registry endpoint once its parameters are supplied', () => {
    for (const command of PLATFORM_COMMANDS) {
      const params = Object.fromEntries(
        [...command.endpoint.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map(([, name]) => [name, 'id_1']),
      );
      expect(resolvePlatformCommandEndpoint(command, params)).not.toBeNull();
    }
  });
});
