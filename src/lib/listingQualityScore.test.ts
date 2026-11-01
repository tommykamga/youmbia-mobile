import { describe,it,expect } from 'vitest';
import { computeListingQualityScore } from './listingQualityScore';
const data={title:'Un titre suffisamment long',description:'a'.repeat(80),city:'Douala',priceStr:'1000',imageCount:2};
describe('quality dimensions',()=>{
 it('keeps unknown historical availability neutral',()=>{expect(computeListingQualityScore(data).score).toBe(100);expect(computeListingQualityScore({...data,availabilityConfirmed:null}).score).toBe(100);});
 it('explains confirmed dimensions',()=>{const q=computeListingQualityScore({...data,categoryId:1,district:'Akwa',availabilityConfirmed:true});expect(q.score).toBe(100);expect(q.explanation).toHaveLength(8);});
 it('explains known missing category, location and availability',()=>{const q=computeListingQualityScore({...data,categoryId:0,district:'',availabilityConfirmed:false});expect(q.score).toBe(80);expect(q.explanation.slice(-3).every(row=>row.earned===0)).toBe(true);});
 it('excludes non applicable price',()=>{expect(computeListingQualityScore({...data,priceStr:'',priceApplicable:false}).score).toBe(100);});
});
