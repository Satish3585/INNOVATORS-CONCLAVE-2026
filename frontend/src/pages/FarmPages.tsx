import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, ChevronUp, Edit3, FlaskConical, Leaf, MapPin, Plus, Sparkles, Sprout, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, recordId, type Crop, type Farm, type Field, type IdRecord } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { qk, useCrops, useFarm, useFarms, useFields } from "@/hooks/useFarmData";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeading, PageSurface, SectionHeading, SelectInput, StatCard, TextArea, TextInput } from "@/components/FarmUI";
import { formatDate } from "@/lib/locale";

const fmtDate = (v: unknown) => v ? formatDate(String(v), { day: "numeric", month: "short", year: "numeric" }) : "Not recorded";
const human = (v: unknown) => String(v ?? "Not recorded").replaceAll("_", " ").replace(/\b\w/g, x => x.toUpperCase());
function ManualLocationFields({ initial = {} }: { initial?: Record<string, string> }) {
  return <div className="location-fields"><div className="location-helper"><MapPin size={15} /><span>Enter a place name or address. This is saved as a manual location, not GPS.</span></div><div className="form-grid"><TextInput label="Village or city" id="loc-city" name="loc-city" defaultValue={initial.village || initial.city} placeholder="e.g. Maddur" /><TextInput label="District" id="loc-district" name="loc-district" defaultValue={initial.district} placeholder="District" /><TextInput label="State" id="loc-state" name="loc-state" defaultValue={initial.state} placeholder="State" /><TextInput label="Address (optional)" id="loc-address" name="loc-address" defaultValue={initial.address} placeholder="Street or landmark" /></div></div>;
}
function readManualLocation(form: HTMLFormElement) {
  const get = (id: string) => String(new FormData(form).get(id) || "").trim();
  const [village, district, state, address] = [get("loc-city"), get("loc-district"), get("loc-state"), get("loc-address")];
  if (!village && !district && !state && !address) return undefined;
  return { source: "manual", ...(village ? { village, city: village } : {}), ...(district ? { district } : {}), ...(state ? { state } : {}), ...(address ? { address } : {}) };
}

export function FarmListPage() {
  const farms = useFarms();
  return <PageSurface><PageHeading eyebrow="MY FARM" title="The places you grow." subtitle="Keep your farms, fields and growing seasons connected." action={<Link className="button button-primary" href="/farmer/farms/new"><Plus size={17} /> Add farm</Link>} />
    {farms.isLoading ? <LoadingState label="Loading your farms…" /> : farms.isError ? <ErrorState message={errorMessage(farms.error)} retry={() => void farms.refetch()} /> : farms.data?.items.length ? <div className="farm-card-grid">{farms.data.items.map((farm, i) => <FarmCard key={recordId(farm)} farm={farm} index={i} />)}</div> : <EmptyState title="No farms in your workspace yet" description="Add your first farm to create a home for fields, crops and season records." action={<Link href="/farmer/farms/new" className="button button-primary"><Plus size={17} /> Add your first farm</Link>} />}
  </PageSurface>;
}
function FarmCard({ farm, index }: { farm: Farm; index: number }) {
  const fields = useQuery({ queryKey: qk.fields(recordId(farm)), queryFn: () => api.farms.fields(recordId(farm), { limit: 1, offset: 0 }), enabled: Boolean(recordId(farm)) });
  const location = farm.location;
  const place = [location?.village || location?.city, location?.district, location?.state].filter(Boolean).join(", ");
  return <Link href={`/farmer/farms/${recordId(farm)}`} className={`farm-card farm-card-${index % 3}`}><div className="farm-card-top"><span className="farm-card-glyph"><Leaf size={20} /></span><span className="farm-card-tag">ACTIVE FARM</span><ArrowRight size={16} className="farm-arrow" /></div><div className="farm-card-body"><h2>{farm.name}</h2><p><MapPin size={14} /> {place || "Location not added"}</p></div><div className="farm-card-bottom"><span><strong>{farm.size ? `${farm.size} ${farm.size_unit || "acres"}` : "—"}</strong><small>Total area</small></span><span><strong>{fields.data?.total ?? (fields.isLoading ? "—" : 0)}</strong><small>Fields</small></span><span><strong>{human(farm.farm_type || "Farm")}</strong><small>Type</small></span></div></Link>;
}

