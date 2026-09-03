import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const listingByIdPath = resolve(process.cwd(), 'src/services/listings/getListingById.ts');
const sellerUiPath = resolve(process.cwd(), 'src/features/listings/ListingSeller.tsx');

describe('seller response signal (TOM-101)', () => {
  it('n’invente pas un signal sans donnée fiable', () => {
    const listingSrc = readFileSync(listingByIdPath, 'utf8');
    const sellerUiSrc = readFileSync(sellerUiPath, 'utf8');

    expect(listingSrc).toMatch(/NOT IMPLEMENTED — insufficient reliable data/);
    expect(listingSrc).not.toMatch(/\.rpc\([^)]*get_seller_response_indicator/);
    expect(listingSrc).not.toMatch(/response_hint:\s*['"`]/);
    expect(listingSrc).not.toMatch(/response_hint:\s*p\./);

    expect(sellerUiSrc).toMatch(/insufficient reliable data/);
    expect(sellerUiSrc).toMatch(/seller\?\.response_hint\?\.trim\(\)/);
  });
});
