'use client';

import { create } from 'zustand';
import type { TenantRentPeriodSelection } from '@/lib/tenant-rent-period';
import type { TenantSort } from '@/lib/tenant-collection';

/**
 * What the tenants list was showing (search, status filter, period, order). It lives outside the panel so it
 * survives opening a tenant and pressing «رجوع»; a full page reload starts fresh.
 */
type State = {
  searchQuery: string;
  statusFilter: string;
  /** null = the current month, resolved when read so nothing here goes stale */
  periodSelection: TenantRentPeriodSelection | null;
  /** null = the order the filter implies (see defaultTenantSort); set once someone picks a column */
  sort: TenantSort | null;
  setSearchQuery: (searchQuery: string) => void;
  setStatusFilter: (statusFilter: string) => void;
  setPeriodSelection: (periodSelection: TenantRentPeriodSelection | null) => void;
  setSort: (sort: TenantSort | null) => void;
};

export const useTenantsView = create<State>((set) => ({
  searchQuery: '',
  statusFilter: 'ALL',
  periodSelection: null,
  sort: null,
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setPeriodSelection: (periodSelection) => set({ periodSelection }),
  setSort: (sort) => set({ sort }),
}));
