import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowRight, CalendarDays, CheckCircle2, CircleAlert, Clock3, CloudSun, Leaf, MapPin, Package, Plus, Sprout, Store, WalletCards } from "lucide-react";
import { api, recordId, type IdRecord } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { qk, useBuyerDashboard, useFarmerDashboard, useFarms } from "@/hooks/useFarmData";
import { FarmJourneyLoop } from "@/components/FarmJourneyLoop";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeading, PageSurface, QuickAction, SectionHeading, StatCard } from "@/components/FarmUI";
import { formatDate } from "@/lib/locale";

const pretty = (value: unknown) => String(value || "Not recorded").replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
const dateLabel = (value: unknown) => value ? formatDate(String(value), { day: "numeric", month: "short" }) : "Date not set";
const listOf = (value: unknown): IdRecord[] => Array.isArray(value) ? value as IdRecord[] : [];

export function FarmerHome() {
  const { user } = useAuth();
  const home = useFarmerDashboard();
  const farms = useFarms();
  const perf = useQuery({ queryKey: ["performance"], queryFn: api.dashboard.performance });
  if (home.isLoading) return <PageSurface><PageHeading title="Your farm, in focus" subtitle="A clear view of what needs your attention today." /><LoadingState /></PageSurface>;
  if (home.isError) return <PageSurface><PageHeading title="Your farm, in focus" /><ErrorState message="Unable to load your farm records." retry={() => void home.refetch()} /></PageSurface>;
  const data = home.data || {};
  const crops = listOf(data.current_crops);
  const tasks = listOf(data.today_tasks);
  const attention = listOf(data.attention_items);
  const location = data.location as Record<string, unknown> | null;
  const performance = perf.data || {};
  const market = data.market_snapshot as Record<string, unknown> | null;
  const hasRecords = crops.length > 0 || farms.data?.items.length || tasks.length;
  const firstName = user?.full_name?.split(" ")[0] || "there";
  return <PageSurface>
    <PageHeading eyebrow="FARM CONTROL CENTER" title={`Good morning, ${firstName}.`} subtitle={<>{location ? <><MapPin size={14} /> {[location.village, location.district, location.state].filter(Boolean).join(", ") || "Your location"}</> : "Your field notes and next steps, together."}</>} action={<Link href="/farmer/crops/new" className="button button-primary"><Plus size={17} /> Add a crop</Link>} />
    <div className="dashboard-welcome-strip"><div className="welcome-mark"><Sprout size={19} /></div><div><strong>Today's farm brief</strong><span>{(data.today_farm_brief as { text?: string } | undefined)?.text || "Your saved farm records will appear here as you add them."}</span></div><span className="welcome-source"><span className="source-dot" /> FROM YOUR RECORDS</span></div>
    <FarmJourneyLoop />
    {!hasRecords && <div className="setup-banner"><div className="setup-copy"><div className="eyebrow">A GOOD PLACE TO BEGIN</div><h2>Start with the ground beneath your feet.</h2><p>Add a farm and a field to give FarmSaathi the context it needs to help you organize the season.</p><Link className="button button-dark" href="/farmer/farms/new">Add your first farm <ArrowRight size={16} /></Link></div><div className="setup-illustration"><div className="sun-orb" /><div className="field-line line-one" /><div className="field-line line-two" /><div className="field-line line-three" /><Sprout className="setup-sprout" size={86} strokeWidth={0.85} /></div></div>}
    <div className="stats-grid">
      <StatCard label="Active crops" value={crops.length} note="Across your crop journeys" icon={Sprout} />
      <StatCard label="Farms in your workspace" value={farms.data?.total ?? (farms.isLoading ? "—" : 0)} note="Your growing places" icon={Leaf} tone="earth" />
      <StatCard label="Recorded harvest" value={performance.harvested_quantity == null ? "—" : `${performance.harvested_quantity} kg`} note={performance.harvested_quantity == null ? "No harvest records yet" : `${performance.harvest_record_count ?? 0} harvest records`} icon={Package} tone="gold" />
      <StatCard label="Unread notifications" value={String(data.notification_count ?? 0)} note="Updates from your workspace" icon={CalendarDays} tone="blue" />
    </div>
    <div className="dashboard-columns">
      <div className="dashboard-main-stack">
        <Card className="attention-card"><SectionHeading title="Needs your attention" note="A short list, based on your latest records." action={<Link href="/farmer/notifications" className="inline-link">View all <ArrowRight size={14} /></Link>} />
          {attention.length ? <div className="attention-list">{attention.slice(0, 4).map((item, index) => <Link key={recordId(item) || index} href={item.reference_type === "task" ? "/farmer/tasks" : item.reference_type === "interest" ? "/farmer/buyer-interests" : item.reference_type === "health_check" ? "/farmer/health" : "/farmer/listings"} className="attention-row"><span className={`attention-icon att-${String(item.priority || "normal")}`}><CircleAlert size={17} /></span><span className="attention-text"><strong>{String(item.title || "Farm update")}</strong><small>{String(item.message || "Review the linked record for details.")}</small></span><ArrowRight size={15} className="muted-icon" /></Link>)}</div> : <div className="attention-clear"><CheckCircle2 size={20} /><span>No urgent follow-ups are recorded.</span></div>}
        </Card>
        <Card className="crop-panel"><SectionHeading title="Your crop journeys" note="Active cycles from the records you've created." action={<Link href="/farmer/crops" className="inline-link">All crops <ArrowRight size={14} /></Link>} />
          {crops.length ? <div className="crop-list">{crops.slice(0, 4).map((crop, index) => <Link className="crop-row" key={recordId(crop) || index} href={`/farmer/crops/${recordId(crop)}`}><div className={`crop-monogram crop-color-${index % 4}`}><Sprout size={19} /></div><div className="crop-row-main"><strong>{String(crop.crop_name || "Crop")}</strong><span>{String(crop.variety || "Variety not recorded")} · {pretty(crop.growth_stage)}</span></div><div className="crop-row-date"><small>EXPECTED HARVEST</small><b>{dateLabel(crop.expected_harvest_date)}</b></div><ArrowRight size={15} className="muted-icon" /></Link>)}</div> : <EmptyState title="Your crop journeys will grow here" description="Add a cultivation and its crops to keep the season's records connected." action={<Link href="/farmer/crops/new" className="button button-secondary">Create cultivation <ArrowRight size={15} /></Link>} />}
        </Card>
        <Card className="task-panel"><SectionHeading title="Today's tasks" note="Only tasks you've recorded are shown." action={<Link href="/farmer/tasks" className="inline-link">Task list <ArrowRight size={14} /></Link>} />
          {tasks.length ? <div className="task-preview-list">{tasks.slice(0, 4).map((task, index) => <div className="task-preview" key={recordId(task) || index}><span className="task-checkbox"><CheckCircle2 size={17} /></span><div><strong>{String(task.title || task.name || "Farm task")}</strong><small><Clock3 size={12} /> {dateLabel(task.due_date)}</small></div><Badge kind={task.priority === "high" ? "warning" : "neutral"}>{pretty(task.priority || "normal")}</Badge></div>)}</div> : <div className="inline-empty">{hasRecords ? "Nothing is scheduled for today." : "Your recorded tasks will appear here."}<Link href="/farmer/tasks">Open tasks <ArrowRight size={14} /></Link></div>}
        </Card>
      </div>
      <aside className="dashboard-side-stack">
        <Card className="market-preview"><div className="market-card-header"><div><div className="eyebrow">LOCAL MARKET</div><h3>Know your market.</h3></div><div className="market-icon"><Store size={19} /></div></div>{market?.available ? <><div className="market-actual"><strong>Prices available</strong><span>See verified rates and their source.</span></div><Link href="/farmer/market" className="market-card-link">View market information <ArrowRight size={15} /></Link></> : <><div className="market-empty-icon"><CloudSun size={20} /></div><p className="market-unavailable">Market data unavailable</p><small>{String(market?.reason || "No live market provider is configured.")}</small><Link href="/farmer/market" className="market-card-link">Check market page <ArrowRight size={15} /></Link></>}</Card>
        <Card className="ai-insight-card"><div className="ai-insight-top"><span className="ai-mini-mark"><Sprout size={17} /></span><Badge kind="ai">FARMSAATHI INSIGHT</Badge></div><h3>Grounded in your<br />farm records.</h3><p>{((data.farm_ai_insight as { text?: string; reason?: string } | undefined)?.text) || "Ask about a crop, task or recent record. FarmSaathi will be clear when a provider isn't available."}</p><Link href="/farmer/ai" className="button button-dark ai-card-button">Ask FarmSaathi <ArrowRight size={15} /></Link></Card>
        <div className="quick-action-section"><SectionHeading title="Quick actions" /> <div className="quick-action-grid"><QuickAction label="Add farm" icon={Plus} href="/farmer/farms/new" /><QuickAction label="Record task" icon={CalendarDays} href="/farmer/tasks?new=1" tone="earth" /><QuickAction label="Add harvest" icon={Package} href="/farmer/harvests/new" tone="gold" /><QuickAction label="Sell produce" icon={Store} href="/farmer/sell" tone="blue" /></div></div>
      </aside>
    </div>
    <div className="dashboard-footer-note"><ArrowDownRight size={15} /> FarmSaathi shows only records and data returned by your connected service.</div>
  </PageSurface>;
}

