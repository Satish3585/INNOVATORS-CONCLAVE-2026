import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { api, recordId, type IdRecord } from "@/lib/api";
import { Badge, Button, Card, EmptyState, LoadingState, PageHeading, PageSurface } from "@/components/FarmUI";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Droplets,
  Filter,
  Leaf,
  Package,
  Plus,
  Sparkles,
  Sprout,
  ArrowRight,
} from "lucide-react";

type EventType = "task" | "irrigation" | "input" | "harvest" | "crop_stage";

interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  date: string;
  cropName: string;
  cropId?: string;
  detail: string;
  status?: string;
  priority?: string;
}

export function FarmCalendarPage() {
  const [filter, setFilter] = useState<string>("all");

  const tasksQuery = useQuery({ queryKey: ["calendar-tasks"], queryFn: () => api.records.tasks({ limit: 50 }) });
  const irrigationQuery = useQuery({ queryKey: ["calendar-irrigation"], queryFn: () => api.records.irrigation({ limit: 50 }) });
  const inputsQuery = useQuery({ queryKey: ["calendar-inputs"], queryFn: () => api.records.inputs({ limit: 50 }) });
  const harvestsQuery = useQuery({ queryKey: ["calendar-harvests"], queryFn: () => api.records.harvests({ limit: 50 }) });
  const cropsQuery = useQuery({ queryKey: ["calendar-crops"], queryFn: () => api.crops.list({ limit: 50 }) });

  const isLoading =
    tasksQuery.isLoading ||
    irrigationQuery.isLoading ||
    inputsQuery.isLoading ||
    harvestsQuery.isLoading ||
    cropsQuery.isLoading;

  const events = useMemo(() => {
    const list: CalendarEvent[] = [];

    // 1. Tasks
    (tasksQuery.data?.items || []).forEach((t: IdRecord) => {
      const d = String(t.due_date || t.created_at || "");
      list.push({
        id: `task-${recordId(t)}`,
        type: "task",
        title: String(t.title || t.name || "Task"),
        date: d,
        cropName: String(t.crop_name || "Farm task"),
        cropId: t.crop_id ? String(t.crop_id) : undefined,
        detail: String(t.description || "Scheduled farm activity"),
        status: String(t.status || "pending"),
        priority: String(t.priority || "normal"),
      });
    });

    // 2. Irrigation
    (irrigationQuery.data?.items || []).forEach((ir: IdRecord) => {
      const d = String(ir.date || ir.created_at || "");
      list.push({
        id: `ir-${recordId(ir)}`,
        type: "irrigation",
        title: `Irrigation (${String(ir.method || "standard").toUpperCase()})`,
        date: d,
        cropName: String(ir.crop_name || "Field watering"),
        cropId: ir.crop_id ? String(ir.crop_id) : undefined,
        detail: `${ir.water_amount ? `${ir.water_amount} ${ir.water_unit || "L"}` : "Water applied"}${ir.duration ? ` · ${ir.duration} mins` : ""}`,
        status: "completed",
      });
    });

    // 3. Inputs
    (inputsQuery.data?.items || []).forEach((inp: IdRecord) => {
      const d = String(inp.date || inp.created_at || "");
      list.push({
        id: `input-${recordId(inp)}`,
        type: "input",
        title: `Applied ${String(inp.name || "Input")}`,
        date: d,
        cropName: String(inp.crop_name || "Crop input"),
        cropId: inp.crop_id ? String(inp.crop_id) : undefined,
        detail: `${inp.quantity ? `${inp.quantity} ${inp.unit || ""}` : ""} ${inp.cost ? `· ₹${inp.cost}` : ""}`,
        status: "completed",
      });
    });

    // 4. Harvests
    (harvestsQuery.data?.items || []).forEach((h: IdRecord) => {
      const d = String(h.harvested_at || h.date || h.created_at || "");
      list.push({
        id: `harvest-${recordId(h)}`,
        type: "harvest",
        title: `Harvest: ${String(h.crop_name || "Produce")}`,
        date: d,
        cropName: String(h.crop_name || "Produce"),
        cropId: h.crop_id ? String(h.crop_id) : undefined,
        detail: `${String(h.quantity || 0)} ${String(h.unit || "kg")}${h.quality_grade ? ` · Grade ${h.quality_grade}` : ""}`,
        status: "harvested",
      });
    });

    // 5. Crop Milestones (expected harvest & planting)
    (cropsQuery.data?.items || []).forEach((crop: IdRecord) => {
      if (crop.expected_harvest_date) {
        list.push({
          id: `crop-exp-${recordId(crop)}`,
          type: "crop_stage",
          title: `Expected Harvest: ${String(crop.crop_name)}`,
          date: String(crop.expected_harvest_date),
          cropName: String(crop.crop_name),
          cropId: recordId(crop),
          detail: `Variety: ${String(crop.variety || "Standard")} · Stage: ${String(crop.growth_stage || "maturing")}`,
          status: "upcoming",
        });
      }
      if (crop.planting_date) {
        list.push({
          id: `crop-plant-${recordId(crop)}`,
          type: "crop_stage",
          title: `Planted: ${String(crop.crop_name)}`,
          date: String(crop.planting_date),
          cropName: String(crop.crop_name),
          cropId: recordId(crop),
          detail: `Cycle begun for ${String(crop.crop_name)}`,
          status: "planted",
        });
      }
    });

    // Sort descending by date
    return list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [tasksQuery.data, irrigationQuery.data, inputsQuery.data, harvestsQuery.data, cropsQuery.data]);

  const filteredEvents = useMemo(() => {
    if (filter === "all") return events;
    return events.filter(e => e.type === filter);
  }, [events, filter]);

  // Group by date (YYYY-MM-DD)
  const groupedEvents = useMemo(() => {
    const groups: Record<string, CalendarEvent[]> = {};
    filteredEvents.forEach(evt => {
      const dateKey = evt.date ? evt.date.slice(0, 10) : "Undated";
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(evt);
    });
    return Object.entries(groups);
  }, [filteredEvents]);

  const getTypeIcon = (type: EventType) => {
    switch (type) {
      case "task":
        return <CheckCircle2 size={16} />;
      case "irrigation":
        return <Droplets size={16} />;
      case "input":
        return <Leaf size={16} />;
      case "harvest":
        return <Package size={16} />;
      case "crop_stage":
        return <Sprout size={16} />;
    }
  };

  const getTypeBadge = (type: EventType) => {
    switch (type) {
      case "task":
        return <Badge kind="info">TASK</Badge>;
      case "irrigation":
        return <Badge kind="success">IRRIGATION</Badge>;
      case "input":
        return <Badge kind="neutral">INPUT</Badge>;
      case "harvest":
        return <Badge kind="warning">HARVEST</Badge>;
      case "crop_stage":
        return <Badge kind="ai">CROP STAGE</Badge>;
    }
  };

  return (
    <PageSurface>
      <PageHeading
        eyebrow="DAILY FARM OPERATIONS"
        title="Farm Calendar"
        subtitle="A unified timeline of your scheduled tasks, irrigation records, input applications, and harvest milestones."
        action={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link href="/farmer/tasks/new" className="button button-primary">
              <Plus size={16} /> Add Task
            </Link>
            <Link href="/farmer/irrigation/new" className="button button-secondary">
              <Droplets size={16} /> Record Watering
            </Link>
          </div>
        }
      />

      <div className="filter-row" style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
        <span className="filter-label">
          <Filter size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
          VIEW
        </span>
        {[
          { key: "all", label: "All Activities" },
          { key: "task", label: "Tasks" },
          { key: "irrigation", label: "Irrigation" },
          { key: "input", label: "Inputs" },
          { key: "harvest", label: "Harvests" },
          { key: "crop_stage", label: "Crop Stages" },
        ].map(item => (
          <button
            key={item.key}
            className={`filter-chip ${filter === item.key ? "selected" : ""}`}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading && <LoadingState label="Building farm calendar timeline…" />}

      {!isLoading && !filteredEvents.length && (
        <EmptyState
          title="No calendar records for this filter"
          description="Your scheduled tasks, recorded watering, inputs and harvest dates will automatically populate this unified calendar."
          action={
            <Link href="/farmer/tasks/new" className="button button-primary">
              <Plus size={16} /> Record first activity
            </Link>
          }
        />
      )}

      {!isLoading && Boolean(filteredEvents.length) && (
        <div className="calendar-timeline-container" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {groupedEvents.map(([dateKey, dayEvents]) => {
            const parsedDate = dateKey !== "Undated" ? new Date(dateKey) : null;
            const dateDisplay = parsedDate
              ? parsedDate.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
              : "Undated Records";

            return (
              <div key={dateKey} className="calendar-day-group">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <CalendarDays size={18} style={{ color: "#16a34a" }} />
                  <strong style={{ fontSize: "1.05rem", color: "#1e293b" }}>{dateDisplay}</strong>
                  <span style={{ fontSize: "0.85rem", color: "#64748b" }}>({dayEvents.length} events)</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {dayEvents.map(evt => (
                    <Card
                      key={evt.id}
                      style={{
                        padding: "0.9rem 1.25rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "0.75rem",
                        borderRadius: "10px",
                        borderLeft: `4px solid ${
                          evt.type === "task"
                            ? "#3b82f6"
                            : evt.type === "irrigation"
                            ? "#06b6d4"
                            : evt.type === "harvest"
                            ? "#d97706"
                            : evt.type === "input"
                            ? "#10b981"
                            : "#8b5cf6"
                        }`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.9rem", minWidth: "260px" }}>
                        <span
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "8px",
                            background: "#f1f5f9",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#334155",
                          }}
                        >
                          {getTypeIcon(evt.type)}
                        </span>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <strong style={{ fontSize: "0.98rem", color: "#0f172a" }}>{evt.title}</strong>
                            {getTypeBadge(evt.type)}
                            {evt.priority === "high" && <Badge kind="danger">HIGH PRIORITY</Badge>}
                          </div>
                          <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
                            {evt.cropName} · {evt.detail}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <span style={{ fontSize: "0.85rem", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                          <Clock3 size={13} />
                          {evt.date ? evt.date.slice(11, 16) || "All day" : "Scheduled"}
                        </span>
                        {evt.cropId && (
                          <Link
                            href={`/farmer/crops/${evt.cropId}`}
                            className="inline-link"
                            style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "3px" }}
                          >
                            Crop Journey <ArrowRight size={13} />
                          </Link>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageSurface>
  );
}
