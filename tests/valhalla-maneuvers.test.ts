import { describe, it, expect } from 'vitest';
import { valhallaTypeToOsrm } from '@/lib/valhalla-maneuvers';

describe('valhallaTypeToOsrm', () => {
  it('maps turns to the right direction (not U-turns)', () => {
    // From a live trip: 10 "Turn right onto Spring Garden Street", 9 "Bear right onto Lancaster Avenue", 15 "Turn left onto Chestnut Street"
    expect(valhallaTypeToOsrm(10)).toEqual({ type: 'turn', modifier: 'right' });
    expect(valhallaTypeToOsrm(9)).toEqual({ type: 'turn', modifier: 'slight right' });
    expect(valhallaTypeToOsrm(15)).toEqual({ type: 'turn', modifier: 'left' });
    expect(valhallaTypeToOsrm(14)).toEqual({ type: 'turn', modifier: 'sharp left' });
  });

  it('only reports U-turns for U-turn maneuvers', () => {
    const uturns = Array.from({ length: 40 }, (_, i) => i).filter((t) => valhallaTypeToOsrm(t).modifier === 'uturn');
    expect(uturns).toEqual([12, 13]);
  });

  it('maps start and destination', () => {
    expect(valhallaTypeToOsrm(1).type).toBe('depart');
    expect(valhallaTypeToOsrm(4).type).toBe('arrive');
    expect(valhallaTypeToOsrm(6)).toEqual({ type: 'arrive', modifier: 'left' });
  });

  it('maps ramps, exits and keep-left/right', () => {
    expect(valhallaTypeToOsrm(17).type).toBe('on ramp');
    expect(valhallaTypeToOsrm(20)).toEqual({ type: 'off ramp', modifier: 'right' });
    expect(valhallaTypeToOsrm(24)).toEqual({ type: 'fork', modifier: 'slight left' });
  });

  it('falls back to continue for unknown types', () => {
    expect(valhallaTypeToOsrm(99)).toEqual({ type: 'continue', modifier: '' });
  });
});
