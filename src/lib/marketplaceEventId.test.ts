import { expect, it, vi } from 'vitest';
import { marketplaceEventId } from './marketplaceEventId';
vi.mock('react-native-get-random-values',()=>({}));
it('creates distinct UUID v4 event and session identifiers',()=>{const a=marketplaceEventId(),b=marketplaceEventId();expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);expect(a).not.toBe(b);});
