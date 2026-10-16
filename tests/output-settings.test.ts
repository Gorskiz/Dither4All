import { describe, it, expect } from 'vitest';
import { validateOutput } from '../src/output-settings';
const valid = {
  format: 'png',
  size: 'custom',
  width: '800',
  height: '600',
  quality: '94',
  motionFormat: 'gif',
  motionSize: '480',
  audio: true,
};
describe('portable output settings', () => {
  it('accepts older projects without output preferences and validates newer ones', () => {
    expect(validateOutput(undefined)).toBeUndefined();
    expect(validateOutput(valid)).toEqual(valid);
  });
  it('rejects unknown formats and invalid output dimensions or quality', () => {
    for (const patch of [
      { format: 'exe' },
      { size: '0' },
      { width: 'Infinity' },
      { height: '8193' },
      { width: '0' },
      { width: '42.5' },
      { quality: '101' },
      { audio: 'true' },
    ])
      expect(() => validateOutput({ ...valid, ...patch })).toThrow();
  });
});
