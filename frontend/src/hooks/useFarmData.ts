import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const qk = {
  dashboard: ["dashboard"] as const,
  profile: ["profile"] as const,
  farms: ["farms"] as const,
  farm: (id: string) => ["farms", id] as const,
  fields: (farmId: string) => ["fields", farmId] as const,
  field: (id: string) => ["field", id] as const,
  crops: ["crops"] as const,
  crop: (id: string) => ["crops", id] as const,
  records: (kind: string) => ["records", kind] as const,
  listings: ["listings"] as const,
  listing: (id: string) => ["listing", id] as const,
  transactions: ["transactions"] as const,
  notifications: ["notifications"] as const,
};
export function useFarms(enabled = true) { return useQuery({ queryKey: qk.farms, queryFn: () => api.farms.list({ limit: 50, offset: 0 }), enabled }); }
export function useFarm(id: string, enabled = true) { return useQuery({ queryKey: qk.farm(id), queryFn: () => api.farms.get(id), enabled: enabled && Boolean(id) }); }
export function useFields(farmId: string, enabled = true) { return useQuery({ queryKey: qk.fields(farmId), queryFn: () => api.farms.fields(farmId, { limit: 50, offset: 0 }), enabled: enabled && Boolean(farmId) }); }
export function useCrops(params: Record<string, string | number | boolean | null | undefined> = {}, enabled = true) { return useQuery({ queryKey: [...qk.crops, params], queryFn: () => api.crops.list({ limit: 50, offset: 0, ...params }), enabled }); }
export function useTasks(params: Record<string, string | number | boolean | null | undefined> = {}, enabled = true) { return useQuery({ queryKey: [...qk.records("tasks"), params], queryFn: () => api.records.tasks({ limit: 50, offset: 0, ...params }), enabled }); }
export function useFarmerDashboard(enabled = true) { return useQuery({ queryKey: [...qk.dashboard, "farmer"], queryFn: api.dashboard.farmer, enabled }); }
export function useBuyerDashboard(enabled = true) { return useQuery({ queryKey: [...qk.dashboard, "buyer"], queryFn: api.dashboard.buyer, enabled }); }
export function useListings(params: Record<string, string | number | boolean | null | undefined> = {}, enabled = true) { return useQuery({ queryKey: [...qk.listings, params], queryFn: () => api.marketplace.listings({ limit: 24, offset: 0, ...params }), enabled }); }
