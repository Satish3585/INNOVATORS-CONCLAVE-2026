import { Suspense, lazy, useEffect, useRef } from "react";
import { Route, Switch, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import NotFound from "@/pages/NotFound";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider, TranslateContent, useLanguage, translate } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";
import { AppShell, Button, LoadingState, PageSurface } from "@/components/FarmUI";
import AssistantGuide from "@/components/AssistantGuide";
import type { RecordKind } from "@/pages/RecordPages";

const Home = lazy(() => import("@/pages/Home"));
const AuthPage = lazy(() => import("@/pages/AuthPage").then(module => ({ default: module.AuthPage })));
const FarmerHome = lazy(() => import("@/pages/DashboardPages").then(module => ({ default: module.FarmerHome })));
const BuyerHome = lazy(() => import("@/pages/DashboardPages").then(module => ({ default: module.BuyerHome })));
const FarmListPage = lazy(() => import("@/pages/FarmPages").then(module => ({ default: module.FarmListPage })));
const FarmFormPage = lazy(() => import("@/pages/FarmPages").then(module => ({ default: module.FarmFormPage })));
const FarmDetailPage = lazy(() => import("@/pages/FarmPages").then(module => ({ default: module.FarmDetailPage })));
const FieldFormPage = lazy(() => import("@/pages/FarmPages").then(module => ({ default: module.FieldFormPage })));
const FieldDetailPage = lazy(() => import("@/pages/FarmPages").then(module => ({ default: module.FieldDetailPage })));
const CropListPage = lazy(() => import("@/pages/FarmPages").then(module => ({ default: module.CropListPage })));
const CropCreatePage = lazy(() => import("@/pages/FarmPages").then(module => ({ default: module.CropCreatePage })));
const CropEditPage = lazy(() => import("@/pages/FarmPages").then(module => ({ default: module.CropEditPage })));
const CropJourneyPage = lazy(() => import("@/pages/FarmPages").then(module => ({ default: module.CropJourneyPage })));
const RecordCreatePage = lazy(() => import("@/pages/RecordPages").then(module => ({ default: module.RecordCreatePage })));
const RecordListPage = lazy(() => import("@/pages/RecordPages").then(module => ({ default: module.RecordListPage })));
const MarketPage = lazy(() => import("@/pages/MarketplacePages").then(module => ({ default: module.MarketPage })));
const ListingCreatePage = lazy(() => import("@/pages/MarketplacePages").then(module => ({ default: module.ListingCreatePage })));
const ListingDetailPage = lazy(() => import("@/pages/MarketplacePages").then(module => ({ default: module.ListingDetailPage })));
const InterestListPage = lazy(() => import("@/pages/MarketplacePages").then(module => ({ default: module.InterestListPage })));
const TransactionsPage = lazy(() => import("@/pages/MarketplacePages").then(module => ({ default: module.TransactionsPage })));
const RequirementPage = lazy(() => import("@/pages/MarketplacePages").then(module => ({ default: module.RequirementPage })));
const MatchesPage = lazy(() => import("@/pages/MarketplacePages").then(module => ({ default: module.MatchesPage })));
const HelpPage = lazy(() => import("@/pages/AccountPages").then(module => ({ default: module.HelpPage })));
const HistoryPage = lazy(() => import("@/pages/AccountPages").then(module => ({ default: module.HistoryPage })));
const MarketPricesPage = lazy(() => import("@/pages/AccountPages").then(module => ({ default: module.MarketPricesPage })));
const NotificationsPage = lazy(() => import("@/pages/AccountPages").then(module => ({ default: module.NotificationsPage })));
const PerformancePage = lazy(() => import("@/pages/AccountPages").then(module => ({ default: module.PerformancePage })));
const ProfilePage = lazy(() => import("@/pages/AccountPages").then(module => ({ default: module.ProfilePage })));
const SchemesPage = lazy(() => import("@/pages/AccountPages").then(module => ({ default: module.SchemesPage })));
const WeatherPage = lazy(() => import("@/pages/AccountPages").then(module => ({ default: module.WeatherPage })));
const AIPage = lazy(() => import("@/pages/AIPage").then(module => ({ default: module.AIPage })));
const FarmCalendarPage = lazy(() => import("@/pages/CalendarPage").then(module => ({ default: module.FarmCalendarPage })));
const SystemStatusPage = lazy(() => import("@/pages/SystemPages").then(module => ({ default: module.SystemStatusPage })));
const FarmAnalysisPage = lazy(() => import("@/pages/FarmAnalysisPage").then(module => ({ default: module.FarmAnalysisPage })));
const SoilTestPage = lazy(() => import("@/pages/SoilTestPage").then(module => ({ default: module.SoilTestPage })));
const DiseaseCheckPage = lazy(() => import("@/pages/DiseaseCheckPage").then(module => ({ default: module.DiseaseCheckPage })));
const DocumentCenterPage = lazy(() => import("@/pages/DocumentCenterPage").then(module => ({ default: module.DocumentCenterPage })));

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: true }, mutations: { retry: 0 } } });
function usePageTitle(title: string) { const { language } = useLanguage(); useEffect(() => { document.title = `${translate(title, language)} · FarmSaathi`; }, [title, language]); }
function PublicRoute({ title, children }: { title: string; children: React.ReactNode }) { usePageTitle(title); return <>{children}</>; }
function Protected({ role, title, children }: { role?: "farmer" | "buyer"; title: string; children: React.ReactNode }) {
  const { user, loading } = useAuth(); const [, setLocation] = useLocation(); usePageTitle(title);
  useEffect(() => { if (!loading && user && role && user.role !== role) setLocation(user.role === "buyer" ? "/buyer" : "/farmer"); }, [loading, user, role, setLocation]);
  if (loading) return <main className="auth-loading"><LoadingState label="Opening your FarmAI workspace…" /></main>;
  if (!user) return <AuthPage />;
  if (role && user.role !== role) return <main className="auth-loading"><LoadingState label="Taking you to your workspace…" /></main>;
  return <AppShell>{children}</AppShell>;
}
function P({ title, role, children }: { title: string; role?: "farmer" | "buyer"; children: React.ReactNode }) { return <Protected role={role} title={title}>{children}</Protected>; }
function AuthOrDashboard({ role }: { role: "farmer" | "buyer" }) { const { user, loading } = useAuth(); if (loading) return <main className="auth-loading"><LoadingState /></main>; return user ? role === "buyer" ? <Protected role="buyer" title="Buyer workspace"><BuyerHome /></Protected> : <Protected role="farmer" title="Farm workspace"><FarmerHome /></Protected> : <AuthPage />; }
function LanguagePreferenceSync() {
  const { user, loading } = useAuth();
  const { language, setLanguage, explicitSelection } = useLanguage();
  const bootstrapped = useRef("");
  const lastSaved = useRef("");
  const userKey = user ? String(user._id || user.id || user.email) : "";
  useEffect(() => {
    if (loading || !userKey || bootstrapped.current === userKey) return;
    bootstrapped.current = userKey;
    if (explicitSelection) return;
    void api.auth.preferences().then(preferences => {
      const saved = preferences.language;
      if (saved === "en" || saved === "hi" || saved === "kn" || saved === "mr") setLanguage(saved, false);
      else if (user && (user.preferred_language === "en" || user.preferred_language === "hi" || user.preferred_language === "kn" || user.preferred_language === "mr")) setLanguage(user.preferred_language, false);
    }).catch(() => undefined);
  }, [loading, userKey, explicitSelection, setLanguage, user]);
  useEffect(() => {
    if (loading || !userKey || !explicitSelection) return;
    const signature = `${userKey}:${language}`;
    if (lastSaved.current === signature) return;
    lastSaved.current = signature;
    void api.auth.patchPreferences({ language }).catch(() => { lastSaved.current = ""; });
  }, [loading, userKey, explicitSelection, language]);
  return null;
}
function RouteTree() {
  return <Switch>
    <Route path="/"><PublicRoute title="Grow with more clarity"><Home /></PublicRoute></Route>
    <Route path="/login"><PublicRoute title="Sign in"><AuthPage /></PublicRoute></Route>
    <Route path="/register"><PublicRoute title="Create an account"><AuthPage mode="register" /></PublicRoute></Route>
    <Route path="/register/farmer"><PublicRoute title="Join as a farmer"><AuthPage mode="register" role="farmer" /></PublicRoute></Route>
    <Route path="/register/buyer"><PublicRoute title="Join as a buyer"><AuthPage mode="register" role="buyer" /></PublicRoute></Route>
    <Route path="/farmer"><AuthOrDashboard role="farmer" /></Route>
    <Route path="/buyer"><AuthOrDashboard role="buyer" /></Route>
    <Route path="/farmer/farms"><P title="My farms" role="farmer"><FarmListPage /></P></Route>
    <Route path="/farmer/farms/new"><P title="Add farm" role="farmer"><FarmFormPage /></P></Route>
    <Route path="/farmer/farms/:id/edit">{params => <P title="Edit farm" role="farmer"><FarmFormPage farmId={params.id} /></P>}</Route>
    <Route path="/farmer/farms/:id/fields/new">{params => <P title="Add field" role="farmer"><FieldFormPage farmId={params.id} /></P>}</Route>
    <Route path="/farmer/farms/:id">{params => <P title="Farm overview" role="farmer"><FarmDetailPage farmId={params.id} /></P>}</Route>
    <Route path="/farmer/fields/:id">{params => <P title="Field details" role="farmer"><FieldDetailPage fieldId={params.id} /></P>}</Route>
    <Route path="/farmer/crops"><P title="Crop journeys" role="farmer"><CropListPage /></P></Route>
    <Route path="/farmer/crops/new"><P title="Plan a growing season" role="farmer"><CropCreatePage /></P></Route>
    <Route path="/farmer/crops/:id/edit">{params => <P title="Edit crop" role="farmer"><CropEditPage cropId={params.id} /></P>}</Route>
    <Route path="/farmer/crops/:id">{params => <P title="Crop journey" role="farmer"><CropJourneyPage cropId={params.id} /></P>}</Route>
    {(["tasks", "irrigation", "inputs", "expenses", "health", "harvests"] as RecordKind[]).flatMap(kind => {
      const names: Record<RecordKind, string> = { tasks: "Tasks", irrigation: "Irrigation records", inputs: "Input records", expenses: "Expenses", health: "Crop health", harvests: "Harvests" };
      const paths: Record<RecordKind, string> = { tasks: "tasks", irrigation: "irrigation", inputs: "inputs", expenses: "expenses", health: "health", harvests: "harvests" };
      return [<Route key={`${kind}-new`} path={`/farmer/${paths[kind]}/new`}><P title={`Add ${names[kind].toLowerCase()}`} role="farmer"><RecordCreatePage kind={kind} /></P></Route>, <Route key={kind} path={`/farmer/${paths[kind]}`}><P title={names[kind]} role="farmer"><RecordListPage kind={kind} /></P></Route>];
    })}
    <Route path="/farmer/listings/new"><P title="Create a listing" role="farmer"><ListingCreatePage /></P></Route>
    <Route path="/farmer/calendar"><P title="Farm calendar" role="farmer"><FarmCalendarPage /></P></Route>
    <Route path="/farmer/status"><P title="System diagnostics" role="farmer"><SystemStatusPage /></P></Route>
    <Route path="/buyer/status"><P title="System diagnostics" role="buyer"><SystemStatusPage /></P></Route>
    <Route path="/status"><PublicRoute title="System status"><SystemStatusPage /></PublicRoute></Route>
    <Route path="/farmer/sell"><P title="Your produce listings" role="farmer"><MarketPage sellerView /></P></Route>
    <Route path="/farmer/market"><P title="Market context" role="farmer"><MarketPage /></P></Route>
    <Route path="/farmer/market/prices"><P title="Market prices" role="farmer"><MarketPricesPage /></P></Route>
    <Route path="/farmer/market/:id">{params => <P title="Produce listing" role="farmer"><ListingDetailPage listingId={params.id} /></P>}</Route>
    <Route path="/farmer/listings/:id">{params => <P title="Produce listing" role="farmer"><ListingDetailPage listingId={params.id} /></P>}</Route>
    <Route path="/farmer/buyer-interests"><P title="Buyer interest" role="farmer"><InterestListPage sellerSide /></P></Route>
    <Route path="/farmer/interests"><P title="Buyer interest" role="farmer"><InterestListPage sellerSide /></P></Route>
    <Route path="/farmer/transactions"><P title="Transactions" role="farmer"><TransactionsPage /></P></Route>
    <Route path="/farmer/ai"><P title="Ask FarmSaathi" role="farmer"><AIPage /></P></Route>
    <Route path="/farmer/analysis"><P title="Farm Health & Tests Hub" role="farmer"><FarmAnalysisPage /></P></Route>
    <Route path="/farmer/tests"><P title="Farm Health & Tests Hub" role="farmer"><FarmAnalysisPage /></P></Route>
    <Route path="/farmer/soil-tests"><P title="Soil Health & Tests" role="farmer"><SoilTestPage /></P></Route>
    <Route path="/farmer/fields/:id/soil">{params => <P title="Field Soil Health" role="farmer"><SoilTestPage initialFieldId={params.id} /></P>}</Route>
    <Route path="/farmer/disease-check"><P title="Leaf & Crop Disease Check" role="farmer"><DiseaseCheckPage /></P></Route>
    <Route path="/farmer/documents"><P title="Document & Report Center" role="farmer"><DocumentCenterPage /></P></Route>
    <Route path="/farmer/notifications"><P title="Notifications" role="farmer"><NotificationsPage /></P></Route>
    <Route path="/farmer/profile"><P title="Profile and settings" role="farmer"><ProfilePage /></P></Route>
    <Route path="/farmer/schemes"><P title="Schemes and support" role="farmer"><SchemesPage /></P></Route>
    <Route path="/farmer/weather"><P title="Weather" role="farmer"><WeatherPage /></P></Route>
    <Route path="/farmer/history"><P title="History" role="farmer"><HistoryPage /></P></Route>
    <Route path="/farmer/performance"><P title="Performance" role="farmer"><PerformancePage /></P></Route>
    <Route path="/farmer/help"><P title="Help" role="farmer"><HelpPage /></P></Route>
    <Route path="/buyer/market"><P title="Produce marketplace" role="buyer"><MarketPage /></P></Route>
    <Route path="/buyer/market/prices"><P title="Market prices" role="buyer"><MarketPricesPage /></P></Route>
    <Route path="/buyer/market/:id">{params => <P title="Produce listing" role="buyer"><ListingDetailPage listingId={params.id} /></P>}</Route>
    <Route path="/buyer/requirements"><P title="Sourcing requirements" role="buyer"><RequirementPage /></P></Route>
    <Route path="/buyer/requirements/new"><P title="Post a requirement" role="buyer"><RequirementPage createMode /></P></Route>
    <Route path="/buyer/requirements/:id/matches">{params => <P title="Potential matches" role="buyer"><MatchesPage requirementId={params.id} /></P>}</Route>
    <Route path="/buyer/matches"><P title="Potential matches" role="buyer"><MatchesPage /></P></Route>
    <Route path="/buyer/interests"><P title="Interests and replies" role="buyer"><InterestListPage /></P></Route>
    <Route path="/buyer/transactions"><P title="Transactions" role="buyer"><TransactionsPage /></P></Route>
    <Route path="/buyer/ai"><P title="Ask FarmAI" role="buyer"><AIPage /></P></Route>
    <Route path="/buyer/notifications"><P title="Notifications" role="buyer"><NotificationsPage /></P></Route>
    <Route path="/buyer/profile"><P title="Profile and settings" role="buyer"><ProfilePage /></P></Route>
    <Route path="/buyer/history"><P title="History" role="buyer"><HistoryPage /></P></Route>
    <Route path="/buyer/weather"><P title="Weather" role="buyer"><WeatherPage /></P></Route>
    <Route path="/buyer/help"><P title="Help" role="buyer"><HelpPage /></P></Route>
    <Route path="/help"><PublicRoute title="Help"><HelpPage /></PublicRoute></Route>
    <Route path="/404"><NotFound /></Route>
    <Route><NotFound /></Route>
  </Switch>;
}

function Providers() { return <ErrorBoundary><LanguageProvider><TranslateContent><AuthProvider><LanguagePreferenceSync /><AssistantGuide /><TooltipProvider><Toaster richColors position="top-right" /><Suspense fallback={<main className="auth-loading"><LoadingState label="Opening your FarmAI workspace…" /></main>}><RouteTree /></Suspense></TooltipProvider></AuthProvider></TranslateContent></LanguageProvider></ErrorBoundary>; }
export default function App() { return <QueryClientProvider client={queryClient}><Providers /></QueryClientProvider>; }
