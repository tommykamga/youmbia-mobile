import { describe, expect, it } from 'vitest';
import {
  assertLifecycleCategoryAllowed,
  assertLifecycleIsMarketing,
  buildLifecycleResendTags,
  isTransactionalCategory,
  LIFECYCLE_EMAIL_CATEGORY_MARKETING,
  LIFECYCLE_EMAIL_CATEGORY_SERVICE,
  resolveLifecycleEmailCategory,
} from './emailCategory';

describe('email category separation service vs marketing', () => {
  it('résout le canal par campagne', () => {
    expect(resolveLifecycleEmailCategory('welcome_h0')).toBe(
      LIFECYCLE_EMAIL_CATEGORY_SERVICE
    );
    expect(resolveLifecycleEmailCategory('first_listing_h24')).toBe(
      LIFECYCLE_EMAIL_CATEGORY_MARKETING
    );
    expect(resolveLifecycleEmailCategory('abandoned_draft_h24')).toBe(
      LIFECYCLE_EMAIL_CATEGORY_MARKETING
    );
  });

  it('autorise service et marketing ; refuse Auth', () => {
    expect(() => assertLifecycleCategoryAllowed('service')).not.toThrow();
    expect(() => assertLifecycleCategoryAllowed('marketing')).not.toThrow();
    expect(() => assertLifecycleIsMarketing('marketing')).not.toThrow();
    expect(() => assertLifecycleIsMarketing('service')).toThrow(
      /lifecycle_email_must_be_marketing/
    );
    expect(() => assertLifecycleCategoryAllowed('magic_link')).toThrow();
  });

  it('détecte les catégories transactionnelles Auth', () => {
    expect(isTransactionalCategory('magic_link')).toBe(true);
    expect(isTransactionalCategory('password_reset')).toBe(true);
    expect(isTransactionalCategory('otp')).toBe(true);
    expect(isTransactionalCategory('marketing')).toBe(false);
    expect(isTransactionalCategory('service')).toBe(false);
  });

  it('tags Resend : welcome=service ; first_listing=marketing ; jamais Auth', () => {
    const welcome = buildLifecycleResendTags('welcome_h0');
    expect(welcome.some((t) => t.name === 'category' && t.value === 'service')).toBe(
      true
    );
    const listing = buildLifecycleResendTags('first_listing_h24');
    expect(
      listing.some((t) => t.name === 'category' && t.value === 'marketing')
    ).toBe(true);
    expect(welcome.some((t) => isTransactionalCategory(t.value))).toBe(false);
  });
});
