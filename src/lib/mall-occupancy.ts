/**
 * Occupancy of the mall's shops, derived from the lease contracts (what is really signed) and checked
 * against each unit's own status flag. The flag is edited by hand and by a few screens, so it can
 * drift: a unit left "rented" after its lease ended is hidden from the new-contract form, which only
 * offers available units — those mismatches are reported, not hidden.
 */
import { daysBetween } from '@/lib/mall-dates';

export type OccupancyUnit = {
  id: string;
  unit_number: string;
  floor: string;
  area_sqm: string | number | null;
  status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';
  created_at?: string | null;
};

export type OccupancyContract = {
  id: string;
  unit_id: string;
  tenant_id: string;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  start_date: string;
  end_date: string;
  monthly_rent: string | number | null;
  tenant?: { id: string; name: string; phone?: string | null } | null;
};

/** rented: a signed lease is running · reserved: signed, starts later · vacant: free · maintenance: out of stock */
export type UnitState = 'rented' | 'reserved' | 'vacant' | 'maintenance';

/**
 * occupied_without_contract: flag says rented, no active lease — the unit cannot be offered in a new contract.
 * free_with_contract: a lease is running but the flag says free or under maintenance.
 */
export type UnitFlag = 'occupied_without_contract' | 'free_with_contract';

export type OccupancyRow<U extends OccupancyUnit = OccupancyUnit> = {
  unit: U;
  area: number;
  state: UnitState;
  /** the running lease, or the next one for a reserved unit */
  contract: OccupancyContract | null;
  tenantId: string | null;
  tenantName: string | null;
  rent: number;
  /** leases ever signed on the unit, ended ones included: a unit with any cannot be deleted */
  contractsCount: number;
  /** days until the running lease ends; negative once past (still marked active) */
  endsInDays: number | null;
  /** day the unit became free: the last lease's end, else the day it was added */
  vacantSince: string | null;
  vacantDays: number | null;
  neverLeased: boolean;
  flags: UnitFlag[];
};

export type FloorOccupancy = {
  floor: string;
  units: number;
  rented: number;
  reserved: number;
  vacant: number;
  maintenance: number;
  /** rented ÷ (units not under maintenance), 0–100 */
  rate: number;
  rent: number;
  area: number;
  rentedArea: number;
};

export type MallOccupancy<U extends OccupancyUnit = OccupancyUnit> = {
  rows: OccupancyRow<U>[];
  floors: FloorOccupancy[];
  totals: {
    units: number;
    rented: number;
    reserved: number;
    vacant: number;
    maintenance: number;
    /** units that can be let: everything except maintenance */
    leasable: number;
    /** rented ÷ leasable, 0–100 */
    rate: number;
    /** monthly rent of the running leases */
    rentRoll: number;
    area: number;
    rentedArea: number;
    vacantArea: number;
    /** average monthly rent per m² (to the cent), over rented units that have both an area and a rent */
    rentPerSqm: number | null;
    /** vacantArea × rentPerSqm, to the whole dinar — an estimate, never a figure from a contract */
    vacantPotential: number | null;
  };
  /** free for at least LONG_VACANT_DAYS, longest first */
  longVacant: OccupancyRow<U>[];
  /** units whose status flag disagrees with their leases */
  flagged: OccupancyRow<U>[];
};