export function BuyerHome() {
  const { user } = useAuth();
  const dashboard = useBuyerDashboard();
  const listings = useQuery({ queryKey: qk.listings, queryFn: () => api.marketplace.listings({ limit: 5, offset: 0 }) });
  if (dashboard.isLoading) return <PageSurface><PageHeading title="Market, in focus" /><LoadingState /></PageSurface>;
  if (dashboard.isError) return <PageSurface><PageHeading title="Market, in focus" /><ErrorState message="Unable to load your buyer workspace." retry={() => void dashboard.refetch()} /></PageSurface>;
  const info = dashboard.data || {};
  const count = (value: unknown) => typeof value === "number" ? value : 0;
  return <PageSurface>
    <PageHeading eyebrow="BUYER WORKSPACE" title={`Good to see you, ${user?.full_name?.split(" ")[0] || "there"}.`} subtitle="A clearer way to source from the people who grow." action={<Link href="/buyer/requirements/new" className="button button-primary"><Plus size={17} /> Post a requirement</Link>} />
    <div className="buyer-welcome-card"><div className="buyer-welcome-copy"><Badge kind="success">DIRECT SOURCING</Badge><h2>Find the right harvest,<br /><em>at the right time.</em></h2><p>Browse available listings or share what your business needs. Matching is informational, not a guarantee.</p><Link href="/buyer/market" className="button button-dark">Explore the market <ArrowRight size={15} /></Link></div><div className="buyer-welcome-orbit"><div className="orbit-ring ring-outer" /><div className="orbit-ring ring-inner" /><div className="orbit-center"><Leaf size={31} /></div><span className="orbit-point point-one" /><span className="orbit-point point-two" /><span className="orbit-point point-three" /></div></div>
    <div className="stats-grid buyer-stats"><StatCard label="Active requirements" value={count(info.active_requirements)} note="Demand posts in your account" icon={Leaf} /><StatCard label="Pending interests" value={count(info.pending_interests)} note="Replies from growers" icon={Clock3} tone="earth" /><StatCard label="Active transactions" value={count(info.active_transactions)} note="Created or confirmed" icon={WalletCards} tone="gold" /><StatCard label="Unread notifications" value={count(info.unread_notifications)} note="Marketplace updates" icon={CalendarDays} tone="blue" /></div>
    <div className="buyer-main-grid"><Card><SectionHeading title="Recently available" note="Listings returned by the live marketplace API." action={<Link href="/buyer/market" className="inline-link">Browse all <ArrowRight size={14} /></Link>} />{listings.isLoading ? <LoadingState label="Loading available listings…" /> : listings.isError ? <ErrorState message="Marketplace listings could not be loaded." retry={() => void listings.refetch()} /> : listings.data?.items.length ? <div className="market-mini-list">{listings.data.items.map((listing, i) => <Link className="market-mini-row" key={recordId(listing) || i} href={`/buyer/market/${recordId(listing)}`}><div className={`crop-monogram crop-color-${i % 4}`}><Sprout size={18} /></div><div><strong>{String(listing.crop_name || "Produce")}</strong><span>{String(listing.remaining_quantity)} {String(listing.unit || "kg")} available · {String(listing.quality_grade || "Grade not recorded")}</span></div><b>{String(listing.currency || "INR")} {String(listing.price_per_unit)}<small> / {String(listing.unit || "kg")}</small></b><ArrowRight size={14} /></Link>)}</div> : <EmptyState title="No active listings yet" description="The marketplace will show grower-posted produce here when it's available." action={<Button onClick={() => window.location.assign("/buyer/market")}>Open market <ArrowRight size={15} /></Button>} />}</Card>
      <Card className="buyer-match-card"><div className="eyebrow">YOUR SOURCING BOARD</div><h3>Matching starts<br />with your needs.</h3><p>Post a requirement to compare live listings against quantity, grade and location criteria.</p><Link href="/buyer/requirements" className="button button-secondary">View requirements <ArrowRight size={15} /></Link><div className="match-factors"><span><CheckCircle2 size={14} /> Crop & grade</span><span><CheckCircle2 size={14} /> Quantity range</span><span><CheckCircle2 size={14} /> Approximate location</span></div></Card></div>
  </PageSurface>;
}
