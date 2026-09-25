import { useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Clock3, FileImage, LoaderCircle, Plus, Sprout, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, recordId, type IdRecord } from "@/lib/api";
import { qk, useCrops, useTasks } from "@/hooks/useFarmData";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeading, PageSurface, SectionHeading, SelectInput, TextArea, TextInput } from "@/components/FarmUI";
import { formatDate } from "@/lib/locale";

export type RecordKind = "tasks" | "irrigation" | "inputs" | "expenses" | "health" | "harvests";
const labels: Record<RecordKind, { singular: string; plural: string; description: string; newTitle: string }> = {
  tasks: { singular: "Task", plural: "Tasks", description: "Plan the work you have decided to do. FarmSaathi will not schedule anything without your say-so.", newTitle: "Add a task." },
  irrigation: { singular: "Irrigation record", plural: "Water records", description: "Keep track of watering you have carried out or observed.", newTitle: "Record watering." },
  inputs: { singular: "Input record", plural: "Inputs", description: "Record the seeds, fertilizer or other inputs you have used.", newTitle: "Record an input." },
  expenses: { singular: "Expense", plural: "Expenses", description: "Keep a clear record of costs linked to your farm and crop cycles.", newTitle: "Add an expense." },
  health: { singular: "Health observation", plural: "Crop health", description: "Save observations and images. The connected API does not have a diagnosis model configured.", newTitle: "Record a crop observation." },
  harvests: { singular: "Harvest", plural: "Harvests", description: "Record produce you actually harvested before creating a marketplace listing.", newTitle: "Record a harvest." },
};
const basePath: Record<RecordKind, string> = { tasks: "/farmer/tasks", irrigation: "/farmer/irrigation", inputs: "/farmer/inputs", expenses: "/farmer/expenses", health: "/farmer/health", harvests: "/farmer/harvests" };
const dateText = (v: unknown) => v ? formatDate(String(v), { day: "numeric", month: "short", year: "numeric" }) : "Not recorded";
const nice = (v: unknown) => String(v ?? "Not recorded").replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
const rowTitle = (item: IdRecord) => String(item.title || item.name || item.crop_name || item.report_type || "Farm record");

function fetchList(kind: RecordKind, params: Record<string, string | number | boolean | null | undefined>) {
  if (kind === "tasks") return api.records.tasks(params);
  if (kind === "irrigation") return api.records.irrigation(params);
  if (kind === "inputs") return api.records.inputs(params);
  if (kind === "expenses") return api.records.expenses(params);
  if (kind === "health") return api.records.health(params);
  return api.records.harvests(params);
}