export const LONG_VACANT_DAYS = 90;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const num = (v: string | number | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const rate = (rented: number, leasable: number) => (leasable > 0 ? Math.round((rented / leasable) * 1000) / 10 : 0);

const ORDINAL_FLOORS: Record<string, number> = {
  القبو: -1,
  السرداب: -1,
  الأرضي: 0,
  الارضي: 0,
  الأول: 1,
  الاول: 1,
  الثاني: 2,
  الثالث: 3,
  الرابع: 4,
  الخامس: 5,
  السادس: 6,
  السابع: 7,
  الثامن: 8,
  التاسع: 9,
  العاشر: 10,
};

/** Floors in building order: basement, ground, first… Written numbers and names both sort; the rest follow alphabetically. */
export function floorRank(floor: string): number {
  const f = floor.trim();
  if (f in ORDINAL_FLOORS) return ORDINAL_FLOORS[f];
  const n = Number(f.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
  if (f !== '' && Number.isFinite(n)) return n;
  return Number.POSITIVE_INFINITY;
}

const byFloor = (a: string, b: string) => {
  const ra = floorRank(a);
  const rb = floorRank(b);
  if (ra !== rb) return ra < rb ? -1 : 1;
  return a.localeCompare(b, 'ar', { numeric: true });
};

/** The lease that is running on `today`, or failing that the soonest one yet to start. */
function currentContract(active: OccupancyContract[], today: string): { contract: OccupancyContract | null; running: boolean } {
  const running = active
    .filter((c) => c.start_date <= today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  if (running[0]) return { contract: running[0], running: true };
  const upcoming = active.slice().sort((a, b) => a.start_date.localeCompare(b.start_date));
  return { contract: upcoming[0] ?? null, running: false };
}

export function buildMallOccupancy<U extends OccupancyUnit>(input: {
  units: U[];
  contracts: OccupancyContract[];
  /** "YYYY-MM-DD" */
  today: string;
}): MallOccupancy<U> {
  const { units, contracts, today } = input;

  const byUnit = new Map<string, OccupancyContract[]>();
  for (const c of contracts) byUnit.set(c.unit_id, [...(byUnit.get(c.unit_id) ?? []), c]);

  const rows: OccupancyRow<U>[] = units.map((unit) => {
    const all = byUnit.get(unit.id) ?? [];
    const active = all.filter((c) => c.status === 'ACTIVE');
    const { contract, running } = currentContract(active, today);
    const area = num(unit.area_sqm);

    const state: UnitState = running ? 'rented' : contract ? 'reserved' : unit.status === 'MAINTENANCE' ? 'maintenance' : 'vacant';

    const flags: UnitFlag[] = [];
    if (unit.status === 'OCCUPIED' && !contract) flags.push('occupied_without_contract');
    if (running && unit.status !== 'OCCUPIED') flags.push('free_with_contract');

    // free since: the day the last ended lease on it finished, else the day the unit was added
    let vacantSince: string | null = null;
    let neverLeased = false;
    if (state === 'vacant') {
      const ended = all
        .filter((c) => c.status !== 'ACTIVE' && c.end_date)
        .map((c) => (c.end_date > today ? today : c.end_date))
        .sort()
        .pop();
      if (ended) vacantSince = ended;
      else {
        neverLeased = all.length === 0;
        vacantSince = unit.created_at ? unit.created_at.slice(0, 10) : null;
      }
    }
    const vacantDays = vacantSince ? Math.max(daysBetween(vacantSince, today) ?? 0, 0) : null;

    return {
      unit,
      area,
      state,
      contract,
      tenantId: contract?.tenant_id ?? null,
      tenantName: contract?.tenant?.name ?? null,
      rent: running && contract ? num(contract.monthly_rent) : 0,
      contractsCount: all.length,
      endsInDays: running && contract ? daysBetween(today, contract.end_date) : null,
      vacantSince,
      vacantDays,
      neverLeased,
      flags,
    };
  });

  const floorMap = new Map<string, FloorOccupancy>();
  for (const r of rows) {
    const key = r.unit.floor?.trim() || '—';
    const f =
      floorMap.get(key) ??
      ({ floor: key, units: 0, rented: 0, reserved: 0, vacant: 0, maintenance: 0, rate: 0, rent: 0, area: 0, rentedArea: 0 } satisfies FloorOccupancy);
    f.units += 1;
    f[r.state] += 1;
    f.rent += r.rent;
    f.area += r.area;
    if (r.state === 'rented') f.rentedArea += r.area;
    floorMap.set(key, f);
  }
  const floors = [...floorMap.values()]
    .sort((a, b) => byFloor(a.floor, b.floor))
    .map((f) => ({
      ...f,
      rate: rate(f.rented, f.units - f.maintenance),
      rent: round3(f.rent),
      area: round3(f.area),
      rentedArea: round3(f.rentedArea),
    }));

  const count = (s: UnitState) => rows.filter((r) => r.state === s).length;
  const rented = count('rented');
  const reserved = count('reserved');
  const vacant = count('vacant');
  const maintenance = count('maintenance');
  const leasable = rows.length - maintenance;

  const priced = rows.filter((r) => r.state === 'rented' && r.area > 0 && r.rent > 0);
  const pricedRent = priced.reduce((s, r) => s + r.rent, 0);
  const pricedArea = priced.reduce((s, r) => s + r.area, 0);
  // an average and an estimate: shown to the cent and to the dinar, not to a thousandth that was never measured
  const rentPerSqm = pricedArea > 0 ? Math.round((pricedRent / pricedArea) * 100) / 100 : null;
  const vacantArea = round3(rows.filter((r) => r.state === 'vacant' || r.state === 'reserved').reduce((s, r) => s + r.area, 0));

  return {
    rows,
    floors,
    totals: {
      units: rows.length,
      rented,
      reserved,
      vacant,
      maintenance,
      leasable,
      rate: rate(rented, leasable),
      rentRoll: round3(rows.reduce((s, r) => s + r.rent, 0)),
      area: round3(rows.reduce((s, r) => s + r.area, 0)),
      rentedArea: round3(rows.filter((r) => r.state === 'rented').reduce((s, r) => s + r.area, 0)),
      vacantArea,
      rentPerSqm,
      vacantPotential: rentPerSqm != null && vacantArea > 0 ? Math.round(rentPerSqm * vacantArea) : null,
    },
    longVacant: rows
      .filter((r) => r.state === 'vacant' && (r.vacantDays ?? 0) >= LONG_VACANT_DAYS)
      .sort((a, b) => (b.vacantDays ?? 0) - (a.vacantDays ?? 0)),
    flagged: rows.filter((r) => r.flags.length > 0),
  };
}
