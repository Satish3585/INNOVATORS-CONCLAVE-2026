import { useState, useId, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileCheck,
  FileImage,
  FileSpreadsheet,
  FileText,
  History,
  Info,
  Leaf,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  errorMessage,
  recordId,
  type Field,
  type SoilExplanation,
  type SoilTest,
} from "@/lib/api";
import { useFarms, useFields, useCrops } from "@/hooks/useFarmData";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeading,
  PageSurface,
  SectionHeading,
  SelectInput,
  StatCard,
  TextArea,
  TextInput,
} from "@/components/FarmUI";
import { formatDate } from "@/lib/locale";

const fmtDate = (v?: string | null) =>
  v ? formatDate(v, { day: "numeric", month: "short", year: "numeric" }) : "—";

export function SoilTestPage({ fieldId, initialFieldId }: { fieldId?: string; initialFieldId?: string }) {
  const defaultFieldId = initialFieldId || fieldId || "";
  const [activeTab, setActiveTab] = useState<"manual" | "upload" | "history">("manual");
  const [selectedFieldId, setSelectedFieldId] = useState(defaultFieldId);
  const [selectedTest, setSelectedTest] = useState<SoilTest | null>(null);
  const [lastExplanation, setLastExplanation] = useState<SoilExplanation | null>(null);

  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  // Load fields
  const farmsQuery = useFarms();
  const fieldsQuery = useQuery({
    queryKey: ["all-fields-soil"],
    queryFn: async () => {
      const farms = await api.farms.list({ limit: 50 });
      const pages = await Promise.all(
        farms.items.map(f => api.farms.fields(recordId(f), { limit: 100 }))
      );
      return pages.flatMap(p => p.items);
    },
  });

  const activeField = fieldsQuery.data?.find(f => recordId(f) === (selectedFieldId || initialFieldId));
  const effectiveFieldId = selectedFieldId || initialFieldId || (fieldsQuery.data?.[0] ? recordId(fieldsQuery.data[0]) : "");

  // Soil History query
  const historyQuery = useQuery({
    queryKey: ["soil-history", effectiveFieldId],
    queryFn: () => api.soilTests.history(effectiveFieldId),
    enabled: Boolean(effectiveFieldId),
  });

  return (
    <PageSurface>
      <div className="flex items-center gap-2 mb-2">
        <Link href={effectiveFieldId ? `/farmer/fields/${effectiveFieldId}` : "/farmer/farms"} className="back-link">
          <ArrowLeft size={15} /> {activeField ? `Back to ${activeField.name}` : "Back to Farm"}
        </Link>
        <span style={{ color: "#94a3b8" }}>/</span>
        <span style={{ fontSize: "0.88rem", color: "#64748b", fontWeight: 500 }}>Soil Health & Testing</span>
      </div>

      <PageHeading
        eyebrow="FIELD DIAGNOSTICS & NPK"
        title="Soil Health & Soil Testing."
        subtitle="Record accurate soil parameters manually, extract test values from lab reports, and get clear agronomic explanations."
        action={
          <div className="flex gap-2">
            <Button
              variant={activeTab === "manual" ? "primary" : "secondary"}
              onClick={() => setActiveTab("manual")}
            >
              <Plus size={16} /> Enter Manually
            </Button>
            <Button
              variant={activeTab === "upload" ? "primary" : "secondary"}
              onClick={() => setActiveTab("upload")}
            >
              <Upload size={16} /> Upload Lab Report
            </Button>
            <Button
              variant={activeTab === "history" ? "primary" : "secondary"}
              onClick={() => setActiveTab("history")}
            >
              <History size={16} /> View History
            </Button>
          </div>
        }
      />

      {/* Field selector if not pre-locked */}
      {!initialFieldId && fieldsQuery.data && fieldsQuery.data.length > 1 && (
        <Card className="mb-4" style={{ padding: "0.85rem 1.25rem", background: "#f8fafc" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "#334155" }}>
              Active Field:
            </span>
            <select
              value={effectiveFieldId}
              onChange={e => {
                setSelectedFieldId(e.target.value);
                setSelectedTest(null);
                setLastExplanation(null);
              }}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.9rem",
                fontWeight: 500,
                background: "#ffffff",
                minWidth: "220px",
              }}
            >
              {fieldsQuery.data.map(f => (
                <option key={recordId(f)} value={recordId(f)}>
                  {f.name} ({f.area} {f.area_unit || "acre"}) · {f.soil_type || "Soil type unset"}
                </option>
              ))}
            </select>
            {activeField && (
              <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
                Current pH: <strong>{activeField.soil_ph ?? "Not set"}</strong> · Soil: <strong>{activeField.soil_type || "Not set"}</strong>
              </span>
            )}
          </div>
        </Card>
      )}

      {/* Main Tab Content */}
      {activeTab === "manual" && (
        <ManualSoilEntryForm
          fieldId={effectiveFieldId}
          fieldName={activeField?.name}
          onSaved={(test, explanation) => {
            setSelectedTest(test);
            setLastExplanation(explanation);
            qc.invalidateQueries({ queryKey: ["soil-history", effectiveFieldId] });
            qc.invalidateQueries({ queryKey: ["all-fields-soil"] });
            toast.success("Soil test saved successfully.");
          }}
        />
      )}

      {activeTab === "upload" && (
        <SoilReportUploadWorkflow
          fieldId={effectiveFieldId}
          fieldName={activeField?.name}
          onSaved={(test, explanation) => {
            setSelectedTest(test);
            setLastExplanation(explanation);
            qc.invalidateQueries({ queryKey: ["soil-history", effectiveFieldId] });
            qc.invalidateQueries({ queryKey: ["all-fields-soil"] });
            toast.success("Verified soil report test saved successfully.");
          }}
        />
      )}

      {activeTab === "history" && (
        <SoilHistorySection
          fieldId={effectiveFieldId}
          historyQuery={historyQuery}
          onSelectTest={test => {
            setSelectedTest(test);
            setLastExplanation(test.explanation || null);
          }}
        />
      )}

      {/* Real-time Agricultural Explanation Card */}
      {lastExplanation && (
        <SoilExplanationView
          explanation={lastExplanation}
          test={selectedTest}
          onClose={() => setLastExplanation(null)}
        />
      )}
    </PageSurface>
  );
}

