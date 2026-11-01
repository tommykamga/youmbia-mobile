import { beforeEach, expect, it, vi } from 'vitest';
import { getPublicListings } from './getPublicListings';
const m=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),orders:[] as string[],ranges:[] as number[][]}));
vi.mock('@/lib/supabase',()=>({supabase:{rpc:m.rpc,from:m.from}}));
vi.mock('@/lib/listingImageUrl',()=>({getSignedUrlsMap:async()=>new Map(),listingStoragePathsForCardCover:()=>[],mapListingCardImages:()=>[],toDisplayImageUrl:()=>''}));
beforeEach(()=>{vi.clearAllMocks();m.orders=[];m.ranges=[];
 m.from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,in:()=>Promise.resolve({data:[row('b'),row('a')],error:null}),order:(key:string)=>{m.orders.push(key);return q;},range:(a:number,b:number)=>{m.ranges.push([a,b]);return Promise.resolve({data:[],error:null});}};return q;});
});
function row(id:string){return {id,title:id,price:1,city:'Douala',created_at:'2026-01-01',updated_at:'2026-01-01',user_id:null,listing_images:[]};}
it('hydrates in RPC order instead of hydration order and forwards pagination',async()=>{
 m.rpc.mockResolvedValue({data:[{listing_id:'a',rank_position:21},{listing_id:'b',rank_position:22}],error:null});
 const r=await getPublicListings(20,2);expect(r.data?.map(x=>x.id)).toEqual(['a','b']);
 expect(m.rpc).toHaveBeenCalledWith('get_v5_discovery_listing_ids',{p_offset:20,p_limit:2});expect(m.orders).toEqual([]);
});
it('returns exhausted pages without hydration',async()=>{m.rpc.mockResolvedValue({data:[],error:null});expect((await getPublicListings()).data).toEqual([]);expect(m.from).toHaveBeenCalledTimes(1);});
for(const code of ['PGRST202','42883'])it(`falls back only for absent RPC: ${code}`,async()=>{
 m.rpc.mockResolvedValue({data:null,error:{code,message:'missing'}});expect((await getPublicListings(6,6)).error).toBeNull();expect(m.ranges).toEqual([[6,11]]);expect(m.orders).toEqual(['last_published_at']);
});
it('never bypasses permission errors with legacy fallback',async()=>{m.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'denied'}});expect((await getPublicListings()).error?.message).toBe('denied');expect(m.from).not.toHaveBeenCalled();});
it('rejects an invalid RPC response',async()=>{m.rpc.mockResolvedValue({data:null,error:null});expect((await getPublicListings()).error).not.toBeNull();});
