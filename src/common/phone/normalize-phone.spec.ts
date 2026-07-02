import { normalizePhone } from './normalize-phone';

describe('normalizePhone', () => {
  it('strips formatting and normalizes leading 0 to 62', () => {
    expect(normalizePhone('0812-3456-7890')).toBe('6281234567890');
    expect(normalizePhone('+62 812 3456 7890')).toBe('6281234567890');
  });

  it('normalizes bare 8-prefix numbers to 62', () => {
    expect(normalizePhone('81234567890')).toBe('6281234567890');
  });

  it('keeps numbers that already include country code 62', () => {
    expect(normalizePhone('+62 812 3456 7890')).toBe('6281234567890');
    expect(normalizePhone('6281234567890')).toBe('6281234567890');
  });

  it('returns empty for blank input', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
  });
});