export function FarmFormPage({ farmId }: { farmId?: string }) {
  const editing = Boolean(farmId);
  const existing = useFarm(farmId || "", editing);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const mutation = useMutation({ mutationFn: (payload: Record<string, unknown>) => editing ? api.farms.update(farmId!, payload) : api.farms.create(payload), onSuccess: async result => { await qc.invalidateQueries({ queryKey: qk.farms }); toast.success(editing ? "Farm details updated." : "Farm added to your workspace."); setLocation(`/farmer/farms/${recordId(result)}`); }, onError: error => toast.error(errorMessage(error)) });
  if (editing && existing.isLoading) return <PageSurface><LoadingState /></PageSurface>;
  if (editing && existing.isError) return <PageSurface><ErrorState message="Farm details could not be loaded." retry={() => void existing.refetch()} /></PageSurface>;
  const farm = existing.data;
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const fd = new FormData(event.currentTarget); const location = readManualLocation(event.currentTarget); const payload = { name: String(fd.get("name") || "").trim(), farm_type: fd.get("farm_type"), size: fd.get("size") ? Number(fd.get("size")) : undefined, size_unit: fd.get("size_unit"), address: fd.get("address"), notes: fd.get("notes"), ...(location ? { location } : {}) }; mutation.mutate(payload); }
  return <PageSurface><Link href={editing ? `/farmer/farms/${farmId}` : "/farmer/farms"} className="back-link"><ArrowLeft size={15} /> {editing ? "Back to farm" : "All farms"}</Link><PageHeading eyebrow={editing ? "EDIT FARM" : "NEW FARM"} title={editing ? "Update your farm." : "Add a farm."} subtitle="A little context helps keep the rest of your records organized." />
    <Card className="form-card"><form onSubmit={submit} className="record-form"><div className="form-grid"><TextInput label="Farm name" id="farm-name" name="name" defaultValue={farm?.name} required placeholder="e.g. Green Valley" /><SelectInput label="Farm type" id="farm-type" name="farm_type" defaultValue={String(farm?.farm_type || "") } options={[{ value: "owned", label: "Owned" }, { value: "leased", label: "Leased" }, { value: "family", label: "Family farm" }, { value: "managed", label: "Managed" }, { value: "other", label: "Other" }]} /><TextInput label="Total area" id="farm-size" name="size" type="number" min="0.01" step="0.01" defaultValue={farm?.size} placeholder="e.g. 4.5" /><SelectInput label="Area unit" id="farm-size-unit" name="size_unit" defaultValue={String(farm?.size_unit || "acre")} options={[{ value: "acre", label: "Acres" }, { value: "hectare", label: "Hectares" }, { value: "gunta", label: "Guntas" }]} /><TextInput label="Water sources" id="water-sources" name="water_sources" placeholder="e.g. Borewell, canal" hint="Separate multiple sources with commas." /></div><ManualLocationFields initial={(farm?.location || {}) as Record<string, string>} /><TextArea label="Notes" id="farm-notes" name="notes" defaultValue={String(farm?.notes || "")} placeholder="Anything useful to remember about this farm" rows={3} /><div className="form-actions"><Link href={editing ? `/farmer/farms/${farmId}` : "/farmer/farms"} className="button button-ghost">Cancel</Link><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : editing ? "Save changes" : "Add farm"}<ArrowRight size={16} /></Button></div></form></Card>
  </PageSurface>;
}

export function FarmDetailPage({ farmId }: { farmId: string }) {
  const farm = useFarm(farmId);
  const fields = useFields(farmId);
  const summary = useQuery({ queryKey: ["farm-summary", farmId], queryFn: () => api.farms.summary(farmId), enabled: Boolean(farmId) });
  const qc = useQueryClient(); const [, setLocation] = useLocation();
  const archive = useMutation({ mutationFn: () => api.farms.archive(farmId), onSuccess: async () => { await qc.invalidateQueries({ queryKey: qk.farms }); toast.success("Farm archived."); setLocation("/farmer/farms"); }, onError: e => toast.error(errorMessage(e)) });
  if (farm.isLoading) return <PageSurface><LoadingState label="Loading farm details…" /></PageSurface>;
  if (farm.isError || !farm.data) return <PageSurface><ErrorState message="This farm could not be loaded." retry={() => void farm.refetch()} /></PageSurface>;
  const item = farm.data; const place = [item.location?.village || item.location?.city, item.location?.district, item.location?.state].filter(Boolean).join(", ");
  return <PageSurface><Link href="/farmer/farms" className="back-link"><ArrowLeft size={15} /> My farms</Link><PageHeading eyebrow="FARM OVERVIEW" title={item.name} subtitle={<><MapPin size={14} /> {place || "Add a location to give this farm more context."}</>} action={<><Link className="button button-secondary" href={`/farmer/farms/${farmId}/edit`}><Edit3 size={16} /> Edit</Link><Button variant="ghost" onClick={() => { if (confirm("Archive this farm? It will be hidden from your active farm list.")) archive.mutate(); }} disabled={archive.isPending}>Archive</Button></>} />
    <div className="farm-overview-banner"><div className="farm-overview-icon"><Sprout size={28} /></div><div><span className="eyebrow">LAND & GROWING PLACE</span><h2>{item.name}</h2><span>{human(item.farm_type || "Farm")} · {item.size ? `${item.size} ${item.size_unit || "acre"}` : "Area not recorded"}</span></div><Badge kind="success">Active</Badge></div>
    <div className="stats-grid farm-detail-stats"><StatCard label="Fields" value={String(summary.data?.field_count ?? fields.data?.total ?? "—")} note="On this farm" icon={Leaf} /><StatCard label="Active cultivations" value={String(summary.data?.active_cultivation_count ?? "—")} note="Season plans in progress" icon={Sprout} tone="earth" /><StatCard label="Water sources" value={Array.isArray(item.water_sources) ? item.water_sources.length : 0} note="Recorded for this farm" icon={MapPin} tone="blue" /></div>
    <Card><SectionHeading title="Fields on this farm" note="Each field keeps its own soil and crop context." action={<Link href={`/farmer/farms/${farmId}/fields/new`} className="button button-secondary"><Plus size={15} /> Add field</Link>} />{fields.isLoading ? <LoadingState /> : fields.isError ? <ErrorState message="Fields could not be loaded." retry={() => void fields.refetch()} /> : fields.data?.items.length ? <div className="field-grid">{fields.data.items.map((field, index) => <FieldCard key={recordId(field)} field={field} index={index} />)}</div> : <EmptyState title="No fields recorded here yet" description="Add a field to track its area, soil details, irrigation and crop journeys." action={<Link href={`/farmer/farms/${farmId}/fields/new`} className="button button-primary"><Plus size={16} /> Add field</Link>} />}</Card>
    {Boolean(item.notes) && <Card><SectionHeading title="Farm notes" /><p className="record-notes">{String(item.notes)}</p></Card>}
  </PageSurface>;
}
function FieldCard({ field, index }: { field: Field; index: number }) { return <Link href={`/farmer/fields/${recordId(field)}`} className={`field-card field-card-${index % 3}`}><div className="field-card-top"><span className="field-number">FIELD {String(index + 1).padStart(2, "0")}</span><ArrowRight size={15} /></div><h3>{field.name}</h3><p>{field.area} {field.area_unit || "acre"} · {field.soil_type || "Soil not recorded"}</p><div className="field-card-foot">Open field <ChevronRight size={15} /></div></Link>; }

