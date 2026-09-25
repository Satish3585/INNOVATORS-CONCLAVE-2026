import { Link } from "wouter";
import {
  MapPin,
  Leaf,
  Layers,
  Sprout,
  CheckCircle2,
  Package,
  Store,
  ArrowRight,
  TrendingUp,
  RotateCcw,
  Sparkles,
  CalendarDays,
  CalendarCheck2,
} from "lucide-react";

interface Step {
  id: string;
  name: string;
  desc: string;
  href: string;
  icon: any;
  color: string;
}

const loopSteps: Step[] = [
  { id: "farm", name: "1. Farm & Location", desc: "Main farm & acreage", href: "/farmer/farms", icon: MapPin, color: "#16a34a" },
  { id: "field", name: "2. Fields & Soil", desc: "Plots & N-P-K tests", href: "/farmer/farms", icon: Layers, color: "#0d9488" },
  { id: "cultivation", name: "3. Cultivations", desc: "Seasonal cycles", href: "/farmer/crops", icon: Leaf, color: "#059669" },
  { id: "crop", name: "4. Crop Journey", desc: "Growth stages", href: "/farmer/crops", icon: Sprout, color: "#10b981" },
  { id: "monitor", name: "5. Daily Management", desc: "Tasks, water & inputs", href: "/farmer/calendar", icon: CalendarDays, color: "#3b82f6" },
  { id: "ai", name: "6. FarmSaathi AI", desc: "Intelligence & health", href: "/farmer/ai", icon: Sparkles, color: "#8b5cf6" },
  { id: "harvest", name: "7. Harvest Records", desc: "Yield tracking", href: "/farmer/harvests", icon: Package, color: "#d97706" },
  { id: "sell", name: "8. Sell Produce", desc: "Direct listings", href: "/farmer/sell", icon: Store, color: "#ea580c" },
  { id: "transact", name: "9. Transactions", desc: "Fulfillment tracking", href: "/farmer/transactions", icon: CheckCircle2, color: "#0284c7" },
  { id: "analytics", name: "10. Analytics & Profit", desc: "Cost vs revenue", href: "/farmer/performance", icon: TrendingUp, color: "#4f46e5" },
  { id: "next_season", name: "11. Next Season", desc: "New crop cycle", href: "/farmer/crops/new", icon: RotateCcw, color: "#059669" },
];

export function FarmJourneyLoop() {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, rgba(240,253,244,0.85) 0%, rgba(248,250,252,0.95) 100%)",
        border: "1px solid #bbf7d0",
        borderRadius: "16px",
        padding: "1.25rem 1.5rem",
        marginBottom: "1.75rem",
        boxShadow: "0 4px 15px -3px rgba(22, 163, 74, 0.08)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#16a34a" }} />
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#166534", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              COMPLETE FARMER LIFECYCLE
            </span>
          </div>
          <h3 style={{ margin: "2px 0 0", fontSize: "1.15rem", fontWeight: 700, color: "#0f172a" }}>
            The Core Farm Loop: From Seed to Next Season
          </h3>
        </div>
        <Link href="/farmer/calendar" className="inline-link" style={{ fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "4px" }}>
          <CalendarCheck2 size={15} /> Open Farm Calendar <ArrowRight size={14} />
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
          gap: "0.75rem",
          overflowX: "auto",
          paddingBottom: "4px",
        }}
      >
        {loopSteps.map((step) => {
          const Icon = step.icon;
          return (
            <Link
              key={step.id}
              href={step.href}
              style={{
                textDecoration: "none",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "0.75rem 0.6rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: "0.4rem",
                transition: "all 0.2s ease",
              }}
              className="farm-loop-pill"
            >
              <span
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: `${step.color}15`,
                  color: step.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={16} strokeWidth={2} />
              </span>
              <strong style={{ fontSize: "0.82rem", color: "#1e293b", whiteSpace: "nowrap" }}>{step.name}</strong>
              <small style={{ fontSize: "0.72rem", color: "#64748b", lineHeight: 1.2 }}>{step.desc}</small>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
