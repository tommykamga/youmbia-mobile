import { describe, expect, it } from 'vitest';
import { getYoumbiaMobileScheme } from './appScheme';

describe('YOUMBIA app URL schemes', () => {
  it('uses separate schemes for development and QA preview while preserving production', () => {
    expect(getYoumbiaMobileScheme('development')).toBe('youmbiamobile-dev');
    expect(getYoumbiaMobileScheme('preview')).toBe('youmbiamobile-qa');
    expect(getYoumbiaMobileScheme('production')).toBe('youmbiamobile');
  });
});