export function FieldFormPage({ farmId }: { farmId: string }) {
  const [, setLocation] = useLocation(); const qc = useQueryClient(); const farm = useFarm(farmId);
  const mutation = useMutation({ mutationFn: (payload: Record<string, unknown>) => api.farms.createField(farmId, payload), onSuccess: async result => { await qc.invalidateQueries({ queryKey: qk.fields(farmId) }); toast.success("Field added."); setLocation(`/farmer/fields/${recordId(result)}`); }, onError: e => toast.error(errorMessage(e)) });
  if (farm.isLoading) return <PageSurface><LoadingState /></PageSurface>;
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const fd = new FormData(event.currentTarget); mutation.mutate({ name: String(fd.get("name") || "").trim(), area: Number(fd.get("area")), area_unit: fd.get("area_unit"), soil_type: fd.get("soil_type") || undefined, soil_ph: fd.get("soil_ph") ? Number(fd.get("soil_ph")) : undefined, irrigation_method: fd.get("irrigation_method") || undefined, water_availability: fd.get("water_availability") || undefined, notes: fd.get("notes") || undefined }); }
  return <PageSurface><Link href={`/farmer/farms/${farmId}`} className="back-link"><ArrowLeft size={15} /> {farm.data?.name || "Back to farm"}</Link><PageHeading eyebrow="NEW FIELD" title="Add a field." subtitle="Field-level details make crop records easier to understand." /><Card className="form-card"><form onSubmit={submit} className="record-form"><div className="form-grid"><TextInput label="Field name" id="field-name" name="name" required placeholder="e.g. North plot" /><TextInput label="Area" id="field-area" name="area" type="number" min="0.01" step="0.01" required placeholder="e.g. 1.25" /><SelectInput label="Area unit" id="field-unit" name="area_unit" defaultValue="acre" options={[{ value: "acre", label: "Acres" }, { value: "hectare", label: "Hectares" }, { value: "gunta", label: "Guntas" }]} /><TextInput label="Soil type" id="field-soil" name="soil_type" placeholder="Optional" /><TextInput label="Soil pH" id="field-ph" name="soil_ph" type="number" min="0" max="14" step="0.1" placeholder="Optional" /><SelectInput label="Irrigation method" id="field-irrigation" name="irrigation_method" options={[{ value: "drip", label: "Drip" }, { value: "sprinkler", label: "Sprinkler" }, { value: "flood", label: "Flood" }, { value: "manual", label: "Manual" }, { value: "other", label: "Other" }]} /><TextInput label="Water availability" id="field-water" name="water_availability" placeholder="e.g. Seasonal" /></div><TextArea label="Notes" id="field-notes" name="notes" rows={3} placeholder="Optional field notes" /><div className="form-actions"><Link href={`/farmer/farms/${farmId}`} className="button button-ghost">Cancel</Link><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Add field"}<ArrowRight size={15} /></Button></div></form></Card></PageSurface>;
}