export function RecordListPage({ kind }: { kind: RecordKind }) {
  const [status, setStatus] = useState("");
  const queryParams = useMemo(() => ({ limit: 50, offset: 0, ...(kind === "tasks" && status ? { status } : {}), ...(new URLSearchParams(window.location.search).get("crop_id") ? { crop_id: new URLSearchParams(window.location.search).get("crop_id")! } : {}) }), [kind, status]);
  const query = useQuery({ queryKey: ["records", kind, queryParams], queryFn: () => fetchList(kind, queryParams) });
  const tasks = useTasks({}, kind === "tasks"); const qc = useQueryClient();
  const taskAction = useMutation({ mutationFn: (id: string) => api.records.taskAction(id, "complete"), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["records", "tasks"] }); await qc.invalidateQueries({ queryKey: qk.dashboard }); toast.success("Task marked complete."); }, onError: e => toast.error(errorMessage(e)) });
  const spec = labels[kind]; const path = basePath[kind];
  return <PageSurface><PageHeading eyebrow="FARM RECORDS" title={spec.plural} subtitle={spec.description} action={<Link className="button button-primary" href={`${path}/new`}><Plus size={16} /> Add {spec.singular.toLowerCase()}</Link>} />
    {kind === "tasks" && <div className="filter-row"><span className="filter-label">STATUS</span>{["", "pending", "completed", "skipped"].map(value => <button key={value || "all"} className={`filter-chip ${status === value ? "selected" : ""}`} onClick={() => setStatus(value)}>{value ? nice(value) : "All tasks"}</button>)}</div>}
    {query.isLoading ? <LoadingState label={`Loading ${spec.plural.toLowerCase()}…`} /> : query.isError ? <ErrorState message={errorMessage(query.error)} retry={() => void query.refetch()} /> : query.data?.items.length ? <div className="record-list-page"><Card><div className="record-list-top"><span>{query.data.total} {query.data.total === 1 ? spec.singular.toLowerCase() : spec.plural.toLowerCase()}</span><span>Sorted by {kind === "tasks" ? "due date" : "record date"}</span></div><div className="record-table-wrap"><table className="record-table"><thead><tr><th>RECORD</th><th>RELATED CROP</th><th>{kind === "tasks" ? "DUE DATE" : kind === "harvests" ? "HARVESTED" : "RECORDED"}</th><th>DETAIL</th><th>STATUS</th><th /></tr></thead><tbody>{query.data.items.map((item, index) => <tr key={recordId(item) || index}><td><div className="table-primary"><span className={`table-glyph glyph-${index % 4}`}><Sprout size={16} /></span><strong>{rowTitle(item)}</strong></div></td><td>{String(item.crop_name || item.crop_id || "—")}</td><td>{dateText(item.due_date || item.harvested_at || item.date || item.created_at)}</td><td>{kind === "harvests" ? `${String(item.quantity || 0)} ${String(item.unit || "kg")}` : kind === "expenses" ? `${String(item.currency || "INR")} ${String(item.amount ?? "—")}` : kind === "health" ? String(item.diagnosis_status || "Review required") : String(item.description || item.notes || item.water_amount || item.quantity || "—")}</td><td><Badge kind={item.status === "completed" || item.diagnosis_status === "resolved" ? "success" : item.status === "pending" || item.review_required ? "warning" : "neutral"}>{nice(item.status || item.diagnosis_status || (item.review_required ? "review_required" : "recorded"))}</Badge></td><td>{kind === "tasks" && item.status !== "completed" && item.status !== "skipped" ? <Button variant="ghost" className="table-action" disabled={taskAction.isPending} onClick={() => taskAction.mutate(recordId(item))}><Check size={15} /> Complete</Button> : <span className="muted-icon">—</span>}</td></tr>)}</tbody></table></div></Card><div className="record-source-note">Data shown is returned directly from your FarmSaathi account.</div></div> : <EmptyState title={`No ${spec.plural.toLowerCase()} saved yet`} description={kind === "health" ? "Save what you observed. Any result will be clearly marked; automated diagnosis is not currently configured." : `Once you add a ${spec.singular.toLowerCase()}, it will appear here with its linked farm and crop context.`} action={<Link className="button button-primary" href={`${path}/new`}><Plus size={16} /> Add {spec.singular.toLowerCase()}</Link>} />}
  </PageSurface>;
}

