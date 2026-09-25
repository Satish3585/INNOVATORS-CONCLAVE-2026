import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, recordId, type IdRecord } from "@/lib/api";
import {
  Search,
  X,
  Sprout,
  Leaf,
  CheckCircle2,
  Package,
  Store,
  ArrowRight,
  MapPin,
} from "lucide-react";

interface SearchResult {
  id: string;
  category: "Farm" | "Crop" | "Task" | "Harvest" | "Listing";
  title: string;
  subtitle: string;
  href: string;
  icon: any;
}

export function GlobalSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [searchTerm, setSearchTerm] = useState("");

  const farmsQuery = useQuery({ queryKey: ["search-farms"], queryFn: () => api.farms.list({ limit: 50 }), enabled: open });
  const cropsQuery = useQuery({ queryKey: ["search-crops"], queryFn: () => api.crops.list({ limit: 50 }), enabled: open });
  const tasksQuery = useQuery({ queryKey: ["search-tasks"], queryFn: () => api.records.tasks({ limit: 50 }), enabled: open });
  const harvestsQuery = useQuery({ queryKey: ["search-harvests"], queryFn: () => api.records.harvests({ limit: 50 }), enabled: open });
  const listingsQuery = useQuery({ queryKey: ["search-listings"], queryFn: () => api.marketplace.listings({ limit: 50 }), enabled: open });

  const allItems = useMemo(() => {
    const list: SearchResult[] = [];

    // Farms
    (farmsQuery.data?.items || []).forEach((f: IdRecord) => {
      list.push({
        id: `farm-${recordId(f)}`,
        category: "Farm",
        title: String(f.name || f.farm_name || "Farm"),
        subtitle: `${f.total_area ? `${f.total_area} ${f.area_unit || "acres"}` : "Farm property"} · Status: ${f.land_status || "Owned"}`,
        href: `/farmer/farms/${recordId(f)}`,
        icon: MapPin,
      });
    });

    // Crops
    (cropsQuery.data?.items || []).forEach((c: IdRecord) => {
      list.push({
        id: `crop-${recordId(c)}`,
        category: "Crop",
        title: String(c.crop_name || "Crop"),
        subtitle: `Variety: ${String(c.variety || "Standard")} · Stage: ${String(c.growth_stage || "maturing")}`,
        href: `/farmer/crops/${recordId(c)}`,
        icon: Sprout,
      });
    });

    // Tasks
    (tasksQuery.data?.items || []).forEach((t: IdRecord) => {
      list.push({
        id: `task-${recordId(t)}`,
        category: "Task",
        title: String(t.title || t.name || "Task"),
        subtitle: `Crop: ${String(t.crop_name || "General")} · Priority: ${String(t.priority || "normal")}`,
        href: `/farmer/tasks`,
        icon: CheckCircle2,
      });
    });

    // Harvests
    (harvestsQuery.data?.items || []).forEach((h: IdRecord) => {
      list.push({
        id: `harvest-${recordId(h)}`,
        category: "Harvest",
        title: `Harvest: ${String(h.crop_name || "Produce")}`,
        subtitle: `${String(h.quantity || 0)} ${String(h.unit || "kg")} harvested`,
        href: `/farmer/harvests`,
        icon: Package,
      });
    });

    // Listings
    (listingsQuery.data?.items || []).forEach((l: IdRecord) => {
      list.push({
        id: `listing-${recordId(l)}`,
        category: "Listing",
        title: `Offer: ${String(l.crop_name || "Produce")}`,
        subtitle: `${String(l.quantity || 0)} ${String(l.unit || "kg")} at ₹${String(l.price_per_unit || "0")}/unit`,
        href: `/farmer/listings/${recordId(l)}`,
        icon: Store,
      });
    });

    return list;
  }, [farmsQuery.data, cropsQuery.data, tasksQuery.data, harvestsQuery.data, listingsQuery.data]);

  const results = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return allItems.slice(0, 10);
    return allItems.filter(
      item =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [allItems, searchTerm]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "4rem 1rem 2rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "600px",
          background: "#ffffff",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          overflow: "hidden",
          border: "1px solid #e2e8f0",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid #e2e8f0",
            gap: "0.75rem",
          }}
        >
          <Search size={20} style={{ color: "#16a34a" }} />
          <input
            autoFocus
            type="text"
            placeholder="Search farms, crops, tasks, harvests, produce listings…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: "1.05rem",
              color: "#0f172a",
              background: "transparent",
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
            >
              <X size={18} />
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: "4px 8px",
              background: "#f1f5f9",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.8rem",
              color: "#64748b",
              cursor: "pointer",
            }}
          >
            ESC
          </button>
        </div>

        <div style={{ maxHeight: "400px", overflowY: "auto", padding: "0.5rem" }}>
          {!results.length && (
            <div style={{ padding: "2.5rem 1rem", textAlign: "center", color: "#64748b" }}>
              <Sprout size={32} style={{ color: "#cbd5e1", margin: "0 auto 0.5rem" }} />
              <div>No farm records found matching "{searchTerm}"</div>
            </div>
          )}

          {results.map(item => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onClose}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  borderRadius: "10px",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                  marginBottom: "4px",
                }}
                className="search-result-item"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  <span
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "8px",
                      background: "#f0fdf4",
                      color: "#16a34a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={17} />
                  </span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{item.title}</strong>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: "#e2e8f0",
                          color: "#475569",
                          textTransform: "uppercase",
                        }}
                      >
                        {item.category}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "2px" }}>
                      {item.subtitle}
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: "#94a3b8" }} />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