export function FieldDetailPage({ fieldId }: { fieldId: string }) {
  const field = useQuery({ queryKey: qk.field(fieldId), queryFn: () => api.fields.get(fieldId) });
  const summary = useQuery({ queryKey: ["field-summary", fieldId], queryFn: () => api.fields.summary(fieldId) });
  const soilHistory = useQuery({ queryKey: ["soil-history", fieldId], queryFn: () => api.soilTests.history(fieldId) });
  const [, setLocation] = useLocation(); const qc = useQueryClient();
  const soilMutation = useMutation({ mutationFn: (payload: Record<string, unknown>) => api.fields.updateSoil({ field_id: fieldId, ...payload }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: qk.field(fieldId) }); await qc.invalidateQueries({ queryKey: ["field-summary", fieldId] }); toast.success("Soil record saved."); }, onError: e => toast.error(errorMessage(e)) });
  if (field.isLoading) return <PageSurface><LoadingState /></PageSurface>;
  if (field.isError || !field.data) return <PageSurface><ErrorState message="This field could not be loaded." retry={() => void field.refetch()} /></PageSurface>;
  const item = field.data; const cropList = Array.isArray(summary.data?.active_crops) ? summary.data.active_crops as Crop[] : [];
  const latestLabTest = soilHistory.data?.tests?.[0];
  function saveSoil(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const fd = new FormData(event.currentTarget); soilMutation.mutate({ soil_type: fd.get("soil_type"), soil_ph: fd.get("soil_ph") ? Number(fd.get("soil_ph")) : undefined, soil_test_date: fd.get("soil_test_date") || undefined, soil_test_source: fd.get("soil_test_source") || undefined }); }
  return <PageSurface><Link href={`/farmer/farms/${item.farm_id}`} className="back-link"><ArrowLeft size={15} /> Back to farm</Link><PageHeading eyebrow="FIELD DETAILS" title={item.name} subtitle={`${item.area} ${item.area_unit || "acre"} · ${item.soil_type || "Soil details not yet recorded"}`} action={<div className="flex gap-2"><Link href={`/farmer/fields/${fieldId}/soil`} className="button button-primary"><FlaskConical size={16} /> Soil Health & Tests</Link><Link href={`/farmer/fields/${fieldId}/edit`} className="button button-secondary"><Edit3 size={16} /> Edit field</Link></div>} />
    <div className="field-detail-layout"><Card className="field-main-card"><SectionHeading title="Growing here" note="Crop cycles connected to this field." action={<Link href={`/farmer/crops/new?field_id=${fieldId}`} className="button button-secondary"><Plus size={15} /> Add cultivation</Link>} />{summary.isLoading ? <LoadingState /> : cropList.length ? <div className="crop-list">{cropList.map((crop, index) => <Link key={recordId(crop) || index} href={`/farmer/crops/${recordId(crop)}`} className="crop-row"><span className={`crop-monogram crop-color-${index % 4}`}><Sprout size={18} /></span><span className="crop-row-main"><strong>{String(crop.crop_name || "Crop")}</strong><small>{human(crop.growth_stage)}</small></span><Badge kind="success">{human(crop.status || "active")}</Badge><ArrowRight size={15} /></Link>)}</div> : <EmptyState title="No active crops in this field" description="Create a cultivation and add one or more crop records to begin a journey." action={<Link className="button button-primary" href={`/farmer/crops/new?field_id=${fieldId}`}>Create cultivation <ArrowRight size={15} /></Link>} />}</Card>
      <Card className="soil-card"><SectionHeading title="Soil Health & Laboratory Tests" note={latestLabTest ? `Latest Lab Test: ${latestLabTest.test_date || "Recorded"}` : "Manual observations & laboratory reports"} action={<Link href={`/farmer/fields/${fieldId}/soil`} className="button button-secondary button-sm"><FlaskConical size={14} /> Full Soil Suite</Link>} />
        {latestLabTest ? (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#166534" }}>Latest Certified Lab Test</span>
              <span style={{ fontSize: "0.75rem", color: "#15803d" }}>Source: {latestLabTest.test_source || "Lab Report"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", textAlign: "center" }}>
              <div style={{ background: "#fff", padding: "0.4rem", borderRadius: "6px" }}><div style={{ fontSize: "0.7rem", color: "#64748b" }}>pH</div><strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{latestLabTest.ph ?? "—"}</strong></div>
              <div style={{ background: "#fff", padding: "0.4rem", borderRadius: "6px" }}><div style={{ fontSize: "0.7rem", color: "#64748b" }}>N (kg/ha)</div><strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{latestLabTest.nitrogen ?? "—"}</strong></div>
              <div style={{ background: "#fff", padding: "0.4rem", borderRadius: "6px" }}><div style={{ fontSize: "0.7rem", color: "#64748b" }}>P (kg/ha)</div><strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{latestLabTest.phosphorus ?? "—"}</strong></div>
              <div style={{ background: "#fff", padding: "0.4rem", borderRadius: "6px" }}><div style={{ fontSize: "0.7rem", color: "#64748b" }}>K (kg/ha)</div><strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{latestLabTest.potassium ?? "—"}</strong></div>
            </div>
          </div>
        ) : (
          <div className="soil-measure"><span>Recorded soil pH</span><strong>{item.soil_ph ?? "—"}</strong><small>{item.soil_type || "No soil type recorded"}</small></div>
        )}
        <form className="record-form compact-form" onSubmit={saveSoil}><TextInput label="Soil type" id="soil-type" name="soil_type" defaultValue={String(item.soil_type || "")} placeholder="e.g. Red loam" /><TextInput label="pH (if known)" id="soil-ph" name="soil_ph" type="number" min="0" max="14" step="0.1" defaultValue={item.soil_ph} placeholder="0–14" /><SelectInput label="Record source" id="soil-source" name="soil_test_source" options={[{ value: "manual", label: "Manual observation" }, { value: "lab", label: "Lab report" }, { value: "soil_health_card", label: "Soil Health Card" }, { value: "report", label: "Other report" }, { value: "unknown", label: "Unknown" }]} /><TextInput label="Test date" id="soil-date" name="soil_test_date" type="date" /><Button type="submit" disabled={soilMutation.isPending}>{soilMutation.isPending ? "Saving…" : "Save soil notes"}</Button></form>
      </Card></div>
    <Card><SectionHeading title="Field conditions" /><div className="detail-key-grid"><span>Irrigation method<strong>{human(item.irrigation_method || "Not recorded")}</strong></span><span>Water availability<strong>{human(item.water_availability || "Not recorded")}</strong></span><span>Area<strong>{item.area} {item.area_unit || "acre"}</strong></span><span>Field ID<strong className="small-mono">{fieldId.slice(-8)}</strong></span></div></Card>
  </PageSurface>;
}