export function RecordCreatePage({ kind }: { kind: RecordKind }) {
  const [, setLocation] = useLocation(); const qc = useQueryClient(); const crops = useCrops(); const spec = labels[kind]; const path = basePath[kind];
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState(""); const [uploadId, setUploadId] = useState(""); const [uploading, setUploading] = useState(false);
  const create = useMutation({ mutationFn: async (payload: Record<string, unknown>) => {
    if (kind === "tasks") return api.records.createTask(payload);
    if (kind === "irrigation") return api.records.createIrrigation(payload);
    if (kind === "inputs") return api.records.createInput(payload);
    if (kind === "expenses") return api.records.createExpense(payload);
    if (kind === "health") {
      if (payload.image_upload_id) {
        return api.records.createDiseaseReport(payload);
      }
      return api.records.createHealth(payload);
    }
    return api.records.createHarvest(payload);
  }, onSuccess: async (result: any) => {
    await qc.invalidateQueries({ queryKey: ["records", kind] });
    await qc.invalidateQueries({ queryKey: qk.dashboard });
    if (kind === "harvests") await qc.invalidateQueries({ queryKey: ["records", "harvests"] });
    if (kind === "health" && result?.diagnosis_status === "diagnosed" && result?.result) {
      toast.success(`Analysis: ${result.result}${result.confidence ? ` (${result.confidence}% confidence)` : ""}`);
    } else {
      toast.success(`${spec.singular} saved.`);
    }
    setLocation(path);
  }, onError: e => toast.error(errorMessage(e)) });
  async function choosePhoto(candidate?: File) {
    if (!candidate) return;
    if (!/^image\/(jpeg|png|webp)$/.test(candidate.type)) { toast.error("Choose a JPEG, PNG or WebP image."); return; }
    if (candidate.size > 8 * 1024 * 1024) { toast.error("Choose an image smaller than 8 MB."); return; }
    setFile(candidate); setPreview(URL.createObjectURL(candidate)); setUploadId(""); setUploading(true);
    try { const uploaded = await api.support.upload(candidate); setUploadId(uploaded.upload_id); toast.success("Image uploaded securely."); }
    catch (error) { setUploadId(""); toast.error(errorMessage(error)); }
    finally { setUploading(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fd = new FormData(event.currentTarget); const cropId = String(fd.get("crop_id") || "");
    if (kind !== "expenses" && !cropId && ["tasks", "irrigation", "inputs", "health", "harvests"].includes(kind)) { toast.error("Choose a crop record first."); return; }
    const dateVal = (key: string) => String(fd.get(key) || "");
    let payload: Record<string, unknown> = { crop_id: cropId || undefined, field_id: fd.get("field_id") || undefined, notes: fd.get("notes") || undefined };
    if (kind === "tasks") payload = { ...payload, title: String(fd.get("title") || "").trim(), description: fd.get("description") || undefined, due_date: dateVal("due_date"), priority: fd.get("priority") || "normal" };
    else if (kind === "irrigation") payload = { ...payload, name: "Irrigation", date: dateVal("date"), water_amount: fd.get("water_amount") ? Number(fd.get("water_amount")) : undefined, water_unit: fd.get("water_unit"), method: fd.get("method") || undefined, duration_minutes: fd.get("duration") ? Number(fd.get("duration")) : undefined };
    else if (kind === "inputs") payload = { ...payload, name: String(fd.get("name") || "").trim(), date: dateVal("date"), input_type: fd.get("input_type"), quantity: fd.get("quantity") ? Number(fd.get("quantity")) : undefined, unit: fd.get("unit"), cost: fd.get("cost") ? Number(fd.get("cost")) : undefined, currency: "INR" };
    else if (kind === "expenses") payload = { ...payload, name: String(fd.get("name") || "").trim(), date: dateVal("date"), category: fd.get("category"), amount: Number(fd.get("amount")), currency: "INR", payment_method: fd.get("payment_method") || undefined };
    else if (kind === "health") payload = { crop_id: cropId, symptoms: String(fd.get("symptoms") || "").split(",").map(v => v.trim()).filter(Boolean), image_upload_id: uploadId || undefined, notes: fd.get("notes") || undefined };
    else payload = { ...payload, quantity: Number(fd.get("quantity")), unit: fd.get("unit"), harvested_at: dateVal("harvested_at"), quality_grade: fd.get("quality_grade") || undefined, notes: fd.get("notes") || undefined };
    create.mutate(payload);
  }
  const queryField = new URLSearchParams(window.location.search).get("crop_id") || "";
  const cropOptions = (crops.data?.items || []).map(crop => ({ value: recordId(crop), label: `${crop.crop_name}${crop.variety ? ` · ${String(crop.variety)}` : ""}` }));
  return <PageSurface><Link href={path} className="back-link"><ArrowLeft size={15} /> {spec.plural}</Link><PageHeading eyebrow="FARM RECORDS" title={spec.newTitle} subtitle={kind === "health" ? "Describe symptoms and attach an image. FarmSaathi evaluates the photo with our calibrated plant health CV model." : spec.description} />
    {crops.isLoading && kind !== "expenses" && <LoadingState label="Loading your crop records…" />}
    {crops.isError && kind !== "expenses" && <ErrorState message="Crop records could not be loaded." retry={() => void crops.refetch()} />}
    <Card className="form-card"><form onSubmit={submit} className="record-form">
      {kind !== "expenses" && <SelectInput label="Related crop" id="record-crop" name="crop_id" required defaultValue={queryField} options={cropOptions} />}
      {kind === "tasks" && <div className="form-grid"><TextInput label="Task title" id="task-title" name="title" required placeholder="e.g. Check drip lines" /><TextInput label="Due date & time" id="task-due" name="due_date" type="datetime-local" required /><SelectInput label="Priority" id="task-priority" name="priority" defaultValue="normal" options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }]} /><TextInput label="Description" id="task-description" name="description" placeholder="Optional details" /></div>}
      {kind === "irrigation" && <div className="form-grid"><TextInput label="Record date" id="irrigation-date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /><TextInput label="Water amount" id="irrigation-amount" name="water_amount" type="number" min="0" step="0.1" placeholder="Optional" /><SelectInput label="Water unit" id="irrigation-unit" name="water_unit" defaultValue="litre" options={[{ value: "litre", label: "Litres" }, { value: "mm", label: "Millimetres" }, { value: "hour", label: "Hours" }]} /><SelectInput label="Method" id="irrigation-method" name="method" options={[{ value: "drip", label: "Drip" }, { value: "sprinkler", label: "Sprinkler" }, { value: "flood", label: "Flood" }, { value: "manual", label: "Manual" }, { value: "other", label: "Other" }]} /><TextInput label="Duration (minutes)" id="irrigation-duration" name="duration" type="number" min="0" placeholder="Optional" /></div>}
      {kind === "inputs" && <div className="form-grid"><TextInput label="Input name" id="input-name" name="name" required placeholder="e.g. Compost" /><SelectInput label="Input type" id="input-type" name="input_type" options={[{ value: "seed", label: "Seed" }, { value: "fertilizer", label: "Fertilizer" }, { value: "pesticide", label: "Pesticide" }, { value: "organic", label: "Organic input" }, { value: "other", label: "Other" }]} /><TextInput label="Quantity" id="input-quantity" name="quantity" type="number" min="0" step="0.1" placeholder="Optional" /><TextInput label="Unit" id="input-unit" name="unit" placeholder="kg, litre, packet…" /><TextInput label="Cost (INR)" id="input-cost" name="cost" type="number" min="0" step="0.01" placeholder="Optional" /><TextInput label="Record date" id="input-date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>}
      {kind === "expenses" && <div className="form-grid"><TextInput label="Expense name" id="expense-name" name="name" required placeholder="e.g. Seed purchase" /><TextInput label="Amount (INR)" id="expense-amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" /><SelectInput label="Category" id="expense-category" name="category" options={[{ value: "labor", label: "Labour" }, { value: "inputs", label: "Farm inputs" }, { value: "irrigation", label: "Water & irrigation" }, { value: "transport", label: "Transport" }, { value: "equipment", label: "Equipment" }, { value: "other", label: "Other" }]} /><TextInput label="Date" id="expense-date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /><SelectInput label="Payment method" id="expense-payment" name="payment_method" options={[{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "bank", label: "Bank transfer" }, { value: "other", label: "Other" }]} /></div>}
      {kind === "health" && <><TextInput label="What have you noticed?" id="health-symptoms" name="symptoms" placeholder="Separate observations with commas" hint="Describe what you observed; an image enables computer vision diagnosis." /><div className="upload-area"><input id="health-image" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void choosePhoto(event.target.files?.[0])} /><label htmlFor="health-image" className={`upload-pick ${uploading ? "is-uploading" : ""}`}>{uploading ? <LoaderCircle className="spin" size={21} /> : file ? <FileImage size={21} /> : <Upload size={21} />}<strong>{uploading ? "Uploading image securely…" : file ? file.name : "Add a photo for AI disease diagnosis"}</strong><span>JPEG, PNG or WebP · up to 8 MB</span><span className="button button-secondary">Choose image</span></label>{preview && <div className="image-preview"><img src={preview} alt="Selected crop observation preview" />{uploadId && <Badge kind="success">Uploaded</Badge>}<button type="button" className="icon-button" aria-label="Remove image" onClick={() => { setFile(null); setPreview(""); setUploadId(""); }}><X size={15} /></button></div>}</div><div className="diagnosis-disclaimer"><span className="disclaimer-mark">i</span><span><strong>Calibrated Plant Disease Vision:</strong> Attaching an image triggers inference through FarmSaathi's deep vision model for diagnosis, severity analysis and recommended actions.</span></div></>}
      {kind === "harvests" && <div className="form-grid"><TextInput label="Harvested quantity" id="harvest-quantity" name="quantity" type="number" min="0.01" step="0.1" required placeholder="e.g. 240" /><SelectInput label="Unit" id="harvest-unit" name="unit" defaultValue="kg" options={[{ value: "kg", label: "Kilograms" }, { value: "quintal", label: "Quintals" }, { value: "tonne", label: "Tonnes" }, { value: "piece", label: "Pieces" }]} /><TextInput label="Harvested at" id="harvested-at" name="harvested_at" type="datetime-local" required defaultValue={new Date().toISOString().slice(0, 16)} /><SelectInput label="Quality grade" id="harvest-grade" name="quality_grade" options={[{ value: "premium", label: "Premium" }, { value: "A", label: "Grade A" }, { value: "B", label: "Grade B" }, { value: "standard", label: "Standard" }, { value: "ungraded", label: "Not graded" }]} /></div>}
      <TextArea label={kind === "health" ? "Additional notes" : "Notes"} id="record-notes" name="notes" rows={3} placeholder="Optional details to keep with this record" />
      <div className="form-actions"><Link href={path} className="button button-ghost">Cancel</Link><Button type="submit" disabled={create.isPending || uploading || (kind !== "expenses" && !cropOptions.length)}>{create.isPending ? "Saving…" : `Save ${spec.singular.toLowerCase()}`}<ArrowRight size={16} /></Button></div>
    </form></Card>
    {kind === "harvests" && <div className="form-note">Only create a listing after this harvest record is saved. Listing quantities are checked against your recorded harvest by the backend.</div>}
  </PageSurface>;
}
