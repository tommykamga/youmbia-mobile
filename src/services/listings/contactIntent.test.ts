import { beforeEach, expect, it, vi } from 'vitest';
import { recordContactIntent } from './contactIntent';
const m=vi.hoisted(()=>({rpc:vi.fn(),user:vi.fn(),event:vi.fn(),nonce:0,authChange:undefined as undefined|((event:string)=>void)}));
vi.mock('react-native',()=>({Platform:{OS:'ios'}}));
vi.mock('@/lib/supabase',()=>({supabase:{rpc:m.rpc,auth:{getUser:m.user,onAuthStateChange:(cb:(event:string)=>void)=>{m.authChange=cb;}}}}));
vi.mock('@/lib/marketplaceEventId',()=>({marketplaceEventId:()=>`10000000-0000-4000-8000-${String(++m.nonce).padStart(12,'0')}`}));
vi.mock('@/lib/analytics',()=>({getListingViewSource:()=> 'search'}));
vi.mock('@/lib/mixpanel',()=>({trackEvent:m.event}));
const listing={id:'listing',city:'Douala',category_id:7};
beforeEach(()=>{vi.clearAllMocks();m.authChange?.('SIGNED_OUT');m.user.mockResolvedValue({data:{user:{id:'buyer'}},error:null});m.rpc.mockImplementation(async (_name,args)=>({data:args.p_event_id,error:null}));});
it('records intent with minimized dimensions, no phone or message, without claiming delivery',async()=>{
 const r=await recordContactIntent(listing,'whatsapp');expect(r.collected).toBe(true);
 const [name,args]=m.rpc.mock.calls[0];expect(name).toBe('record_v5_contact_intent');
 expect(Object.keys(args).sort()).toEqual(['p_channel','p_entry_point','p_event_id','p_listing_id','p_platform','p_session_key','p_source']);
 expect(m.event).toHaveBeenCalledWith('contact_cta_clicked',expect.objectContaining({measurement:'intent_only',channel:'whatsapp',city:'Douala',category_id:7}));
});
it('coalesces double taps into one event',async()=>{const [a,b]=await Promise.all([recordContactIntent(listing,'call'),recordContactIntent(listing,'call')]);expect(a.eventId).toBe(b.eventId);expect(m.rpc).toHaveBeenCalledTimes(1);});
it('retries an ambiguous transport failure with the same event id',async()=>{
 m.rpc.mockRejectedValueOnce(new Error('network'));const r=await recordContactIntent(listing,'message');expect(r.collected).toBe(true);expect(m.rpc.mock.calls[0][1]).toEqual(m.rpc.mock.calls[1][1]);
});
it('reports a missing backend as uncollected and does not retry permissions/schema errors',async()=>{m.rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'missing'}});expect((await recordContactIntent(listing,'sms')).collected).toBe(false);expect(m.rpc).toHaveBeenCalledTimes(1);});
it('does not claim collection after offline failure',async()=>{m.rpc.mockRejectedValue(new Error('offline'));expect((await recordContactIntent(listing,'call')).collected).toBe(false);expect(m.rpc).toHaveBeenCalledTimes(2);});
it('clears pseudonymous session and event reuse after account changes',async()=>{await recordContactIntent(listing,'call');const a=m.rpc.mock.calls[0][1];m.authChange?.('SIGNED_IN');await recordContactIntent(listing,'call');const b=m.rpc.mock.calls[1][1];expect(b.p_session_key).not.toBe(a.p_session_key);expect(b.p_event_id).not.toBe(a.p_event_id);});
it('drops an in-flight old-session intent before RPC',async()=>{let resolve!: (v:unknown)=>void;m.user.mockReturnValue(new Promise(r=>{resolve=r;}));const work=recordContactIntent(listing,'call');m.authChange?.('SIGNED_OUT');resolve({data:{user:{id:'old'}},error:null});expect((await work).collected).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it('records auth return separately from direct CTA entry',async()=>{await recordContactIntent(listing,'message','auth_return');expect(m.rpc.mock.calls[0][1].p_entry_point).toBe('auth_return');});

it('analytics SDK failure cannot block the canonical journal or contact flow',async()=>{m.event.mockImplementationOnce(()=>{throw new Error('SDK');});expect((await recordContactIntent(listing,'call')).collected).toBe(true);});
