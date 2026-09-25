import { useState, useRef, type FormEvent } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Eye,
  FileCheck,
  FileText,
  Filter,
  FolderOpen,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  errorMessage,
  recordId,
  type DocumentRecord,
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
  TextArea,
  TextInput,
} from "@/components/FarmUI";
import { formatDate } from "@/lib/locale";

const fmtDate = (v?: string | null) =>
  v ? formatDate(v, { day: "numeric", month: "short", year: "numeric" }) : "—";

const formatBytes = (bytes?: number) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const DOC_TYPES = [
  { value: "soil_test_report", label: "Soil Test Lab Report" },
  { value: "soil_health_card", label: "Soil Health Card (SHC)" },
  { value: "crop_health_report", label: "Crop Health / Pathology Report" },
  { value: "expert_report", label: "Expert Agronomist Report" },
  { value: "farm_document", label: "Land / Farm Certificate" },
  { value: "invoice", label: "Input / Seed Purchase Bill" },
  { value: "other", label: "Other Agricultural Record" },
];

export function DocumentCenterPage() {
  const [filterType, setFilterType] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const qc = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ["documents-list", filterType],
    queryFn: () => api.documents.list(filterType ? { doc_type: filterType } : {}),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.documents.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents-list"] });
      toast.success("Document removed.");
    },
    onError: e => toast.error(errorMessage(e)),
  });

  const docs = documentsQuery.data?.items || [];
  const filteredDocs = docs.filter(d => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.filename || "").toLowerCase().includes(q) ||
      (d.notes || "").toLowerCase().includes(q)
    );
  });

  return (
    <PageSurface>
      <div className="flex items-center gap-2 mb-2">
        <Link href="/farmer" className="back-link">
          <ArrowLeft size={15} /> Farm Workspace
        </Link>
        <span style={{ color: "#94a3b8" }}>/</span>
        <span style={{ fontSize: "0.88rem", color: "#64748b", fontWeight: 500 }}>Document & Report Center</span>
      </div>

      <PageHeading
        eyebrow="RECORDS & CERTIFICATES"
        title="Document & Report Center."
        subtitle="Securely store, organize, and access soil test reports, crop health diagnoses, expert reviews, and farm certificates."
        action={
          <Button onClick={() => setUploadModalOpen(!uploadModalOpen)}>
            <Plus size={16} /> Upload New Document
          </Button>
        }
      />

      {/* Upload Form Box */}
      {uploadModalOpen && (
        <DocumentUploadCard
          onClose={() => setUploadModalOpen(false)}
          onSuccess={() => {
            setUploadModalOpen(false);
            qc.invalidateQueries({ queryKey: ["documents-list"] });
          }}
        />
      )}

      {/* Filter and Search Bar */}
      <Card style={{ padding: "0.85rem 1.25rem", background: "#f8fafc", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 240px", position: "relative" }}>
            <input
              type="text"
              placeholder="Search documents by name or notes…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "0.45rem 0.85rem 0.45rem 2.2rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.88rem",
                background: "#ffffff",
              }}
            />
            <Search size={15} color="#94a3b8" style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)" }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Filter size={15} color="#64748b" />
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.88rem",
                background: "#ffffff",
              }}
            >
              <option value="">All Document Types</option>
              {DOC_TYPES.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Documents List */}
      <Card>
        <SectionHeading
          title="Stored Documents & Laboratory Records"
          note="Files are stored securely with owner-level isolation. Click any document to view or download."
        />

        {documentsQuery.isLoading ? (
          <LoadingState label="Loading your documents…" />
        ) : documentsQuery.isError ? (
          <ErrorState message="Could not load documents." retry={() => void documentsQuery.refetch()} />
        ) : filteredDocs.length === 0 ? (
          <EmptyState
            title="No documents found"
            description={
              filterType || searchQuery
                ? "No stored records match your search or filter."
                : "Upload your first soil report, crop disease review, or farm certificate to keep everything organized."
            }
            action={
              <Button onClick={() => setUploadModalOpen(true)}>
                <Plus size={16} /> Upload Document
              </Button>
            }
          />
        ) : (
          <div className="record-table-wrap">
            <table className="record-table">
              <thead>
                <tr>
                  <th>DOCUMENT NAME</th>
                  <th>TYPE</th>
                  <th>UPLOAD DATE</th>
                  <th>FILE SIZE</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map(doc => {
                  const typeLabel = DOC_TYPES.find(t => t.value === doc.doc_type)?.label || doc.doc_type;
                  const isPdf = doc.content_type === "application/pdf" || (doc.filename || "").endsWith(".pdf");

                  return (
                    <tr key={recordId(doc)}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                          <span style={{ color: isPdf ? "#dc2626" : "#2563eb", display: "inline-flex" }}>
                            {isPdf ? <FileText size={18} /> : <FileCheck size={18} />}
                          </span>
                          <div>
                            <strong style={{ fontSize: "0.9rem", color: "#1e293b" }}>{doc.name}</strong>
                            {doc.filename && (
                              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{doc.filename}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge kind="neutral">{typeLabel}</Badge>
                      </td>
                      <td>{fmtDate(doc.created_at)}</td>
                      <td>{formatBytes(doc.size_bytes)}</td>
                      <td>
                        <Badge kind="success">{doc.status || "verified"}</Badge>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          {doc.file_url && (
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="button button-secondary"
                              style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                            >
                              <Eye size={13} /> View
                            </a>
                          )}
                          <Button
                            variant="ghost"
                            style={{ padding: "0.3rem 0.5rem", color: "#ef4444" }}
                            onClick={() => {
                              if (confirm("Delete this document record?")) {
                                deleteMutation.mutate(recordId(doc));
                              }
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageSurface>
  );
}

function DocumentUploadCard({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadId, setUploadId] = useState("");

  const farmsQuery = useFarms();
  const fieldsQuery = useQuery({
    queryKey: ["all-fields-documents"],
    queryFn: async () => {
      const farms = await api.farms.list({ limit: 50 });
      const pages = await Promise.all(
        farms.items.map(f => api.farms.fields(recordId(f), { limit: 100 }))
      );
      return pages.flatMap(p => p.items);
    },
  });
  const cropsQuery = useCrops();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.documents.create(payload),
    onSuccess: () => {
      toast.success("Document saved to Document Center.");
      onSuccess();
    },
    onError: e => toast.error(errorMessage(e)),
  });

  async function handleFileChoose(candidate?: File) {
    if (!candidate) return;
    const isPdf = candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf");
    const isImg = /^image\/(jpeg|png|webp)$/.test(candidate.type);
    if (!isPdf && !isImg) {
      toast.error("Please upload a PDF document or JPEG/PNG/WebP image.");
      return;
    }
    if (candidate.size > 15 * 1024 * 1024) {
      toast.error("Document size must be under 15 MB.");
      return;
    }

    setFile(candidate);
    setUploading(true);

    try {
      const uploaded = await api.support.upload(candidate);
      setUploadId(uploaded.upload_id);
      toast.success("File uploaded successfully.");
    } catch (err) {
      toast.error(errorMessage(err));
      setFile(null);
      setUploadId("");
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!uploadId) {
      toast.error("Please choose a file to upload first.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || file?.name || "Document").trim(),
      doc_type: fd.get("doc_type") || "soil_test_report",
      file_upload_id: uploadId,
      farm_id: fd.get("farm_id") || undefined,
      field_id: fd.get("field_id") || undefined,
      crop_id: fd.get("crop_id") || undefined,
      notes: fd.get("notes") || undefined,
      status: "verified",
    };
    saveMutation.mutate(payload);
  }

  return (
    <Card className="mb-4" style={{ border: "2px solid #93c5fd", background: "#f8fafc" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#1e3a8a" }}>
          Upload Agricultural Document / Report
        </h3>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b" }}
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="record-form">
        <div style={{ marginBottom: "1rem" }}>
          <input
            ref={fileInputRef}
            id="doc-center-file"
            className="sr-only"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={e => void handleFileChoose(e.target.files?.[0])}
          />
          <label htmlFor="doc-center-file" className={`upload-pick ${uploading ? "is-uploading" : ""}`} style={{ padding: "1.2rem" }}>
            {uploading ? (
              <LoaderCircle className="spin" size={24} color="#2563eb" />
            ) : file ? (
              <FileCheck size={24} color="#16a34a" />
            ) : (
              <Upload size={24} />
            )}
            <strong>{uploading ? "Uploading file…" : file ? file.name : "Choose PDF or Image Document"}</strong>
            <span>PDF, JPEG, PNG or WebP · Up to 15 MB</span>
            <span className="button button-secondary">Browse file</span>
          </label>
        </div>

        <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.85rem" }}>
          <TextInput
            label="Document Title"
            id="doc-name"
            name="name"
            required
            defaultValue={file ? file.name.replace(/\.[^/.]+$/, "") : ""}
            placeholder="e.g. Soil Test Report Kharif 2026"
          />
          <SelectInput
            label="Document Type"
            id="doc-type"
            name="doc_type"
            defaultValue="soil_test_report"
            options={DOC_TYPES}
          />
          {fieldsQuery.data && (
            <SelectInput
              label="Related Field (Optional)"
              id="doc-field"
              name="field_id"
              options={[{ value: "", label: "Not field specific" }, ...fieldsQuery.data.map(f => ({ value: recordId(f), label: f.name }))]}
            />
          )}
          {cropsQuery.data?.items && (
            <SelectInput
              label="Related Crop (Optional)"
              id="doc-crop"
              name="crop_id"
              options={[{ value: "", label: "Not crop specific" }, ...cropsQuery.data.items.map(c => ({ value: recordId(c), label: c.crop_name }))]}
            />
          )}
        </div>

        <TextArea
          label="Document Notes"
          id="doc-notes"
          name="notes"
          rows={2}
          placeholder="Issuing authority, lab name, or test batch reference"
        />

        <div className="form-actions" style={{ marginTop: "1rem" }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!uploadId || saveMutation.isPending || uploading}>
            {saveMutation.isPending ? "Saving Document…" : "Save to Document Center"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