export function CropListPage() {
  const [status, setStatus] = useState(""); const crops = useCrops(status ? { status } : {});
  return <PageSurface><PageHeading eyebrow="CROP JOURNEYS" title="Every season has a story." subtitle="Follow the crop records linked to your farms and fields." action={<Link className="button button-primary" href="/farmer/crops/new"><Plus size={16} /> Add crops</Link>} />
    <div className="filter-row"><span className="filter-label">SHOW</span>{["", "active", "planned", "completed", "failed"].map(value => <button key={value || "all"} className={`filter-chip ${status === value ? "selected" : ""}`} onClick={() => setStatus(value)}>{value ? human(value) : "All cycles"}</button>)}</div>
    {crops.isLoading ? <LoadingState label="Loading crop records…" /> : crops.isError ? <ErrorState message="Crop records could not be loaded." retry={() => void crops.refetch()} /> : crops.data?.items.length ? <div className="crop-card-grid">{crops.data.items.map((crop, i) => <Link key={recordId(crop)} href={`/farmer/crops/${recordId(crop)}`} className={`crop-card crop-card-${i % 4}`}><div className="crop-card-art"><div className="crop-illustration"><Sprout size={42} strokeWidth={1.15} /></div><Badge kind={crop.status === "active" ? "success" : "neutral"}>{human(crop.status || "status unknown")}</Badge></div><div className="crop-card-content"><div className="eyebrow">{human(crop.growth_stage || "STAGE UNKNOWN")}</div><h3>{String(crop.crop_name)}</h3><p>{String(crop.variety || "Variety not recorded")}</p><div className="crop-card-meta"><span>PLANTED<strong>{fmtDate(crop.planting_date)}</strong></span><span>HARVEST WINDOW<strong>{fmtDate(crop.expected_harvest_date)}</strong></span></div><div className="crop-card-cta">Open journey <ArrowRight size={15} /></div></div></Link>)}</div> : <EmptyState title="No crop records yet" description="Start a cultivation and add one crop or several crops in the same field." action={<Link className="button button-primary" href="/farmer/crops/new"><Plus size={16} /> Create cultivation</Link>} />}
  </PageSurface>;
}

type CropDraft = { crop_name: string; variety: string; area: string; growth_stage: string };

