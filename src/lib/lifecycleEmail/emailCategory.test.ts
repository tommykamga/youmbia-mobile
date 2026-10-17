import { describe, expect, it } from 'vitest';
import {
  assertLifecycleIsMarketing,
  buildLifecycleResendTags,
  isTransactionalCategory,
  LIFECYCLE_EMAIL_CATEGORY,
} from './emailCategory';

describe('email category separation', () => {
  it('lifecycle est strictement marketing', () => {
    expect(LIFECYCLE_EMAIL_CATEGORY).toBe('marketing');
    expect(() => assertLifecycleIsMarketing('marketing')).not.toThrow();
    expect(() => assertLifecycleIsMarketing('transactional')).toThrow(
      /lifecycle_email_must_be_marketing/
    );
  });

  it('détecte les catégories transactionnelles Auth', () => {
    expect(isTransactionalCategory('magic_link')).toBe(true);
    expect(isTransactionalCategory('password_reset')).toBe(true);
    expect(isTransactionalCategory('otp')).toBe(true);
    expect(isTransactionalCategory('marketing')).toBe(false);
  });

  it('tags Resend n’incluent jamais transactional', () => {
    const tags = buildLifecycleResendTags('welcome_h0');
    expect(tags.some((t) => t.name === 'category' && t.value === 'marketing')).toBe(true);
    expect(tags.some((t) => isTransactionalCategory(t.value))).toBe(false);
  });
});
