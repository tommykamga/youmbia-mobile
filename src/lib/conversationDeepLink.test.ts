import { expect, it } from 'vitest';
import { conversationHref } from './conversationDeepLink';
it('retains the historical UUID conversation route',()=>{expect(conversationHref('10000000-0000-4000-8000-000000000001')).toBe('/conversation/10000000-0000-4000-8000-000000000001');});
it.each(['../account','a/b','%2e%2e','https://example.test','', 'id?redirect=account'])('rejects malformed conversation target %s', id=>{expect(conversationHref(id)).toBeNull();});
