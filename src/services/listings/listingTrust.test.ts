import { beforeEach, expect, it, vi } from 'vitest';
import { getListingAvailability, declareListingAvailability, verifiedSubject, availabilityLabel, withShopVerification } from './listingTrust';
import { shouldShowVerifiedShopBadge, shouldShowProSellerBadge } from '@/lib/shopSeller';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabase:{rpc:m.rpc}}));
beforeEach(()=>{m.rpc.mockReset();});
it('missing backend is unknown, never implicitly available or verified',async()=>{m.rpc.mockRejectedValue(new Error('missing'));expect((await getListingAvailability('id')).state).toBe('unknown');expect(await verifiedSubject('profile','id')).toBe(false);});
it('uses only an explicit boolean server verification receipt',async()=>{m.rpc.mockResolvedValue({data:true,error:null});expect(await verifiedSubject('profile','id')).toBe(true);m.rpc.mockResolvedValue({data:true,error:{message:'denied'}});expect(await verifiedSubject('profile','id')).toBe(false);});
it('preserves an explicit available declaration and its timestamp',async()=>{m.rpc.mockResolvedValue({data:[{state:'available',confirmed_at:'2026-11-01T00:00:00Z'}],error:null});expect(await getListingAvailability('id')).toEqual({state:'available',confirmed_at:'2026-11-01T00:00:00Z'});});
it('requires a confirmed mutation and sends expected status',async()=>{m.rpc.mockResolvedValue({data:null,error:null});expect(await declareListingAvailability('id','available','active')).toBe(false);expect(m.rpc).toHaveBeenCalledWith('declare_v5_listing_availability',{p_listing_id:'id',p_state:'available',p_expected_status:'active'});});
it('distinguishes sold, unknown, and dated declarations',()=>{expect(availabilityLabel({state:'sold',confirmed_at:null})).toContain('déclarée');expect(availabilityLabel({state:'unknown',confirmed_at:null})).toContain('non confirmée');expect(availabilityLabel({state:'available',confirmed_at:'2026-11-01'})).toContain('déclarée le');});
it('Pro is declared seller type, separate from identity proof',()=>{expect(shouldShowProSellerBadge({sellerType:'pro'})).toBe(true);expect(shouldShowVerifiedShopBadge({is_verified:true})).toBe(false);expect(shouldShowVerifiedShopBadge({is_verified:true,verification_proven:true})).toBe(true);});

it('loads proof receipts in one bounded shop request and defaults missing receipts to false',async()=>{
 m.rpc.mockResolvedValue({data:[{subject_id:'a',verification_proven:true}],error:null});
 expect(await withShopVerification([{id:'a'},{id:'b'}])).toEqual([{id:'a',verification_proven:true},{id:'b',verification_proven:false}]);
 expect(m.rpc).toHaveBeenCalledTimes(1);
});
