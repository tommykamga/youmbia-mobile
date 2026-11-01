import { beforeEach,describe,it,expect,vi } from 'vitest';
import {updateListing} from './updateListing';
import {deleteListing} from './deleteListing';
import {peekListingDetailSession,putListingDetailSession} from './listingDetailSessionCache';
import type {ListingDetail} from './getListingById';
const mocks=vi.hoisted(()=>({from:vi.fn(),authChange:undefined as undefined|(()=>void)}));
vi.mock('@/lib/supabase',()=>({supabase:{from:mocks.from,auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null}),onAuthStateChange:(callback:()=>void)=>{mocks.authChange=callback;}}}}));
beforeEach(()=>{mocks.from.mockReset();mocks.authChange?.();});
describe('verified mutations',()=>{
 for(const action of ['update','delete']) for(const outcome of ['missing','denied','changed']){
  it(`${action}: ${outcome}`,async()=>{
   const chain={update:()=>chain,delete:()=>chain,eq:()=>chain,select:()=>chain,maybeSingle:async()=>({data:outcome==='changed'?{id:'id'}:null,error:outcome==='denied'?{message:'denied'}:null})};
   mocks.from.mockReturnValue(chain);
   const result=action==='delete'?await deleteListing('id'):await updateListing('id',{title:'Titre',price:1});
   expect(result.success).toBe(outcome==='changed');
  });
 }
});
describe('session cache',()=>{
 const listing=(status:string)=>({id:'id',status,images:[]}) as unknown as ListingDetail;
 it('evicts public snapshots when a row becomes private',()=>{putListingDetailSession('id',listing('active'),[]);putListingDetailSession('id',listing('sold'),[]);expect(peekListingDetailSession('id')).toBeNull();});
 it('clears public snapshots on auth boundary',()=>{putListingDetailSession('id',listing('active'),[]);expect(peekListingDetailSession('id')).not.toBeNull();mocks.authChange?.();expect(peekListingDetailSession('id')).toBeNull();});
});