// -------------------------------------------------------------
// Component: Manual Soil Entry Form
// -------------------------------------------------------------
function ManualSoilEntryForm({
  fieldId,
  fieldName,
  onSaved,
}: {
  fieldId: string;
  fieldName?: string;
  onSaved: (test: SoilTest, explanation: SoilExplanation) => void;
}) {
  const qc = useQueryClient();
  const cropsQuery = useCrops(fieldId ? { field_id: fieldId } : {});

  const [saving, setSaving] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.soilTests.create(payload),
    onSuccess: (data: SoilTest) => {
      if (data.explanation) {
        onSaved(data, data.explanation);
      }
    },
    onError: e => toast.error(errorMessage(e)),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fieldId) {
      toast.error("Please select a field first.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const phVal = fd.get("ph") ? Number(fd.get("ph")) : undefined;
    if (phVal !== undefined && (phVal < 0 || phVal > 14)) {
      toast.error("Soil pH must be between 0 and 14.");
      return;
    }

    const payload = {
      field_id: fieldId,
      test_date: fd.get("test_date") || new Date().toISOString().slice(0, 10),
      test_source: fd.get("test_source") || "manual",
      soil_type: fd.get("soil_type") || undefined,
      ph: phVal,
      nitrogen: fd.get("nitrogen") ? Number(fd.get("nitrogen")) : undefined,
      phosphorus: fd.get("phosphorus") ? Number(fd.get("phosphorus")) : undefined,
      potassium: fd.get("potassium") ? Number(fd.get("potassium")) : undefined,
      electrical_conductivity: fd.get("electrical_conductivity") ? Number(fd.get("electrical_conductivity")) : undefined,
      organic_carbon: fd.get("organic_carbon") ? Number(fd.get("organic_carbon")) : undefined,
      moisture_percentage: fd.get("moisture_percentage") ? Number(fd.get("moisture_percentage")) : undefined,
      sulfur: fd.get("sulfur") ? Number(fd.get("sulfur")) : undefined,
      zinc: fd.get("zinc") ? Number(fd.get("zinc")) : undefined,
      iron: fd.get("iron") ? Number(fd.get("iron")) : undefined,
      selected_crop: fd.get("selected_crop") || undefined,
      growth_stage: fd.get("growth_stage") || undefined,
      previous_crop: fd.get("previous_crop") || undefined,
      notes: fd.get("notes") || undefined,
      extracted_from_report: false,
      verified_by_farmer: true,
    };

    saveMutation.mutate(payload);
  }

  const cropOptions = (cropsQuery.data?.items || []).map(c => ({
    value: c.crop_name,
    label: `${c.crop_name}${c.variety ? ` · ${c.variety}` : ""}`,
  }));

  return (
    <Card className="form-card">
      <SectionHeading
        title={`Enter Soil Test Parameters ${fieldName ? `for ${fieldName}` : ""}`}
        note="Every field indicates its unit, benchmark, and optional/required status. Standard values are verified before saving."
      />
      <form onSubmit={handleSubmit} className="record-form">
        {/* Core Primary Parameters */}
        <div style={{ marginBottom: "1.25rem" }}>
          <h4 style={{ fontSize: "0.92rem", fontWeight: 600, color: "#1e293b", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: "#16a34a" }}>●</span> Primary Soil Parameters & Macro-Nutrients
          </h4>
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.85rem" }}>
            <TextInput
              label="Soil pH (0.0 – 14.0)"
              id="soil-ph"
              name="ph"
              type="number"
              step="0.01"
              min="0"
              max="14"
              required
              placeholder="e.g. 6.8"
              hint="Required · Optimal range 6.0 – 7.5"
            />
            <TextInput
              label="Available Nitrogen (N) (kg/ha)"
              id="soil-n"
              name="nitrogen"
              type="number"
              step="0.1"
              min="0"
              placeholder="e.g. 240.0"
              hint="Optional · Low <280 | Med 280-560 | High >560"
            />
            <TextInput
              label="Available Phosphorus (P) (kg/ha)"
              id="soil-p"
              name="phosphorus"
              type="number"
              step="0.1"
              min="0"
              placeholder="e.g. 35.0"
              hint="Optional · Low <10 | Med 10-25 | High >25"
            />
            <TextInput
              label="Available Potassium (K) (kg/ha)"
              id="soil-k"
              name="potassium"
              type="number"
              step="0.1"
              min="0"
              placeholder="e.g. 180.0"
              hint="Optional · Low <110 | Med 110-280 | High >280"
            />
          </div>
        </div>

        {/* Secondary Parameters: OC, EC, Moisture */}
        <div style={{ marginBottom: "1.25rem", borderTop: "1px solid #f1f5f9", paddingTop: "1rem" }}>
          <h4 style={{ fontSize: "0.92rem", fontWeight: 600, color: "#1e293b", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: "#2563eb" }}>●</span> Soil Organic Matter & Salinity
          </h4>
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.85rem" }}>
            <TextInput
              label="Organic Carbon (%)"
              id="soil-oc"
              name="organic_carbon"
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="e.g. 0.72"
              hint="Optional · Benchmark: Low <0.5% | Med 0.5-0.75% | High >0.75%"
            />
            <TextInput
              label="Electrical Conductivity (EC) (dS/m)"
              id="soil-ec"
              name="electrical_conductivity"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 0.45"
              hint="Optional · Normal <1.0 dS/m | Saline stress >2.0 dS/m"
            />
            <TextInput
              label="Soil Moisture (%)"
              id="soil-moist"
              name="moisture_percentage"
              type="number"
              step="0.1"
              min="0"
              max="100"
              placeholder="e.g. 18.5"
              hint="Optional · Volumetric moisture"
            />
            <TextInput
              label="Soil Texture / Type"
              id="soil-type"
              name="soil_type"
              placeholder="e.g. Red Loam, Black Cotton, Clay Loam"
              hint="Optional field texture"
            />
          </div>
        </div>

        {/* Optional Micronutrients */}
        <div style={{ marginBottom: "1.25rem", borderTop: "1px solid #f1f5f9", paddingTop: "1rem" }}>
          <h4 style={{ fontSize: "0.92rem", fontWeight: 600, color: "#475569", marginBottom: "0.75rem" }}>
            Micronutrients (Optional, from laboratory assay)
          </h4>
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.85rem" }}>
            <TextInput label="Sulfur (S) (ppm)" id="soil-s" name="sulfur" type="number" step="0.1" placeholder="Optional" />
            <TextInput label="Zinc (Zn) (ppm)" id="soil-zn" name="zinc" type="number" step="0.1" placeholder="Optional" />
            <TextInput label="Iron (Fe) (ppm)" id="soil-fe" name="iron" type="number" step="0.1" placeholder="Optional" />
          </div>
        </div>

        {/* Crop & Test Context */}
        <div style={{ marginBottom: "1.25rem", borderTop: "1px solid #f1f5f9", paddingTop: "1rem" }}>
          <h4 style={{ fontSize: "0.92rem", fontWeight: 600, color: "#1e293b", marginBottom: "0.75rem" }}>
            Crop Context & Test Verification
          </h4>
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.85rem" }}>
            <TextInput
              label="Date of Test"
              id="soil-date"
              name="test_date"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
            <SelectInput
              label="Source of Test"
              id="soil-source"
              name="test_source"
              defaultValue="manual"
              options={[
                { value: "manual", label: "Manual farmer observation" },
                { value: "lab_report", label: "Government / Private Ag Lab Report" },
                { value: "soil_health_card", label: "Soil Health Card (SHC)" },
                { value: "field_kit", label: "Digital Field Testing Kit" },
                { value: "other", label: "Other verified source" },
              ]}
            />
            {cropOptions.length > 0 ? (
              <SelectInput
                label="Target / Current Crop"
                id="soil-crop"
                name="selected_crop"
                options={[{ value: "", label: "General Farm Soil" }, ...cropOptions]}
              />
            ) : (
              <TextInput
                label="Target / Current Crop"
                id="soil-crop"
                name="selected_crop"
                placeholder="e.g. Tomato, Rice, Chilli"
                hint="Used for tailored suitability check"
              />
            )}
            <SelectInput
              label="Crop Growth Stage"
              id="soil-stage"
              name="growth_stage"
              options={[
                { value: "pre_sowing", label: "Pre-sowing / Land Prep" },
                { value: "seedling", label: "Seedling / Vegetative" },
                { value: "flowering", label: "Flowering" },
                { value: "fruit_development", label: "Fruiting / Grain Fill" },
                { value: "post_harvest", label: "Post-Harvest" },
              ]}
            />
            <TextInput
              label="Previous Crop Grown"
              id="soil-prev"
              name="previous_crop"
              placeholder="e.g. Chickpea, Onion, Cotton"
              hint="Considers legume N-fixation or pest cycles"
            />
          </div>
        </div>

        <TextArea
          label="Laboratory / Soil Notes"
          id="soil-notes"
          name="notes"
          rows={2}
          placeholder="Any notes from testing agency or observations regarding soil moisture/condition"
        />

        <div className="form-actions" style={{ marginTop: "1rem" }}>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <LoaderCircle className="spin" size={16} /> Saving & Evaluating…
              </>
            ) : (
              <>
                Save & Explain Soil Health <ArrowRight size={16} />
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// -------------------------------------------------------------
// Component: Soil Report Upload Workflow
// -------------------------------------------------------------
function SoilReportUploadWorkflow({
  fieldId,
  fieldName,
  onSaved,
}: {
  fieldId: string;
  fieldName?: string;
  onSaved: (test: SoilTest, explanation: SoilExplanation) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [uploadId, setUploadId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);

  // Form state for verification/editing
  const [ph, setPh] = useState<string>("");
  const [n, setN] = useState<string>("");
  const [p, setP] = useState<string>("");
  const [k, setK] = useState<string>("");
  const [ec, setEc] = useState<string>("");
  const [oc, setOc] = useState<string>("");
  const [moisture, setMoisture] = useState<string>("");
  const [testDate, setTestDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [testSource, setTestSource] = useState<string>("lab_report");
  const [selectedCrop, setSelectedCrop] = useState<string>("");

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.soilTests.create(payload),
    onSuccess: (data: SoilTest) => {
      // Also register document in Document Center automatically
      if (uploadId) {
        api.documents.create({
          name: file?.name || "Soil Test Lab Report",
          doc_type: "soil_test_report",
          file_upload_id: uploadId,
          field_id: fieldId,
          notes: `Verified test recorded on ${testDate}`,
        }).catch(() => null);
      }
      if (data.explanation) {
        onSaved(data, data.explanation);
      }
    },
    onError: e => toast.error(errorMessage(e)),
  });

  async function handleFileSelect(selected?: File) {
    if (!selected) return;
    const isPdf = selected.type === "application/pdf" || selected.name.toLowerCase().endsWith(".pdf");
    const isImg = /^image\/(jpeg|png|webp)$/.test(selected.type);

    if (!isPdf && !isImg) {
      toast.error("Please upload a PDF document or a JPEG/PNG/WebP image.");
      return;
    }
    if (selected.size > 15 * 1024 * 1024) {
      toast.error("Report file must be smaller than 15 MB.");
      return;
    }

    setFile(selected);
    if (isImg) {
      setPreviewUrl(URL.createObjectURL(selected));
    } else {
      setPreviewUrl("");
    }

    setUploading(true);
    setExtracting(true);
    setExtractedData(null);

    try {
      // 1. Upload file securely to backend
      const uploadRes = await api.support.upload(selected);
      setUploadId(uploadRes.upload_id);
      toast.success("Report uploaded securely.");

      // 2. Extract values via server-side pypdf & parser
      const extraction = await api.soilTests.extract(uploadRes.upload_id);
      setExtractedData(extraction);

      const vals = extraction.extracted_values || {};
      if (vals.ph != null) setPh(String(vals.ph));
      if (vals.nitrogen != null) setN(String(vals.nitrogen));
      if (vals.phosphorus != null) setP(String(vals.phosphorus));
      if (vals.potassium != null) setK(String(vals.potassium));
      if (vals.electrical_conductivity != null) setEc(String(vals.electrical_conductivity));
      if (vals.organic_carbon != null) setOc(String(vals.organic_carbon));
      if (vals.moisture_percentage != null) setMoisture(String(vals.moisture_percentage));
      if (vals.test_date) setTestDate(String(vals.test_date));

      if (extraction.fields_found?.length > 0) {
        toast.success(`Extracted ${extraction.fields_found.length} soil parameters. Please review below.`);
      } else {
        toast.info("Report file saved. Standard text values were not automatically recognized; please enter values from your report.");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  }

  function handleConfirmSave(e: FormEvent) {
    e.preventDefault();
    if (!fieldId) {
      toast.error("Please select a field first.");
      return;
    }
    if (!ph && !n && !p && !k) {
      toast.error("Please enter at least pH or NPK values before saving.");
      return;
    }

    const payload = {
      field_id: fieldId,
      document_upload_id: uploadId || undefined,
      test_date: testDate,
      test_source: testSource,
      ph: ph ? Number(ph) : undefined,
      nitrogen: n ? Number(n) : undefined,
      phosphorus: p ? Number(p) : undefined,
      potassium: k ? Number(k) : undefined,
      electrical_conductivity: ec ? Number(ec) : undefined,
      organic_carbon: oc ? Number(oc) : undefined,
      moisture_percentage: moisture ? Number(moisture) : undefined,
      selected_crop: selectedCrop || undefined,
      extracted_from_report: true,
      verified_by_farmer: true,
    };

    saveMutation.mutate(payload);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Upload Box */}
      <Card>
        <SectionHeading
          title="Upload Soil Test Lab Report"
          note="Upload your official Soil Health Card (SHC) or laboratory analysis report (PDF, JPG, PNG up to 15 MB). FarmAI reads the parameters and displays them for your review."
        />

        <div className="upload-area" style={{ marginTop: "0.5rem" }}>
          <input
            id="soil-report-file"
            className="sr-only"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={e => void handleFileSelect(e.target.files?.[0])}
          />
          <label htmlFor="soil-report-file" className={`upload-pick ${uploading ? "is-uploading" : ""}`}>
            {uploading || extracting ? (
              <LoaderCircle className="spin" size={26} color="#16a34a" />
            ) : file ? (
              <FileCheck size={26} color="#16a34a" />
            ) : (
              <Upload size={26} />
            )}
            <strong>
              {uploading
                ? "Uploading report safely…"
                : extracting
                ? "Reading & extracting soil parameters…"
                : file
                ? file.name
                : "Select Soil Test Report (PDF or Photo)"}
            </strong>
            <span>PDF, JPEG, PNG or WebP · Up to 15 MB</span>
            <span className="button button-secondary">
              {file ? "Change report file" : "Choose document"}
            </span>
          </label>
        </div>

        {/* Informative Note */}
        <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.82rem", color: "#475569", display: "flex", gap: "0.65rem", alignItems: "flex-start" }}>
          <Info size={16} color="#2563eb" style={{ marginTop: "2px", flexShrink: 0 }} />
          <div>
            <strong>Verification Policy:</strong> FarmAI never blindly commits unverified OCR numbers to your permanent records. You can review all detected parameters against your document, correct any typos, and confirm before saving.
          </div>
        </div>
      </Card>

      {/* Review & Edit Extracted Values */}
      {(uploadId || extractedData) && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "#1e293b" }}>
                Verify & Confirm Extracted Soil Data
              </h3>
              <p style={{ fontSize: "0.82rem", color: "#64748b" }}>
                Compare the extracted values below against your uploaded report. Edit or add missing values as needed.
              </p>
            </div>
            {uploadId && (
              <a
                href={api.support.imageUrl(uploadId)}
                target="_blank"
                rel="noreferrer"
                className="button button-secondary"
                style={{ fontSize: "0.82rem" }}
              >
                <FileText size={14} /> Open Original Document
              </a>
            )}
          </div>

          {previewUrl && (
            <div style={{ marginBottom: "1.25rem", padding: "0.5rem", background: "#f1f5f9", borderRadius: "8px", textAlign: "center" }}>
              <img
                src={previewUrl}
                alt="Uploaded report preview"
                style={{ maxHeight: "240px", maxWidth: "100%", borderRadius: "6px", objectFit: "contain", margin: "0 auto" }}
              />
            </div>
          )}

          {extractedData?.preview_snippet && (
            <div style={{ marginBottom: "1.25rem", padding: "0.75rem", background: "#f8fafc", borderRadius: "6px", border: "1px dashed #cbd5e1" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
                Document Text Excerpt:
              </span>
              <p style={{ fontSize: "0.8rem", color: "#334155", marginTop: "0.25rem", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                {extractedData.preview_snippet}
              </p>
            </div>
          )}

          <form onSubmit={handleConfirmSave} className="record-form">
            <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.85rem" }}>
              <TextInput
                label="Soil pH"
                id="extract-ph"
                value={ph}
                onChange={e => setPh(e.target.value)}
                placeholder="e.g. 6.8"
                type="number"
                step="0.01"
                min="0"
                max="14"
                hint="0.0 – 14.0"
              />
              <TextInput
                label="Available Nitrogen (N) (kg/ha)"
                id="extract-n"
                value={n}
                onChange={e => setN(e.target.value)}
                placeholder="e.g. 240.0"
                type="number"
                step="0.1"
              />
              <TextInput
                label="Available Phosphorus (P) (kg/ha)"
                id="extract-p"
                value={p}
                onChange={e => setP(e.target.value)}
                placeholder="e.g. 35.0"
                type="number"
                step="0.1"
              />
              <TextInput
                label="Available Potassium (K) (kg/ha)"
                id="extract-k"
                value={k}
                onChange={e => setK(e.target.value)}
                placeholder="e.g. 180.0"
                type="number"
                step="0.1"
              />
              <TextInput
                label="Organic Carbon (%)"
                id="extract-oc"
                value={oc}
                onChange={e => setOc(e.target.value)}
                placeholder="e.g. 0.72"
                type="number"
                step="0.01"
              />
              <TextInput
                label="Electrical Conductivity (EC) (dS/m)"
                id="extract-ec"
                value={ec}
                onChange={e => setEc(e.target.value)}
                placeholder="e.g. 0.45"
                type="number"
                step="0.01"
              />
              <TextInput
                label="Test Date"
                id="extract-date"
                type="date"
                value={testDate}
                onChange={e => setTestDate(e.target.value)}
              />
              <TextInput
                label="Target Crop (Optional)"
                id="extract-crop"
                value={selectedCrop}
                onChange={e => setSelectedCrop(e.target.value)}
                placeholder="e.g. Tomato, Cotton, Rice"
              />
            </div>

            <div className="form-actions" style={{ marginTop: "1.25rem" }}>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <>
                    <LoaderCircle className="spin" size={16} /> Verifying & Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} /> Confirm & Save Verified Soil Data
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Component: Soil History & Chronological Comparison
// -------------------------------------------------------------
function SoilHistorySection({
  fieldId,
  historyQuery,
  onSelectTest,
}: {
  fieldId: string;
  historyQuery: any;
  onSelectTest: (test: SoilTest) => void;
}) {
  if (historyQuery.isLoading) return <LoadingState label="Loading soil history…" />;
  if (historyQuery.isError) return <ErrorState message="Could not load soil history." retry={() => void historyQuery.refetch()} />;

  const tests: SoilTest[] = historyQuery.data?.tests || [];
  const comp = historyQuery.data?.comparison;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Comparison Trends Card */}
      {comp?.comparison_available && comp.trends && (
        <Card style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)", border: "1px solid #bbf7d0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <div>
              <span className="eyebrow" style={{ color: "#166534" }}>SOIL TREND ANALYSIS</span>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#14532d" }}>
                Multi-Season Soil Comparison ({fmtDate(comp.initial_date)} → {fmtDate(comp.latest_date)})
              </h3>
            </div>
            <Badge kind="success">{comp.test_count} Tests Compared</Badge>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
            {Object.entries(comp.trends).map(([key, data]: [string, any]) => {
              const isUp = data.direction === "increased";
              const isDown = data.direction === "decreased";
              return (
                <div key={key} style={{ padding: "0.75rem", background: "#ffffff", borderRadius: "8px", border: "1px solid #dcfce7" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: "0.85rem", textTransform: "uppercase", color: "#475569" }}>
                      {key === "ph" ? "Soil pH" : key.toUpperCase()}
                    </strong>
                    {isUp ? (
                      <span style={{ display: "flex", alignItems: "center", color: "#16a34a", fontSize: "0.78rem", fontWeight: 600 }}>
                        <TrendingUp size={14} /> +{data.change}
                      </span>
                    ) : isDown ? (
                      <span style={{ display: "flex", alignItems: "center", color: "#d97706", fontSize: "0.78rem", fontWeight: 600 }}>
                        <TrendingDown size={14} /> {data.change}
                      </span>
                    ) : (
                      <span style={{ color: "#64748b", fontSize: "0.78rem" }}>Stable</span>
                    )}
                  </div>
                  <div style={{ marginTop: "0.35rem", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {data.initial_value} → <strong>{data.latest_value}</strong> {data.unit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Soil Tests History List */}
      <Card>
        <SectionHeading
          title="Past Soil Tests"
          note="Historical records for this field are preserved permanently without overwriting past observations."
        />

        {tests.length === 0 ? (
          <EmptyState
            title="No soil tests saved yet"
            description="Log your first manual test or upload a laboratory Soil Health Card to start tracking trends."
          />
        ) : (
          <div className="record-table-wrap">
            <table className="record-table">
              <thead>
                <tr>
                  <th>TEST DATE</th>
                  <th>SOURCE</th>
                  <th>pH</th>
                  <th>NITROGEN (N)</th>
                  <th>PHOSPHORUS (P)</th>
                  <th>POTASSIUM (K)</th>
                  <th>ORGANIC CARBON</th>
                  <th>EC</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {tests.map(test => (
                  <tr key={recordId(test)}>
                    <td>
                      <strong>{fmtDate(test.test_date || test.created_at)}</strong>
                    </td>
                    <td>
                      <Badge kind="neutral">
                        {test.test_source === "soil_health_card"
                          ? "Soil Health Card"
                          : test.test_source === "lab_report"
                          ? "Lab Report"
                          : "Manual"}
                      </Badge>
                    </td>
                    <td>
                      <strong>{test.ph ?? "—"}</strong>
                    </td>
                    <td>{test.nitrogen ? `${test.nitrogen} kg/ha` : "—"}</td>
                    <td>{test.phosphorus ? `${test.phosphorus} kg/ha` : "—"}</td>
                    <td>{test.potassium ? `${test.potassium} kg/ha` : "—"}</td>
                    <td>{test.organic_carbon ? `${test.organic_carbon} %` : "—"}</td>
                    <td>{test.electrical_conductivity ? `${test.electrical_conductivity} dS/m` : "—"}</td>
                    <td>
                      <Button
                        variant="secondary"
                        style={{ fontSize: "0.78rem", padding: "0.3rem 0.6rem" }}
                        onClick={() => onSelectTest(test)}
                      >
                        <Sparkles size={13} /> View Explanation
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// -------------------------------------------------------------
// Component: Agronomic & FarmAI Soil Explanation View
// -------------------------------------------------------------
function SoilExplanationView({
  explanation,
  test,
  onClose,
}: {
  explanation: SoilExplanation;
  test: SoilTest | null;
  onClose: () => void;
}) {
  const p = explanation.parameters || {};

  return (
    <Card style={{ border: "2px solid #86efac", background: "#fcfdfc", marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
        <div>
          <span className="eyebrow" style={{ color: "#166534" }}>
            FARMAI SOIL HEALTH EVALUATION · {explanation.crop_evaluated ? `FOR ${explanation.crop_evaluated.toUpperCase()}` : "COMPREHENSIVE"}
          </span>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#15803d", marginTop: "0.2rem" }}>
            Overall Rating: {explanation.overall_health}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b" }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Context notes */}
      {explanation.context_notes?.length > 0 && (
        <div style={{ marginBottom: "1rem", padding: "0.6rem 0.85rem", background: "#f0fdf4", borderRadius: "6px", fontSize: "0.82rem", color: "#166534" }}>
          {explanation.context_notes.join(" ")}
        </div>
      )}

      {/* Key Parameter Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.85rem", marginBottom: "1.25rem" }}>
        {/* Soil pH */}
        {p.ph && (
          <div style={{ padding: "0.85rem", background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>Soil pH</span>
              <Badge kind={p.ph.status.includes("Optimal") ? "success" : "warning"}>{p.ph.status}</Badge>
            </div>
            <strong style={{ fontSize: "1.3rem", color: "#1e293b", display: "block", margin: "0.25rem 0" }}>
              {p.ph.value ?? "—"}
            </strong>
            <p style={{ fontSize: "0.78rem", color: "#334155", margin: "0.2rem 0" }}>{p.ph.meaning}</p>
            {p.ph.crop_suitability && (
              <span style={{ fontSize: "0.75rem", color: "#166534", fontWeight: 500 }}>
                {p.ph.crop_suitability}
              </span>
            )}
          </div>
        )}

        {/* Nitrogen */}
        {p.nitrogen && (
          <div style={{ padding: "0.85rem", background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>Available Nitrogen (N)</span>
              <Badge kind={p.nitrogen.status.includes("Adequate") ? "success" : "warning"}>{p.nitrogen.status}</Badge>
            </div>
            <strong style={{ fontSize: "1.3rem", color: "#1e293b", display: "block", margin: "0.25rem 0" }}>
              {p.nitrogen.value ?? "—"} <small style={{ fontSize: "0.8rem", fontWeight: 400 }}>kg/ha</small>
            </strong>
            <p style={{ fontSize: "0.78rem", color: "#334155", margin: "0.2rem 0" }}>{p.nitrogen.meaning}</p>
            {p.nitrogen.implications && (
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{p.nitrogen.implications}</span>
            )}
          </div>
        )}

        {/* Phosphorus */}
        {p.phosphorus && (
          <div style={{ padding: "0.85rem", background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>Available Phosphorus (P)</span>
              <Badge kind={p.phosphorus.status.includes("Adequate") ? "success" : "warning"}>{p.phosphorus.status}</Badge>
            </div>
            <strong style={{ fontSize: "1.3rem", color: "#1e293b", display: "block", margin: "0.25rem 0" }}>
              {p.phosphorus.value ?? "—"} <small style={{ fontSize: "0.8rem", fontWeight: 400 }}>kg/ha</small>
            </strong>
            <p style={{ fontSize: "0.78rem", color: "#334155", margin: "0.2rem 0" }}>{p.phosphorus.meaning}</p>
            {p.phosphorus.implications && (
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{p.phosphorus.implications}</span>
            )}
          </div>
        )}

        {/* Potassium */}
        {p.potassium && (
          <div style={{ padding: "0.85rem", background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>Available Potassium (K)</span>
              <Badge kind={p.potassium.status.includes("Adequate") ? "success" : "warning"}>{p.potassium.status}</Badge>
            </div>
            <strong style={{ fontSize: "1.3rem", color: "#1e293b", display: "block", margin: "0.25rem 0" }}>
              {p.potassium.value ?? "—"} <small style={{ fontSize: "0.8rem", fontWeight: 400 }}>kg/ha</small>
            </strong>
            <p style={{ fontSize: "0.78rem", color: "#334155", margin: "0.2rem 0" }}>{p.potassium.meaning}</p>
            {p.potassium.implications && (
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{p.potassium.implications}</span>
            )}
          </div>
        )}

        {/* Organic Carbon */}
        {p.organic_carbon && (
          <div style={{ padding: "0.85rem", background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>Organic Carbon (OC)</span>
              <Badge kind={p.organic_carbon.status.includes("High") ? "success" : "warning"}>{p.organic_carbon.status}</Badge>
            </div>
            <strong style={{ fontSize: "1.3rem", color: "#1e293b", display: "block", margin: "0.25rem 0" }}>
              {p.organic_carbon.value ?? "—"} <small style={{ fontSize: "0.8rem", fontWeight: 400 }}>%</small>
            </strong>
            <p style={{ fontSize: "0.78rem", color: "#334155", margin: "0.2rem 0" }}>{p.organic_carbon.meaning}</p>
          </div>
        )}

        {/* Electrical Conductivity */}
        {p.electrical_conductivity && (
          <div style={{ padding: "0.85rem", background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>Electrical Conductivity (EC)</span>
              <Badge kind={p.electrical_conductivity.status.includes("Normal") ? "success" : "warning"}>{p.electrical_conductivity.status}</Badge>
            </div>
            <strong style={{ fontSize: "1.3rem", color: "#1e293b", display: "block", margin: "0.25rem 0" }}>
              {p.electrical_conductivity.value ?? "—"} <small style={{ fontSize: "0.8rem", fontWeight: 400 }}>dS/m</small>
            </strong>
            <p style={{ fontSize: "0.78rem", color: "#334155", margin: "0.2rem 0" }}>{p.electrical_conductivity.meaning}</p>
          </div>
        )}
      </div>

      {/* Actionable Recommendations List */}
      {explanation.actionable_recommendations?.length > 0 && (
        <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
          <h4 style={{ fontSize: "0.92rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.5rem" }}>
            Recommended Agronomic Actions & Soil Treatment
          </h4>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.84rem", color: "#334155", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {explanation.actionable_recommendations.map((rec, idx) => (
              <li key={idx}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
