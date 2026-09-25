import { useState, useRef, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  FileImage,
  HelpCircle,
  History,
  Info,
  Leaf,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  errorMessage,
  recordId,
  type Crop,
  type DiseaseReport,
} from "@/lib/api";
import { useCrops, useFields } from "@/hooks/useFarmData";
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
  TextArea,
  TextInput,
} from "@/components/FarmUI";
import { formatDate } from "@/lib/locale";

const fmtDate = (v?: string | null) =>
  v ? formatDate(v, { day: "numeric", month: "short", year: "numeric" }) : "—";

export function DiseaseCheckPage({ cropId: initialCropId }: { cropId?: string }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [uploadId, setUploadId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<"check" | "history">("check");

  const [selectedCropId, setSelectedCropId] = useState(initialCropId || "");
  const [symptoms, setSymptoms] = useState("");
  const [notes, setNotes] = useState("");

  const [diagnosisResult, setDiagnosisResult] = useState<DiseaseReport | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const cropsQuery = useCrops();
  const activeCrop = cropsQuery.data?.items?.find(c => recordId(c) === selectedCropId);

  // History query
  const historyQuery = useQuery({
    queryKey: ["disease-history", selectedCropId],
    queryFn: () => api.disease.history(selectedCropId ? { crop_id: selectedCropId } : {}),
  });

  const checkMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.disease.check(payload),
    onSuccess: (data: DiseaseReport) => {
      setDiagnosisResult(data);
      qc.invalidateQueries({ queryKey: ["disease-history"] });
      qc.invalidateQueries({ queryKey: ["records", "health"] });
      if (data.is_uncertain) {
        toast.warning("Diagnosis uncertain. Please review alternative recommendations.");
      } else {
        toast.success(`Diagnosis complete: ${data.result}`);
      }
    },
    onError: e => toast.error(errorMessage(e)),
  });

  async function handleFileChoose(selected?: File) {
    if (!selected) return;
    if (!/^image\/(jpeg|png|webp)$/.test(selected.type)) {
      toast.error("Please choose a JPEG, PNG, or WebP photo.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast.error("Photo size must be smaller than 10 MB.");
      return;
    }

    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setDiagnosisResult(null);
    setUploading(true);

    try {
      const uploaded = await api.support.upload(selected);
      setUploadId(uploaded.upload_id);
      toast.success("Leaf photo uploaded securely.");
    } catch (err) {
      toast.error(errorMessage(err));
      setFile(null);
      setPreview("");
      setUploadId("");
    } finally {
      setUploading(false);
    }
  }

  function handleReset() {
    setFile(null);
    setPreview("");
    setUploadId("");
    setDiagnosisResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleDiagnose(e: FormEvent) {
    e.preventDefault();
    if (!uploadId) {
      toast.error("Please upload or take a clear photo of the leaf first.");
      return;
    }

    const payload = {
      image_upload_id: uploadId,
      crop_id: selectedCropId || undefined,
      plant_name: activeCrop?.crop_name || undefined,
      symptoms: symptoms ? symptoms.split(",").map(s => s.trim()).filter(Boolean) : [],
      notes: notes || undefined,
    };

    checkMutation.mutate(payload);
  }

  const cropOptions = (cropsQuery.data?.items || []).map(c => ({
    value: recordId(c),
    label: `${c.crop_name}${c.variety ? ` (${c.variety})` : ""}`,
  }));

  return (
    <PageSurface>
      <div className="flex items-center gap-2 mb-2">
        <Link href={selectedCropId ? `/farmer/crops/${selectedCropId}` : "/farmer"} className="back-link">
          <ArrowLeft size={15} /> {activeCrop ? `Back to ${activeCrop.crop_name}` : "Back to Farm"}
        </Link>
        <span style={{ color: "#94a3b8" }}>/</span>
        <span style={{ fontSize: "0.88rem", color: "#64748b", fontWeight: 500 }}>Crop Health & Disease Check</span>
      </div>

      <PageHeading
        eyebrow="LEAF PATHOLOGY & COMPUTER VISION"
        title="Crop Health & Disease Diagnosis."
        subtitle="Upload a clear close-up leaf photo. FarmAI's calibrated deep vision model diagnoses plant pathogens and provides actionable recommendations."
        action={
          <div className="flex gap-2">
            <Button
              variant={activeTab === "check" ? "primary" : "secondary"}
              onClick={() => setActiveTab("check")}
            >
              <Leaf size={16} /> Check Leaf Disease
            </Button>
            <Button
              variant={activeTab === "history" ? "primary" : "secondary"}
              onClick={() => setActiveTab("history")}
            >
              <History size={16} /> Disease History
            </Button>
          </div>
        }
      />

      {/* Scope disclaimer */}
      <div style={{ padding: "0.85rem 1rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "1.25rem", fontSize: "0.82rem", color: "#475569", display: "flex", gap: "0.65rem", alignItems: "flex-start" }}>
        <Info size={17} color="#0284c7" style={{ marginTop: "2px", flexShrink: 0 }} />
        <div>
          <strong>Computer Vision Scope:</strong> Our deep learning vision model (ResNet9) is specifically trained on 38 leaf pathology classes (blights, rusts, powdery mildew, spots, mosaic virus, leaf mold). For non-leaf images (roots, stems, fruits, soil, or insects), automated CV is not applicable; please use FarmAI text inquiry or consult an agronomist.
        </div>
      </div>

      {activeTab === "check" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Card>
            <SectionHeading
              title="1. Take or Upload Leaf Photo"
              note="Capture the leaf under natural, indirect daylight. Position the diseased area or lesion in clear focus."
            />

            {/* Photo Upload & Preview Area */}
            {!preview ? (
              <div className="upload-area" style={{ marginTop: "0.5rem" }}>
                <input
                  ref={fileInputRef}
                  id="disease-leaf-file"
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={e => void handleFileChoose(e.target.files?.[0])}
                />
                <label htmlFor="disease-leaf-file" className={`upload-pick ${uploading ? "is-uploading" : ""}`}>
                  {uploading ? (
                    <LoaderCircle className="spin" size={28} color="#16a34a" />
                  ) : (
                    <Camera size={28} />
                  )}
                  <strong>
                    {uploading ? "Uploading leaf photo securely…" : "Take Photo or Upload Leaf Image"}
                  </strong>
                  <span>JPEG, PNG or WebP · High resolution close-up</span>
                  <span className="button button-secondary">
                    <Upload size={14} /> Select image
                  </span>
                </label>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "1rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ position: "relative", maxWidth: "360px", width: "100%" }}>
                  <img
                    src={preview}
                    alt="Selected leaf observation"
                    style={{ width: "100%", maxHeight: "300px", objectFit: "contain", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  />
                  {uploadId && (
                    <div style={{ position: "absolute", top: "8px", right: "8px" }}>
                      <Badge kind="success">Uploaded</Badge>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <Button variant="secondary" onClick={handleReset} disabled={checkMutation.isPending}>
                    <RotateCcw size={14} /> Retake / Choose Another
                  </Button>
                </div>
              </div>
            )}

            {/* Form Context & Submission */}
            <form onSubmit={handleDiagnose} className="record-form" style={{ marginTop: "1.25rem" }}>
              <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.85rem" }}>
                {cropOptions.length > 0 && (
                  <SelectInput
                    label="Related Crop Cycle"
                    id="disease-crop"
                    value={selectedCropId}
                    onChange={e => setSelectedCropId(e.target.value)}
                    options={[{ value: "", label: "Standalone Plant / Unlinked" }, ...cropOptions]}
                  />
                )}
                <TextInput
                  label="Visible Symptoms (Optional)"
                  id="disease-symptoms"
                  value={symptoms}
                  onChange={e => setSymptoms(e.target.value)}
                  placeholder="e.g. yellow spots, brown margin, white powder"
                  hint="Separate observations with commas"
                />
              </div>

              <TextArea
                label="Observation Notes (Optional)"
                id="disease-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Where on the plot is this observed? Has it spread to adjacent plants?"
              />

              <div className="form-actions" style={{ marginTop: "1rem" }}>
                <Button type="submit" disabled={!uploadId || checkMutation.isPending || uploading}>
                  {checkMutation.isPending ? (
                    <>
                      <LoaderCircle className="spin" size={16} /> Running Neural Vision Model…
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} /> Run Disease Diagnosis
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>

          {/* Diagnosis Results Card */}
          {diagnosisResult && (
            <DiseaseDiagnosisResultCard
              report={diagnosisResult}
              preview={preview}
              onRetry={handleReset}
              cropName={activeCrop?.crop_name}
            />
          )}
        </div>
      )}

      {activeTab === "history" && (
        <Card>
          <SectionHeading
            title="Crop Health & Disease Check History"
            note="Every check is permanently recorded against your farm and crop cycle."
          />

          {historyQuery.isLoading ? (
            <LoadingState label="Loading health check history…" />
          ) : historyQuery.isError ? (
            <ErrorState message="Could not load health check history." retry={() => void historyQuery.refetch()} />
          ) : (historyQuery.data?.items?.length || 0) === 0 ? (
            <EmptyState
              title="No disease checks saved yet"
              description="Upload a photo of a crop leaf to run your first computer vision health analysis."
            />
          ) : (
            <div className="record-table-wrap">
              <table className="record-table">
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>CROP / PLANT</th>
                    <th>RESULT</th>
                    <th>CONFIDENCE</th>
                    <th>STATUS</th>
                    <th>REVIEW</th>
                  </tr>
                </thead>
                <tbody>
                  {(historyQuery.data?.items || []).map((item: DiseaseReport) => (
                    <tr key={recordId(item)}>
                      <td>{fmtDate(item.created_at)}</td>
                      <td>
                        <strong>{item.crop_name || "Plant Leaf"}</strong>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: item.is_uncertain ? "#d97706" : "#1e293b" }}>
                          {item.result || "Undiagnosed"}
                        </span>
                      </td>
                      <td>
                        {item.confidence != null ? `${item.confidence}%` : "—"}
                      </td>
                      <td>
                        <Badge
                          kind={
                            item.diagnosis_status === "diagnosed"
                              ? "success"
                              : item.diagnosis_status === "uncertain"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {item.diagnosis_status === "diagnosed"
                            ? "Diagnosed"
                            : item.diagnosis_status === "uncertain"
                            ? "Uncertain"
                            : "Analysis failed"}
                        </Badge>
                      </td>
                      <td>
                        {item.review_required ? (
                          <span style={{ fontSize: "0.78rem", color: "#d97706", display: "flex", alignItems: "center", gap: "3px" }}>
                            <AlertTriangle size={13} /> Review recommended
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.78rem", color: "#16a34a" }}>Resolved</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </PageSurface>
  );
}

// -------------------------------------------------------------
// Component: Disease Diagnosis Result Card
// -------------------------------------------------------------
function DiseaseDiagnosisResultCard({
  report,
  preview,
  onRetry,
  cropName,
}: {
  report: DiseaseReport;
  preview?: string;
  onRetry: () => void;
  cropName?: string;
}) {
  const isUncertain = report.is_uncertain || report.diagnosis_status === "uncertain";
  const model = report.model_result;

  return (
    <Card
      style={{
        border: isUncertain ? "2px solid #f59e0b" : "2px solid #22c55e",
        background: isUncertain ? "#fffbeb" : "#f0fdf4",
        padding: "1.5rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <span
            className="eyebrow"
            style={{ color: isUncertain ? "#b45309" : "#15803d", fontWeight: 700 }}
          >
            {isUncertain ? "ASSESSMENT UNCERTAIN" : "ANALYSIS COMPLETE · RESNET9 VISION"}
          </span>
          <h2
            style={{
              fontSize: "1.45rem",
              fontWeight: 800,
              color: isUncertain ? "#92400e" : "#14532d",
              marginTop: "0.25rem",
            }}
          >
            {isUncertain ? "Result Uncertain" : report.result}
          </h2>
          <p style={{ fontSize: "0.88rem", color: isUncertain ? "#78350f" : "#166534", marginTop: "0.25rem" }}>
            {isUncertain
              ? "FarmAI could not identify the disease with sufficient confidence (confidence threshold < 50%)."
              : `FarmAI found visual patterns consistent with ${report.result}.`}
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {report.confidence != null && (
            <Badge kind={isUncertain ? "warning" : "success"}>
              {report.confidence}% confidence
            </Badge>
          )}
          {model?.severity && (
            <Badge kind={model.severity === "high" || model.severity === "critical" ? "warning" : "neutral"}>
              Severity: {model.severity}
            </Badge>
          )}
        </div>
      </div>

      {/* Uncertainty Notice & Alternative Options */}
      {isUncertain ? (
        <div
          style={{
            marginTop: "1.25rem",
            padding: "1rem",
            background: "#ffffff",
            borderRadius: "8px",
            border: "1px solid #fde68a",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <AlertTriangle size={18} color="#d97706" />
            <strong style={{ fontSize: "0.92rem", color: "#92400e" }}>
              Why is this assessment uncertain?
            </strong>
          </div>
          <p style={{ fontSize: "0.84rem", color: "#78350f", lineHeight: "1.4" }}>
            The photo may be blurry, dimly lit, showing an unsupported plant species, or showing early non-distinctive lesions. Do not apply chemical pesticides based on an uncertain prediction.
          </p>

          <h4 style={{ fontSize: "0.88rem", fontWeight: 700, color: "#1e293b", marginTop: "1rem", marginBottom: "0.5rem" }}>
            Recommended Next Actions:
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
            <div style={{ padding: "0.75rem", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
              <strong style={{ fontSize: "0.85rem", color: "#1e293b", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Camera size={15} color="#2563eb" /> 1. Retry with better photo
              </strong>
              <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "0.25rem 0 0.5rem" }}>
                Take a sharp photo in natural daylight with close-up focus on the leaf lesion.
              </p>
              <Button variant="secondary" onClick={onRetry} style={{ fontSize: "0.75rem", width: "100%" }}>
                <RefreshCw size={13} /> Retake photo
              </Button>
            </div>

            <div style={{ padding: "0.75rem", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
              <strong style={{ fontSize: "0.85rem", color: "#1e293b", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <UserCheck size={15} color="#16a34a" /> 2. Request Expert Review
              </strong>
              <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "0.25rem 0 0.5rem" }}>
                Submit to local Krishi Vigyan Kendra (KVK) or certified agronomist.
              </p>
              <Link href="/farmer/help" className="button button-secondary" style={{ fontSize: "0.75rem", width: "100%" }}>
                Find Agricultural Officer
              </Link>
            </div>

            <div style={{ padding: "0.75rem", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
              <strong style={{ fontSize: "0.85rem", color: "#1e293b", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <MessageSquare size={15} color="#7c3aed" /> 3. Ask FarmAI
              </strong>
              <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "0.25rem 0 0.5rem" }}>
                Describe symptoms, soil, and weather for contextual assistance.
              </p>
              <Link href="/farmer/ai" className="button button-secondary" style={{ fontSize: "0.75rem", width: "100%" }}>
                Consult FarmAI
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Top-3 Candidates */}
          {model?.top3_candidates && model.top3_candidates.length > 1 && (
            <div style={{ padding: "0.75rem 1rem", background: "#ffffff", borderRadius: "8px", border: "1px solid #dcfce7" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#166534", textTransform: "uppercase" }}>
                Model Candidate Predictions:
              </span>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
                {model.top3_candidates.map((cand, i) => (
                  <span key={i} style={{ fontSize: "0.82rem", color: "#1e293b" }}>
                    <strong>{cand.class.replace("___", " — ").replace(/_/g, " ")}</strong>: {cand.confidence_pct}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Next Steps */}
          {report.recommended_next_steps && report.recommended_next_steps.length > 0 && (
            <div style={{ padding: "1rem", background: "#ffffff", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
              <h4 style={{ fontSize: "0.92rem", fontWeight: 700, color: "#14532d", marginBottom: "0.5rem" }}>
                Recommended Agronomic Actions & Disease Control:
              </h4>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.84rem", color: "#334155", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {report.recommended_next_steps.map((action, i) => (
                  <li key={i}>{action}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Standard Agronomic Limitation */}
          <div style={{ padding: "0.6rem 0.85rem", background: "#f8fafc", borderRadius: "6px", fontSize: "0.78rem", color: "#64748b" }}>
            <strong>Agronomic Disclaimer:</strong> Automated computer vision analysis should be verified in field scouting. Always adhere to local state agricultural university / CIBRC pesticide dosages and safety periods before chemical application.
          </div>
        </div>
      )}
    </Card>
  );
}
