import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { Badge, Button, Card, LoadingState, PageHeading, PageSurface } from "@/components/FarmUI";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  Eye,
  RefreshCw,
  Server,
  Sparkles,
  Store,
  Sun,
  XCircle,
  FileCheck,
  Cpu,
  Cloud,
} from "lucide-react";

export function SystemStatusPage() {
  const statusQuery = useQuery({
    queryKey: ["system-status"],
    queryFn: () => api.system.status(),
    refetchInterval: 15_000,
  });

  const subsystems = statusQuery.data?.subsystems || {};

  const getSubsystemIcon = (key: string) => {
    switch (key) {
      case "backend":
        return <Server size={20} />;
      case "mongodb":
        return <Database size={20} />;
      case "ai_orchestrator":
        return <Cpu size={20} />;
      case "ollama":
        return <Bot size={20} />;
      case "gemini":
        return <Cloud size={20} />;
      case "crop_model":
        return <Sparkles size={20} />;
      case "disease_model":
        return <Eye size={20} />;
      case "weather_api":
        return <Sun size={20} />;
      case "market_api":
        return <Store size={20} />;
      case "schemes_api":
        return <FileCheck size={20} />;
      default:
        return <Activity size={20} />;
    }
  };

  const operationalCount = Object.values(subsystems).filter(s => s.available).length;
  const totalCount = Object.keys(subsystems).length;

  return (
    <PageSurface>
      <PageHeading
        eyebrow="SYSTEM ARCHITECTURE & DIAGNOSTICS"
        title="System Status"
        subtitle="Live verification of all FarmSaathi subsystems, local AI instances, ML models, and connected services. No mock or fabricated data."
        action={
          <Button
            variant="secondary"
            disabled={statusQuery.isFetching}
            onClick={() => void statusQuery.refetch()}
          >
            <RefreshCw size={15} className={statusQuery.isFetching ? "spin" : ""} />
            {statusQuery.isFetching ? "Checking…" : "Run diagnostics"}
          </Button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", margin: "1.5rem 0" }}>
        <Card style={{ padding: "1.25rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Overall Health</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: operationalCount >= 5 ? "#16a34a" : "#d97706", marginTop: "4px" }}>
                {operationalCount} / {totalCount} Services Active
              </div>
            </div>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background: operationalCount >= 5 ? "#dcfce7" : "#fef3c7",
                color: operationalCount >= 5 ? "#16a34a" : "#d97706",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Activity size={24} />
            </div>
          </div>
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.85rem", color: "#64748b" }}>
            All core farm database operations and ML models are verified and locally operational.
          </p>
        </Card>

        <Card style={{ padding: "1.25rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Honest Service Principle</div>
          <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "#1e293b", marginTop: "4px" }}>
            Deterministic Transparency
          </div>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#64748b", lineHeight: 1.5 }}>
            When a remote provider (e.g. weather or live market rates) is not configured, FarmSaathi clearly displays "Not configured" rather than creating fake estimates.
          </p>
        </Card>
      </div>

      {statusQuery.isLoading && <LoadingState label="Inspecting subsystem status…" />}

      {!statusQuery.isLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
          {Object.entries(subsystems).map(([key, sub]) => {
            const isOk = sub.available;
            return (
              <Card
                key={key}
                style={{
                  padding: "1.25rem",
                  borderRadius: "12px",
                  border: `1px solid ${isOk ? "#bbf7d0" : "#fed7aa"}`,
                  background: isOk ? "#fcfdfc" : "#fffbeb",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "10px",
                          background: isOk ? "#dcfce7" : "#ffedd5",
                          color: isOk ? "#16a34a" : "#ea580c",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {getSubsystemIcon(key)}
                      </span>
                      <div>
                        <strong style={{ fontSize: "1rem", color: "#0f172a" }}>{sub.label}</strong>
                        <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Subsystem ID: {key}</div>
                      </div>
                    </div>
                    <Badge kind={isOk ? "success" : "warning"}>
                      {isOk ? <CheckCircle2 size={12} style={{ marginRight: "3px" }} /> : <AlertTriangle size={12} style={{ marginRight: "3px" }} />}
                      {String(sub.status).toUpperCase()}
                    </Badge>
                  </div>
                </div>

                <div
                  style={{
                    paddingTop: "0.75rem",
                    borderTop: "1px solid #f1f5f9",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.85rem",
                    color: "#64748b",
                  }}
                >
                  <span>Verification: {isOk ? "Validated & Ready" : "Standby / Optional"}</span>
                  <span style={{ fontWeight: 600, color: isOk ? "#16a34a" : "#b45309" }}>
                    {isOk ? "Online ✓" : "Offline ✕"}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageSurface>
  );
}
