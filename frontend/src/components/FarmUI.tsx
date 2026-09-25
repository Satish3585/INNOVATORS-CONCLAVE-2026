import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api, type Role, type User } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { GlobalSearchModal } from "@/components/GlobalSearchModal";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  FlaskConical,
  Home,
  Leaf,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Scan,
  Search,
  Settings2,
  Sprout,
  Store,
  UserRound,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className="brand-lockup" aria-label="FarmSaathi home" data-no-translate="true">
      <span className="brand-mark">
        <Sprout size={small ? 18 : 22} strokeWidth={2.1} />
      </span>
      {!small && (
        <span className="brand-name">
          Farm<span>Saathi</span>
          <small>GROW WITH CLARITY</small>
        </span>
      )}
    </Link>
  );
}

const farmerNav = [
  { label: "Home", href: "/farmer", icon: Home },
  { label: "FarmSaathi", href: "/farmer/ai", icon: Sprout },
  { label: "My farm", href: "/farmer/farms", icon: Leaf },
  { label: "Farm calendar", href: "/farmer/calendar", icon: CalendarDays },
  { label: "Sell produce", href: "/farmer/sell", icon: Store },
  { label: "Market", href: "/farmer/market", icon: Store },
];
const buyerNav = [
  { label: "Home", href: "/buyer", icon: Home },
  { label: "Market", href: "/buyer/market", icon: Store },
  { label: "Requirements", href: "/buyer/requirements", icon: Leaf },
  { label: "Interests", href: "/buyer/interests", icon: Sprout },
  { label: "Transactions", href: "/buyer/transactions", icon: Check },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role, logout } = useAuth();
  const [location] = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const nav = role === "buyer" ? buyerNav : farmerNav;
  const notifications = useQuery({ queryKey: ["notifications", "unread"], queryFn: api.notifications.unreadCount, enabled: Boolean(user), refetchInterval: 60_000 });
  const systemStatus = useQuery({ queryKey: ["system-status-indicator"], queryFn: api.system.status, refetchInterval: 30_000 });

  const isActive = (href: string) =>
    location === href ||
    (href !== "/farmer" && href !== "/buyer" && location.startsWith(href + "/")) ||
    ((href === "/farmer" || href === "/buyer") && location === href);
  const roleLabel = role === "buyer" ? "Produce buyer" : "Farm manager";
  const profileInitials = (user?.full_name || "F").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

  return (
    <div className="app-frame">
      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

      <aside className="sidebar">
        <div className="sidebar-brand"><Brand /></div>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {nav.map(item => (
            <Link key={item.href} href={item.href} className={`nav-link ${isActive(item.href) ? "active" : ""}`}>
              <item.icon size={18} strokeWidth={1.9} />
              <span>{item.label}</span>
              {item.label === "FarmSaathi" && <span className="nav-spark">AI</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-rule" />
        <div className="workspace-label">OPERATIONS & SUPPORT</div>
        <nav className="secondary-nav" aria-label="More navigation">
          {(role === "farmer" ? [
            { label: "Tests & Health Hub", href: "/farmer/analysis", icon: Activity },
            { label: "Soil Health & Tests", href: "/farmer/soil-tests", icon: FlaskConical },
            { label: "Crop Disease Check", href: "/farmer/disease-check", icon: Scan },
            { label: "Document Vault", href: "/farmer/documents", icon: FileText },
            { label: "Tasks & records", href: "/farmer/tasks", icon: Check },
            { label: "Harvests", href: "/farmer/harvests", icon: Sprout },
            { label: "Performance & costs", href: "/farmer/performance", icon: Activity },
            { label: "Schemes & support", href: "/farmer/schemes", icon: CircleHelp },
            { label: "System diagnostics", href: "/farmer/status", icon: Activity },
          ] : [
            { label: "Matching", href: "/buyer/matches", icon: Sprout },
            { label: "System diagnostics", href: "/buyer/status", icon: Activity },
          ]).map(item => (
            <Link key={item.href} href={item.href} className={`nav-link nav-link-secondary ${isActive(item.href) ? "active" : ""}`}>
              <item.icon size={17} />
              <span>{item.label}</span>
            </Link>
          ))}
          <Link href={`/${role}/notifications`} className={`nav-link nav-link-secondary ${isActive(`/${role}/notifications`) ? "active" : ""}`}>
            <Bell size={17} />
            <span>Notifications</span>
            {Boolean(notifications.data?.count) && <span className="notification-dot-count">{(notifications.data?.count || 0) > 9 ? "9+" : notifications.data?.count}</span>}
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <Link href={`/${role}/status`} className="connection-note" style={{ textDecoration: "none", cursor: "pointer" }}>
            <span className="connection-pulse" />
            <span>AI & Models Ready ✓</span>
          </Link>
          <div className="user-card">
            <div className="avatar avatar-small">{profileInitials}</div>
            <div className="user-meta">
              <strong>{user?.full_name || "FarmSaathi user"}</strong>
              <span>{roleLabel}</span>
            </div>
            <Link href={`/${role}/profile`} className="icon-button quiet" aria-label="Open profile"><Settings2 size={17} /></Link>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label={mobileMenu ? "Close navigation" : "Open navigation"}>
            {mobileMenu ? <X size={20} /> : <Menu size={20} />}
          </button>
          
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div className="topbar-context">
              <span className="context-mark"><Sprout size={14} /></span>
              <span>{role === "buyer" ? "FarmSaathi Market" : "Farm workspace"}</span>
              <ChevronDown size={14} className="muted-icon" />
            </div>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "6px 12px",
                borderRadius: "20px",
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                fontSize: "0.85rem",
                color: "#64748b",
                cursor: "pointer",
              }}
              title="Search farm records, crops, tasks, harvests"
            >
              <Search size={14} style={{ color: "#16a34a" }} />
              <span>Search farm records…</span>
              <kbd style={{ fontSize: "0.7rem", background: "#e2e8f0", padding: "1px 5px", borderRadius: "4px", color: "#475569" }}>
                Find
              </kbd>
            </button>
          </div>

          <div className="topbar-actions">
            <Link
              href={`/${role}/status`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "16px",
                fontSize: "0.78rem",
                fontWeight: 600,
                textDecoration: "none",
                background: "#f0fdf4",
                color: "#166534",
                border: "1px solid #bbf7d0",
              }}
              title="View live system health and ML model status"
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#16a34a" }} />
              <span>Diagnostic Status</span>
            </Link>

            <LanguageSwitcher compact className="workspace-language" />
            <Link href={`/${role}/notifications`} className="icon-button notification-button" aria-label="Notifications">
              <Bell size={19} />
              {Boolean(notifications.data?.count) && <span className="notification-pip" />}
            </Link>
            <Link href={`/${role}/profile`} className="avatar avatar-top" aria-label="Profile">{profileInitials}</Link>
            <button className="icon-button quiet sign-out" onClick={() => void logout()} aria-label="Sign out"><LogOut size={17} /></button>
          </div>
        </header>

        {mobileMenu && (
          <div className="mobile-drawer-backdrop" onClick={() => setMobileMenu(false)}>
            <nav className="mobile-drawer" onClick={event => event.stopPropagation()} aria-label="Mobile navigation">
              <div className="mobile-drawer-head">
                <Brand />
                <button className="icon-button" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18} /></button>
              </div>
              {[
                ...nav,
                ...(role === "farmer"
                  ? [
                      { label: "Tasks & records", href: "/farmer/tasks", icon: Check },
                      { label: "Crop health", href: "/farmer/health", icon: Leaf },
                      { label: "Harvests", href: "/farmer/harvests", icon: Sprout },
                      { label: "Schemes", href: "/farmer/schemes", icon: CircleHelp },
                      { label: "System diagnostics", href: "/farmer/status", icon: Activity },
                    ]
                  : [{ label: "Matching", href: "/buyer/matches", icon: Sprout }]),
                { label: "Notifications", href: `/${role}/notifications`, icon: Bell },
                { label: "Profile", href: `/${role}/profile`, icon: UserRound },
              ].map(item => (
                <Link key={item.href} href={item.href} className={`nav-link ${isActive(item.href) ? "active" : ""}`} onClick={() => setMobileMenu(false)}>
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </Link>
              ))}
              <button className="button button-ghost drawer-signout" onClick={() => void logout()}>
                <LogOut size={17} /> Sign out
              </button>
            </nav>
          </div>
        )}

        <main className="content-area">{children}</main>

        <nav className="bottom-nav" aria-label="Mobile primary navigation">
          {nav.slice(0, 5).map(item => (
            <Link key={item.href} href={item.href} className={`bottom-nav-item ${isActive(item.href) ? "active" : ""}`}>
              <item.icon size={20} strokeWidth={1.9} />
              <span>{item.label === "Sell produce" ? "Sell" : item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>;
}
export function Card({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) { return <section className={`surface-card ${className}`} {...props}>{children}</section>; }
export function StatCard({ label, value, note, icon: Icon, tone = "green" }: { label: string; value: ReactNode; note?: string; icon: typeof Leaf; tone?: string }) { return <Card className={`stat-card tone-${tone}`}><div className="stat-icon"><Icon size={19} /></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{note && <div className="stat-note">{note}</div>}</Card>; }
export function Badge({ children, kind = "neutral" }: { children: ReactNode; kind?: "neutral" | "success" | "warning" | "danger" | "info" | "ai" }) { return <span className={`badge badge-${kind}`}>{children}</span>; }
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-mark"><Sprout size={24} /></div><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function LoadingState({ label = "Loading your farm records…" }: { label?: string }) { return <div className="loading-state"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>; }
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div className="error-state"><AlertCircle size={19} /><span>{message}</span>{retry && <button className="text-button" onClick={retry}>Retry</button>}</div>; }
export function Button({ children, variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) { return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>; }
export function IconButton({ children, label, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) { return <button className={`icon-button ${className}`} aria-label={label} {...props}>{children}</button>; }
export function FieldLabel({ label, htmlFor, required, hint }: { label: string; htmlFor: string; required?: boolean; hint?: string }) { return <label className="field-label" htmlFor={htmlFor}>{label}{required && <span className="required-dot">*</span>}{hint && <small>{hint}</small>}</label>; }
export function TextInput({ label, id, error, hint, required, className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; error?: string; hint?: string }) { return <div className={`form-field ${className}`}><FieldLabel htmlFor={id} label={label} required={required} hint={hint} /><input id={id} className={`text-input ${error ? "input-error" : ""}`} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props} />{error && <span id={`${id}-error`} className="field-error">{error}</span>}</div>; }
export function SelectInput({ label, id, options, error, required, className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; id: string; options: Array<{ value: string; label: string }>; error?: string }) { return <div className={`form-field ${className}`}><FieldLabel htmlFor={id} label={label} required={required} /><select id={id} className={`text-input select-input ${error ? "input-error" : ""}`} aria-invalid={Boolean(error)} {...props}><option value="">Choose {label.toLowerCase()}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{error && <span className="field-error">{error}</span>}</div>; }
export function TextArea({ label, id, className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string }) { return <div className={`form-field ${className}`}><FieldLabel htmlFor={id} label={label} /><textarea id={id} className="text-input textarea-input" {...props} /></div>; }
export function SectionHeading({ title, action, note }: { title: string; action?: ReactNode; note?: string }) { return <div className="section-heading"><div><h2>{title}</h2>{note && <p>{note}</p>}</div>{action}</div>; }
export function PageSurface({ children, className = "" }: { children: ReactNode; className?: string }) { return <div className={`page-surface ${className}`}>{children}</div>; }
export function QuickAction({ icon: Icon, label, href, tone = "green" }: { icon: typeof Plus; label: string; href: string; tone?: string }) { return <Link href={href} className={`quick-action quick-${tone}`}><span><Icon size={18} /></span><strong>{label}</strong><ArrowRight size={15} className="quick-arrow" /></Link>; }
export function Avatar({ user, className = "" }: { user?: User | null; className?: string }) { const initials = (user?.full_name || "F").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase(); return <div className={`avatar ${className}`}>{initials}</div>; }
