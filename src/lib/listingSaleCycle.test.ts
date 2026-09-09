import { describe, expect, it } from 'vitest';
import { applyListingSaleCycleInsert, applyListingSaleCycleUpdate } from './listingSaleCycle';

const CREATED = '2026-01-01T00:00:00.000Z';
const FIRST_SOLD = '2026-01-03T00:00:00.000Z';
const REACTIVATED = '2026-01-10T00:00:00.000Z';
const SECOND_SOLD = '2026-01-11T00:00:00.000Z';
const FORGED = '1999-01-01T00:00:00.000Z';

describe('applyListingSaleCycleInsert', () => {
  it('nouvelle annonce active : cycle = created_at, sold_at null', () => {
    expect(
      applyListingSaleCycleInsert({
        status: 'active',
        created_at: CREATED,
        now: CREATED,
        clientSoldAt: FORGED,
        clientSaleCycleStartedAt: FORGED,
      })
    ).toEqual({
      sold_at: null,
      sale_cycle_started_at: CREATED,
    });
  });

  it('INSERT sold : sold_at = now, cycle = created_at (client ignoré)', () => {
    expect(
      applyListingSaleCycleInsert({
        status: 'sold',
        created_at: CREATED,
        now: FIRST_SOLD,
        clientSoldAt: FORGED,
        clientSaleCycleStartedAt: FORGED,
      })
    ).toEqual({
      sold_at: FIRST_SOLD,
      sale_cycle_started_at: CREATED,
    });
  });
  it('INSERT draft : pas de cycle de vente', () => {
    expect(
      applyListingSaleCycleInsert({
        status: 'draft',
        created_at: CREATED,
        now: CREATED,
        clientSoldAt: FORGED,
        clientSaleCycleStartedAt: FORGED,
      })
    ).toEqual({
      sold_at: null,
      sale_cycle_started_at: null,
    });
  });
});

describe('applyListingSaleCycleUpdate', () => {
  it('draft → active démarre le cycle à now (pas created_at du brouillon)', () => {
    expect(
      applyListingSaleCycleUpdate({
        oldStatus: 'draft',
        newStatus: 'active',
        oldSoldAt: null,
        oldSaleCycleStartedAt: null,
        now: REACTIVATED,
      })
    ).toEqual({
      sold_at: null,
      sale_cycle_started_at: REACTIVATED,
    });
  });

  it('premier cycle active → sold : sold_at = now, cycle inchangé', () => {
    expect(
      applyListingSaleCycleUpdate({
        oldStatus: 'active',
        newStatus: 'sold',
        oldSoldAt: null,
        oldSaleCycleStartedAt: CREATED,
        now: FIRST_SOLD,
        clientSoldAt: FORGED,
      })
    ).toEqual({
      sold_at: FIRST_SOLD,
      sale_cycle_started_at: CREATED,
    });
  });

  it('sold → active remet sold_at NULL et démarre un nouveau cycle', () => {
    expect(
      applyListingSaleCycleUpdate({
        oldStatus: 'sold',
        newStatus: 'active',
        oldSoldAt: FIRST_SOLD,
        oldSaleCycleStartedAt: CREATED,
        now: REACTIVATED,
      })
    ).toEqual({
      sold_at: null,
      sale_cycle_started_at: REACTIVATED,
    });
  });

  it('seconde vente : cycle = réactivation, pas created_at', () => {
    const afterReactivation = applyListingSaleCycleUpdate({
      oldStatus: 'sold',
      newStatus: 'active',
      oldSoldAt: FIRST_SOLD,
      oldSaleCycleStartedAt: CREATED,
      now: REACTIVATED,
    });
    expect(
      applyListingSaleCycleUpdate({
        oldStatus: 'active',
        newStatus: 'sold',
        oldSoldAt: afterReactivation.sold_at,
        oldSaleCycleStartedAt: afterReactivation.sale_cycle_started_at,
        now: SECOND_SOLD,
      })
    ).toEqual({
      sold_at: SECOND_SOLD,
      sale_cycle_started_at: REACTIVATED,
    });
  });

  it('hidden → active ne redémarre pas le cycle', () => {
    expect(
      applyListingSaleCycleUpdate({
        oldStatus: 'hidden',
        newStatus: 'active',
        oldSoldAt: null,
        oldSaleCycleStartedAt: CREATED,
        now: REACTIVATED,
        clientSaleCycleStartedAt: FORGED,
      })
    ).toEqual({
      sold_at: null,
      sale_cycle_started_at: CREATED,
    });
  });

  it('sold → hidden remet sold_at NULL et démarre un nouveau cycle', () => {
    expect(
      applyListingSaleCycleUpdate({
        oldStatus: 'sold',
        newStatus: 'hidden',
        oldSoldAt: FIRST_SOLD,
        oldSaleCycleStartedAt: CREATED,
        now: REACTIVATED,
        clientSoldAt: FORGED,
        clientSaleCycleStartedAt: FORGED,
      })
    ).toEqual({
      sold_at: null,
      sale_cycle_started_at: REACTIVATED,
    });
  });

  it('sold → suspended : sold_at NULL, cycle inchangé', () => {
    expect(
      applyListingSaleCycleUpdate({
        oldStatus: 'sold',
        newStatus: 'suspended',
        oldSoldAt: FIRST_SOLD,
        oldSaleCycleStartedAt: CREATED,
        now: REACTIVATED,
      })
    ).toEqual({
      sold_at: null,
      sale_cycle_started_at: CREATED,
    });
  });

  it('update normal sans changement de status conserve les timestamps OLD', () => {
    expect(
      applyListingSaleCycleUpdate({
        oldStatus: 'active',
        newStatus: 'active',
        oldSoldAt: null,
        oldSaleCycleStartedAt: CREATED,
        now: REACTIVATED,
        clientSoldAt: FORGED,
        clientSaleCycleStartedAt: FORGED,
      })
    ).toEqual({
      sold_at: null,
      sale_cycle_started_at: CREATED,
    });
  });

  it('UPDATE direct de sold_at sans transition est neutralisé', () => {
    expect(
      applyListingSaleCycleUpdate({
        oldStatus: 'active',
        newStatus: 'active',
        oldSoldAt: null,
        oldSaleCycleStartedAt: CREATED,
        now: FIRST_SOLD,
        clientSoldAt: FORGED,
      })
    ).toEqual({
      sold_at: null,
      sale_cycle_started_at: CREATED,
    });

    expect(
      applyListingSaleCycleUpdate({
        oldStatus: 'sold',
        newStatus: 'sold',
        oldSoldAt: FIRST_SOLD,
        oldSaleCycleStartedAt: CREATED,
        now: SECOND_SOLD,
        clientSoldAt: FORGED,
      })
    ).toEqual({
      sold_at: FIRST_SOLD,
      sale_cycle_started_at: CREATED,
    });
  });

  it('UPDATE direct de sale_cycle_started_at est neutralisé', () => {
    expect(
      applyListingSaleCycleUpdate({
        oldStatus: 'active',
        newStatus: 'active',
        oldSoldAt: null,
        oldSaleCycleStartedAt: CREATED,
        now: REACTIVATED,
        clientSaleCycleStartedAt: FORGED,
      })
    ).toEqual({
      sold_at: null,
      sale_cycle_started_at: CREATED,
    });
  });
});