function CropRecommendationAssistant({ onSelectCrop }: { onSelectCrop: (cropName: string) => void }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState("80");
  const [p, setP] = useState("40");
  const [k, setK] = useState("40");
  const [ph, setPh] = useState("6.5");
  const [rain, setRain] = useState("100");
  const [temp, setTemp] = useState("25");
  const [hum, setHum] = useState("70");
  const [prev, setPrev] = useState("");
  const [water, setWater] = useState("medium");
  const [result, setResult] = useState<any>(null);

  const recommend = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.crops.recommend(payload),
    onSuccess: (data: any) => {
      setResult(data);
      toast.success("AI crop recommendations calculated by ML model.");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const handleRun = (e: React.MouseEvent) => {
    e.preventDefault();
    recommend.mutate({
      nitrogen: Number(n) || 80,
      phosphorus: Number(p) || 40,
      potassium: Number(k) || 40,
      ph: Number(ph) || 6.5,
      rainfall: Number(rain) || 100,
      temperature: Number(temp) || 25,
      humidity: Number(hum) || 70,
      previous_crop: prev.trim() || undefined,
      water_availability: water,
    });
  };

  return (
    <div style={{ marginBottom: "1.25rem", border: "1px solid #e2e8f0", borderRadius: "12px", background: "#f8fafc", padding: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <Sparkles size={18} style={{ color: "#d97706" }} />
          <div>
            <strong style={{ fontSize: "0.95rem" }}>FarmSaathi Crop Recommendation Engine</strong>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>Run trained ML inference against soil N-P-K, pH & weather conditions.</p>
          </div>
        </div>
        <Button type="button" variant="ghost">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {open ? "Hide assistant" : "Get recommendations"}
        </Button>
      </div>

      {open && (
        <div style={{ marginTop: "1rem", borderTop: "1px solid #e2e8f0", paddingTop: "0.85rem" }}>
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.5rem" }}>
            <TextInput label="Nitrogen (N)" id="rec-n" value={n} onChange={e => setN(e.target.value)} placeholder="80" />
            <TextInput label="Phosphorus (P)" id="rec-p" value={p} onChange={e => setP(e.target.value)} placeholder="40" />
            <TextInput label="Potassium (K)" id="rec-k" value={k} onChange={e => setK(e.target.value)} placeholder="40" />
            <TextInput label="Soil pH" id="rec-ph" value={ph} onChange={e => setPh(e.target.value)} placeholder="6.5" />
            <TextInput label="Rainfall (mm)" id="rec-rain" value={rain} onChange={e => setRain(e.target.value)} placeholder="100" />
            <TextInput label="Temp (°C)" id="rec-temp" value={temp} onChange={e => setTemp(e.target.value)} placeholder="25" />
            <TextInput label="Prev. Crop" id="rec-prev" value={prev} onChange={e => setPrev(e.target.value)} placeholder="e.g. Tomato" />
            <SelectInput label="Water" id="rec-water" value={water} onChange={e => setWater(e.target.value)} options={[{ value: "low", label: "Low / Rainfed" }, { value: "medium", label: "Medium" }, { value: "high", label: "High / Irrigated" }]} />
          </div>
          <div style={{ marginTop: "0.85rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Button type="button" onClick={handleRun} disabled={recommend.isPending}>
              {recommend.isPending ? "Running ML Model…" : "Run ML Recommendation"}
            </Button>
            {result?.ml_model_used && (
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Model: {result.ml_model_used}</span>
            )}
          </div>

          {result?.recommendations && result.recommendations.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <h4 style={{ fontSize: "0.88rem", fontWeight: 600, color: "#1e293b", marginBottom: "0.5rem" }}>Top Recommended Crops:</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "0.75rem" }}>
                {result.recommendations.map((rec: any, idx: number) => (
                  <div key={idx} style={{ padding: "0.75rem", border: "1px solid #cbd5e1", borderRadius: "8px", background: "#ffffff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ textTransform: "capitalize", fontSize: "0.95rem" }}>{rec.crop}</strong>
                      {rec.confidence_pct != null && (
                        <Badge kind="success">{rec.confidence_pct}% match</Badge>
                      )}
                    </div>
                    {rec.agronomic_rationale && (
                      <p style={{ fontSize: "0.75rem", color: "#475569", margin: "0.35rem 0" }}>{rec.agronomic_rationale}</p>
                    )}
                    <div style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: "0.5rem" }}>
                      <span>Water: {rec.water_need || "Moderate"}</span> · <span>Season: {rec.growing_season || "Any"}</span>
                    </div>
                    <Button type="button" variant="secondary" style={{ width: "100%" }} onClick={() => onSelectCrop(rec.crop)}>
                      <Plus size={14} /> Add to cultivation
                    </Button>
                  </div>
                ))}
              </div>
              {result.crop_rotation_considerations?.length > 0 && (
                <div style={{ marginTop: "0.75rem", padding: "0.6rem", background: "#fef3c7", borderRadius: "6px", fontSize: "0.8rem", color: "#92400e" }}>
                  <strong>Rotation Note: </strong>{result.crop_rotation_considerations.join(" ")}
                </div>
              )}
              {result.intercropping_suggestions?.length > 0 && (
                <div style={{ marginTop: "0.5rem", padding: "0.6rem", background: "#f0fdf4", borderRadius: "6px", fontSize: "0.8rem", color: "#166534" }}>
                  <strong>Companion Pair: </strong>{result.intercropping_suggestions[0].primary} + {result.intercropping_suggestions[0].companion} ({result.intercropping_suggestions[0].reason})
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CropCreatePage() {
  const [, setLocation] = useLocation(); const qc = useQueryClient(); const fields = useQuery({ queryKey: ["fields-all"], queryFn: async () => { const farms = await api.farms.list({ limit: 50 }); const results = await Promise.all(farms.items.map(farm => api.farms.fields(recordId(farm), { limit: 100 }))); return results.flatMap(page => page.items); } });
  const [rows, setRows] = useState<CropDraft[]>([{ crop_name: "", variety: "", area: "", growth_stage: "planning" }]);
  const create = useMutation({ mutationFn: (payload: Record<string, unknown>) => api.cultivations.create(payload), onSuccess: async result => { await qc.invalidateQueries({ queryKey: qk.crops }); await qc.invalidateQueries({ queryKey: ["records", "cultivations"] }); await qc.invalidateQueries({ queryKey: qk.dashboard }); toast.success(`${result.crops.length} crop record${result.crops.length === 1 ? "" : "s"} created.`); if (result.crops[0]) setLocation(`/farmer/crops/${recordId(result.crops[0])}`); else setLocation("/farmer/crops"); }, onError: e => toast.error(errorMessage(e)) });
  
  const handleSelectRecommendedCrop = (cropName: string) => {
    // Fill first empty row or append
    const emptyIndex = rows.findIndex(r => !r.crop_name.trim());
    if (emptyIndex >= 0) {
      setRows(rows.map((r, i) => i === emptyIndex ? { ...r, crop_name: cropName } : r));
    } else {
      setRows([...rows, { crop_name: cropName, variety: "", area: "", growth_stage: "planning" }]);
    }
    toast.info(`Added ${cropName} to cultivation.`);
  };

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const fd = new FormData(event.currentTarget); const crops = rows.map(row => ({ crop_name: row.crop_name.trim(), variety: row.variety.trim() || undefined, area: row.area ? Number(row.area) : undefined, growth_stage: row.growth_stage, area_unit: String(fd.get("area_unit") || "acre") })).filter(row => row.crop_name); if (!crops.length) { toast.error("Add at least one crop name."); return; } const start = String(fd.get("start_date") || ""); create.mutate({ field_id: fd.get("field_id"), name: fd.get("name") || "Main crop cycle", season: fd.get("season") || undefined, start_date: start, notes: fd.get("notes") || undefined, crops: crops.map(row => ({ ...row, planting_date: start })) }); }
  const paramField = new URLSearchParams(window.location.search).get("field_id") || "";
  return <PageSurface><Link href="/farmer/crops" className="back-link"><ArrowLeft size={15} /> Crop journeys</Link><PageHeading eyebrow="NEW CULTIVATION" title="Plan a growing season." subtitle="Group crops grown together in the same field, then follow each crop individually." />
    <CropRecommendationAssistant onSelectCrop={handleSelectRecommendedCrop} />
    <Card className="form-card"><form onSubmit={submit} className="record-form"><div className="form-grid"><SelectInput label="Field" id="cult-field" name="field_id" required defaultValue={paramField} options={(fields.data || []).map(field => ({ value: recordId(field), label: field.name }))} />{fields.isError && <div className="form-alert">Fields could not be loaded. Add a farm and field first.</div>}<TextInput label="Cultivation name" id="cult-name" name="name" placeholder="e.g. Monsoon mixed cropping" /><TextInput label="Season" id="cult-season" name="season" placeholder="e.g. Kharif 2026" /><TextInput label="Start date" id="cult-start" name="start_date" type="date" required /><SelectInput label="Area unit" id="cult-area-unit" name="area_unit" defaultValue="acre" options={[{ value: "acre", label: "Acres" }, { value: "hectare", label: "Hectares" }, { value: "gunta", label: "Guntas" }]} /></div>
      <div className="multi-crop-heading"><div><h3>Crop records</h3><p>Each crop will become its own linked journey.</p></div><Button type="button" variant="secondary" onClick={() => setRows([...rows, { crop_name: "", variety: "", area: "", growth_stage: "planning" }])}><Plus size={15} /> Add another</Button></div>
      <div className="multi-crop-list">{rows.map((row, index) => <div className="multi-crop-row" key={index}><span className="crop-row-index">{String(index + 1).padStart(2, "0")}</span><TextInput label="Crop name" id={`crop-${index}`} value={row.crop_name} required onChange={e => setRows(rows.map((v, i) => i === index ? { ...v, crop_name: e.target.value } : v))} placeholder="e.g. Tomato" /><TextInput label="Variety" id={`variety-${index}`} value={row.variety} onChange={e => setRows(rows.map((v, i) => i === index ? { ...v, variety: e.target.value } : v))} placeholder="Optional" /><TextInput label="Allocated area" id={`area-${index}`} type="number" min="0.01" step="0.01" value={row.area} onChange={e => setRows(rows.map((v, i) => i === index ? { ...v, area: e.target.value } : v))} placeholder="Optional" /><SelectInput label="Stage" id={`stage-${index}`} value={row.growth_stage} onChange={e => setRows(rows.map((v, i) => i === index ? { ...v, growth_stage: e.target.value } : v))} options={[{ value: "planning", label: "Planning" }, { value: "seedling", label: "Seedling" }, { value: "vegetative", label: "Vegetative" }, { value: "flowering", label: "Flowering" }, { value: "fruit_development", label: "Fruit development" }, { value: "maturity", label: "Maturity" }]} />{rows.length > 1 && <button className="icon-button remove-crop" type="button" aria-label="Remove crop" onClick={() => setRows(rows.filter((_, i) => i !== index))}><Trash2 size={15} /></button>}</div>)}</div>
      <TextArea label="Season notes" id="cult-notes" name="notes" rows={3} placeholder="Optional notes about this cultivation" /><div className="form-actions"><Link href="/farmer/crops" className="button button-ghost">Cancel</Link><Button type="submit" disabled={create.isPending || fields.isLoading}>{create.isPending ? "Creating crop journeys…" : "Create cultivation"}<ArrowRight size={16} /></Button></div></form></Card>
  </PageSurface>;
}

export function CropJourneyPage({ cropId }: { cropId: string }) {
  const journey = useQuery({ queryKey: ["crop-journey", cropId], queryFn: () => api.crops.journey(cropId) });
  const crop = journey.data?.crop; const events = journey.data?.timeline || [];
  if (journey.isLoading) return <PageSurface><LoadingState label="Loading this crop journey…" /></PageSurface>;
  if (journey.isError || !crop) return <PageSurface><ErrorState message="Crop journey could not be loaded." retry={() => void journey.refetch()} /></PageSurface>;
  const stageList = ["planting", "seedling", "vegetative", "flowering", "fruit_development", "maturity", "harvest"];
  const stageIndex = stageList.indexOf(String(crop.growth_stage || "").toLowerCase());
  return <PageSurface><Link href="/farmer/crops" className="back-link"><ArrowLeft size={15} /> All crops</Link><div className="journey-hero"><div className="journey-icon"><Sprout size={31} /></div><div className="journey-title"><div className="eyebrow">CROP JOURNEY · {human(crop.status || "status unknown")}</div><h1>{String(crop.crop_name)}</h1><p>{String(crop.variety || "Variety not recorded")} · {crop.area ? `${crop.area} ${String(crop.area_unit || "acre")}` : "Area not recorded"}</p></div><Link className="button button-secondary" href={`/farmer/crops/${cropId}/edit`}><Edit3 size={16} /> Edit crop</Link></div>
    <div className="journey-meta-grid"><span>FIELD<strong>{String(crop.field_id || "Not linked").slice(-8)}</strong></span><span>PLANTED<strong>{fmtDate(crop.planting_date)}</strong></span><span>EXPECTED HARVEST<strong>{fmtDate(crop.expected_harvest_date)}</strong></span><span>CURRENT STAGE<strong>{human(crop.growth_stage)}</strong></span></div>
    <Card className="stage-card"><SectionHeading title="Growing stages" note="Current stage as saved in the crop record. The timeline does not estimate progress." />{stageIndex >= 0 ? <div className="growth-track">{stageList.map((stage, index) => <div key={stage} className={`growth-step ${index < stageIndex ? "done" : ""} ${index === stageIndex ? "current" : ""}`}><span className="growth-node">{index < stageIndex ? <Check size={12} /> : index + 1}</span><small>{human(stage)}</small></div>)}</div> : <div className="stage-unknown"><Leaf size={19} /><span>Stage not recorded in a recognized lifecycle label.</span><Badge>{human(crop.growth_stage || "Unknown")}</Badge></div>}</Card>
    <div className="journey-shortcuts"><Link href={`/farmer/tasks?crop_id=${cropId}`}><span><Check size={16} /></span><strong>Tasks</strong><small>View or record</small></Link><Link href={`/farmer/health?crop_id=${cropId}`}><span><Leaf size={16} /></span><strong>Health</strong><small>Review observations</small></Link><Link href={`/farmer/irrigation?crop_id=${cropId}`}><span><MapPin size={16} /></span><strong>Irrigation</strong><small>Record watering</small></Link><Link href={`/farmer/harvests?crop_id=${cropId}`}><span><Sprout size={16} /></span><strong>Harvest</strong><small>Track produce</small></Link><Link href={`/farmer/ai?crop_id=${cropId}`}><span><Sprout size={16} /></span><strong>Ask FarmSaathi</strong><small>About this crop</small></Link></div>
    <Card><SectionHeading title="Crop timeline" note="Events returned by the backend for this crop." />{events.length ? <div className="timeline-list">{events.map((event, index) => <div className="timeline-item" key={recordId(event) || index}><span className="timeline-dot" /><div><div className="timeline-title"><strong>{human(event.record_type || event.title || event.name || "Record")}</strong><time>{fmtDate(event.created_at || event.date || event.harvested_at)}</time></div><p>{String(event.description || event.notes || event.symptoms?.toString?.() || event.status || "Record saved to your crop journey.")}</p></div></div>)}</div> : <EmptyState title="No timeline records yet" description="As you add tasks, watering, health notes, inputs and harvests, the backend will return them here." />}</Card>
  </PageSurface>;
}

export function CropEditPage({ cropId }: { cropId: string }) {
  const crop = useQuery({ queryKey: qk.crop(cropId), queryFn: () => api.crops.get(cropId) }); const qc = useQueryClient(); const [, setLocation] = useLocation();
  const update = useMutation({ mutationFn: (payload: Record<string, unknown>) => api.crops.update(cropId, payload), onSuccess: async () => { await qc.invalidateQueries({ queryKey: qk.crop(cropId) }); await qc.invalidateQueries({ queryKey: ["crop-journey", cropId] }); toast.success("Crop record updated."); setLocation(`/farmer/crops/${cropId}`); }, onError: e => toast.error(errorMessage(e)) });
  if (crop.isLoading) return <PageSurface><LoadingState /></PageSurface>;
  if (crop.isError || !crop.data) return <PageSurface><ErrorState message="Crop details could not be loaded." retry={() => void crop.refetch()} /></PageSurface>;
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const fd = new FormData(event.currentTarget); update.mutate({ crop_name: fd.get("crop_name"), variety: fd.get("variety"), growth_stage: fd.get("growth_stage"), status: fd.get("status"), expected_harvest_date: fd.get("expected_harvest_date") || undefined, notes: fd.get("notes") || undefined }); }
  return <PageSurface><Link href={`/farmer/crops/${cropId}`} className="back-link"><ArrowLeft size={15} /> Crop journey</Link><PageHeading eyebrow="EDIT CROP" title={`Update ${crop.data.crop_name}.`} subtitle="These changes update the crop record in your workspace." /><Card className="form-card"><form onSubmit={submit} className="record-form"><div className="form-grid"><TextInput label="Crop name" id="crop-edit-name" name="crop_name" defaultValue={crop.data.crop_name} required /><TextInput label="Variety" id="crop-edit-variety" name="variety" defaultValue={String(crop.data.variety || "")} /><SelectInput label="Growth stage" id="crop-edit-stage" name="growth_stage" defaultValue={String(crop.data.growth_stage || "planning")} options={["planning", "seedling", "vegetative", "flowering", "fruit_development", "maturity", "harvest"].map(value => ({ value, label: human(value) }))} /><SelectInput label="Status" id="crop-edit-status" name="status" defaultValue={String(crop.data.status || "active")} options={["active", "planned", "completed", "failed"].map(value => ({ value, label: human(value) }))} /><TextInput label="Expected harvest date" id="crop-edit-harvest" name="expected_harvest_date" type="date" defaultValue={String(crop.data.expected_harvest_date || "").slice(0, 10)} /></div><TextArea label="Notes" id="crop-edit-notes" name="notes" defaultValue={String(crop.data.notes || "")} rows={3} /><div className="form-actions"><Link href={`/farmer/crops/${cropId}`} className="button button-ghost">Cancel</Link><Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save changes"}<ArrowRight size={15} /></Button></div></form></Card></PageSurface>;
}

export function SimplePageStub({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) { return <PageSurface><PageHeading eyebrow="FARM WORKSPACE" title={title} subtitle={description} />{children}</PageSurface>; }
