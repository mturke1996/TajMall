'use client';

import { create } from 'zustand';
import type { TenantRentPeriodSelection } from '@/lib/tenant-rent-period';

/**
 * What the tenants list was showing (search, status filter, period). It lives outside the panel so it
 * survives opening a tenant and pressing «رجوع»; a full page reload starts fresh.
 */
type State = {
  searchQuery: string;
  statusFilter: string;
  /** null = the current month, resolved when read so nothing here goes stale */
  periodSelection: TenantRentPeriodSelection | null;
  setSearchQuery: (searchQuery: string) => void;
  setStatusFilter: (statusFilter: string) => void;
  setPeriodSelection: (periodSelection: TenantRentPeriodSelection | null) => void;
};

export const useTenantsView = create<State>((set) => ({
  searchQuery: '',
  statusFilter: 'ALL',
  periodSelection: null,
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setPeriodSelection: (periodSelection) => set({ periodSelection }),
}));
