import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Activity,
  ArrowRight,
  Bot,
  CloudSun,
  Droplets,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Leaf,
  Scan,
  Sparkles,
  Sprout,
  TrendingUp,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  PageHeading,
  PageSurface,
  SectionHeading,
} from "@/components/FarmUI";
import { api } from "@/lib/api";

export function FarmAnalysisPage() {
  const { data: soilPage } = useQuery({
    queryKey: ["soil-tests-summary"],
    queryFn: () => api.soilTests.list(),
  });

  const { data: diseasePage } = useQuery({
    queryKey: ["disease-history-summary"],
    queryFn: () => api.disease.history(),
  });

  const { data: documentPage } = useQuery({
    queryKey: ["documents-summary"],
    queryFn: () => api.documents.list(),
  });

  const { data: farmPage } = useQuery({
    queryKey: ["farms-summary"],
    queryFn: () => api.farms.list(),
  });

  const soilTests = soilPage?.items || [];
  const diseaseHistory = diseasePage?.items || [];
  const documents = documentPage?.items || [];
  const farms = farmPage?.items || [];

  const latestSoilTest = soilTests[0];
  const latestDiseaseCheck = diseaseHistory[0];

  return (
    <PageSurface>
      <PageHeading
        eyebrow="AGRICULTURAL INTELLIGENCE"
        title="Farm Health & Tests Hub"
        subtitle="Comprehensive diagnostic suite for soil testing, vision-based leaf pathology, agronomic ML recommendations, and environmental monitoring."
        action={
          <div className="flex gap-2">
            <Link href="/farmer/soil-tests">
              <Button variant="secondary">
                <FlaskConical size={16} /> New Soil Test
              </Button>
            </Link>
            <Link href="/farmer/disease-check">
              <Button variant="primary">
                <Scan size={16} /> Check Leaf Health
              </Button>
            </Link>
          </div>
        }
      />

      {/* Snapshot Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 bg-emerald-50/50 border-emerald-200/60 dark:bg-emerald-950/20 dark:border-emerald-800/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Soil Tests
            </span>
            <FlaskConical size={18} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {soilTests.length}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {latestSoilTest
              ? `Latest: ${latestSoilTest.test_date || "Recorded"}`
              : "No soil tests yet"}
          </div>
        </Card>

        <Card className="p-4 bg-amber-50/50 border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-800/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Disease Checks
            </span>
            <Scan size={18} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {diseaseHistory.length}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {latestDiseaseCheck
              ? `Recent: ${latestDiseaseCheck.is_uncertain ? "Uncertain result" : latestDiseaseCheck.crop_type || "Diagnosed"}`
              : "No leaf checks yet"}
          </div>
        </Card>

        <Card className="p-4 bg-blue-50/50 border-blue-200/60 dark:bg-blue-950/20 dark:border-blue-800/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-300">
              Lab Reports
            </span>
            <FileSpreadsheet size={18} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {documents.length}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Archived PDF & image reports
          </div>
        </Card>

        <Card className="p-4 bg-purple-50/50 border-purple-200/60 dark:bg-purple-950/20 dark:border-purple-800/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-800 dark:text-purple-300">
              Farms Monitored
            </span>
            <Sprout size={18} className="text-purple-600 dark:text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {farms.length}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Active cultivation zones
          </div>
        </Card>
      </div>

      {/* Primary Diagnostic Tools */}
      <div className="mb-8">
        <SectionHeading
          title="Diagnostic & Testing Tools"
          note="Direct laboratory-grade analysis and vision models tailored to Indian farming conditions"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
          {/* Soil Test Tool */}
          <Card className="p-6 flex flex-col justify-between hover:shadow-md transition-shadow border-emerald-100 dark:border-emerald-900/50">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
                  <FlaskConical size={24} />
                </div>
                <Badge kind="success">PDF & Manual</Badge>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                Soil Health & Laboratory Tests
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Upload official Soil Health Cards (PDF or photo) for automated parameter extraction, or enter pH, N, P, K, EC, and micronutrients manually. Get instant agronomic explanations and multi-season trend charts.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {soilTests.length} recorded {soilTests.length === 1 ? "test" : "tests"}
              </span>
              <Link href="/farmer/soil-tests">
                <Button variant="ghost" className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">
                  Open Soil Suite <ArrowRight size={16} className="ml-1" />
                </Button>
              </Link>
            </div>
          </Card>

          {/* Leaf Disease Check */}
          <Card className="p-6 flex flex-col justify-between hover:shadow-md transition-shadow border-amber-100 dark:border-amber-900/50">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-700 dark:text-amber-300">
                  <Scan size={24} />
                </div>
                <Badge kind="warning">ResNet9 Vision</Badge>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                Leaf & Crop Disease Check
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Upload close-up leaf photographs to identify 38 known crop pathologies using our neural vision model. Includes calibrated confidence scores and honest uncertain fallbacks when quality is insufficient.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {diseaseHistory.length} diagnostic runs
              </span>
              <Link href="/farmer/disease-check">
                <Button variant="ghost" className="text-amber-700 hover:text-amber-800 dark:text-amber-400">
                  Scan Leaf Now <ArrowRight size={16} className="ml-1" />
                </Button>
              </Link>
            </div>
          </Card>

          {/* Crop Recommendation & Rotation */}
          <Card className="p-6 flex flex-col justify-between hover:shadow-md transition-shadow border-blue-100 dark:border-blue-900/50">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-700 dark:text-blue-300">
                  <Sprout size={24} />
                </div>
                <Badge kind="info">ML Classifier</Badge>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                Crop Recommendation & Rotation
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Predict the most suitable crops among 22 staples using our trained agronomical classifier based on N-P-K, temperature, humidity, rainfall, and historical field rotations.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                DecisionTree + NaiveBayes
              </span>
              <Link href="/farmer/crops/new">
                <Button variant="ghost" className="text-blue-700 hover:text-blue-800 dark:text-blue-400">
                  Plan Season <ArrowRight size={16} className="ml-1" />
                </Button>
              </Link>
            </div>
          </Card>

          {/* Irrigation & Water Management */}
          <Card className="p-6 flex flex-col justify-between hover:shadow-md transition-shadow border-sky-100 dark:border-sky-900/50">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center text-sky-700 dark:text-sky-300">
                  <Droplets size={24} />
                </div>
                <Badge kind="neutral">Water Log</Badge>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                Irrigation & Water Records
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Log actual irrigation volume, method (drip, furrow, sprinkler), and soil moisture. Distinguish between completed field irrigations and automated AI recommendations.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Water balance tracking
              </span>
              <Link href="/farmer/irrigation">
                <Button variant="ghost" className="text-sky-700 hover:text-sky-800 dark:text-sky-400">
                  Irrigation Log <ArrowRight size={16} className="ml-1" />
                </Button>
              </Link>
            </div>
          </Card>

          {/* Weather & Environment */}
          <Card className="p-6 flex flex-col justify-between hover:shadow-md transition-shadow border-indigo-100 dark:border-indigo-900/50">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300">
                  <CloudSun size={24} />
                </div>
                <Badge kind="info">Microclimate</Badge>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                Weather & Agro-Advisory
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Live micro-climatic weather telemetry tied to your farm coordinates, rainfall forecasts, humidity levels, and actionable seasonal farming warnings.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Hourly & 7-day outlook
              </span>
              <Link href="/farmer/weather">
                <Button variant="ghost" className="text-indigo-700 hover:text-indigo-800 dark:text-indigo-400">
                  View Weather <ArrowRight size={16} className="ml-1" />
                </Button>
              </Link>
            </div>
          </Card>

          {/* Document & Report Center */}
          <Card className="p-6 flex flex-col justify-between hover:shadow-md transition-shadow border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">
                  <FileText size={24} />
                </div>
                <Badge kind="neutral">Owner-Isolated Archive</Badge>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                Document & Report Center
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Centralized vault for all your official lab certificates, soil test PDFs, land records, disease reports, and purchase invoices with secure owner-isolated storage.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {documents.length} archived {documents.length === 1 ? "document" : "documents"}
              </span>
              <Link href="/farmer/documents">
                <Button variant="ghost" className="text-slate-700 hover:text-slate-800 dark:text-slate-300">
                  Open Vault <ArrowRight size={16} className="ml-1" />
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {/* Holistic FarmAI Intelligence Banner */}
      <Card className="p-6 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white border-0 shadow-lg">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-400/30">
              <Sparkles size={14} /> Integrated Agricultural Context
            </div>
            <h2 className="text-xl font-bold">Ask FarmSaathi with Cross-Layer Agronomy</h2>
            <p className="text-sm text-emerald-100/80 leading-relaxed">
              FarmSaathi integrates data from your actual farm boundaries, current soil chemistry (N-P-K, pH), recent disease checks, active crop growth stages, and pending irrigation events to give contextually grounded advice.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/farmer/ai">
              <Button variant="primary">
                <Bot size={18} className="mr-1.5" /> Consult FarmSaathi
              </Button>
            </Link>
            <Link href="/farmer/performance">
              <Button variant="secondary">
                <TrendingUp size={18} className="mr-1.5" /> Farm Performance
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </PageSurface>
  );
}
