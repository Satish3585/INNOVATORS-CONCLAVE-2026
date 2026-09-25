import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  Check,
  CircleHelp,
  CloudSun,
  ExternalLink,
  FileText,
  Leaf,
  LockKeyhole,
  MapPin,
  Settings2,
  Sprout,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, recordId, request, type IdRecord } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, type Language } from "@/contexts/LanguageContext";
import { formatDate } from "@/lib/locale";
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

const pretty = (v: unknown) =>
  String(v ?? "Not recorded")
    .replaceAll("_", " ")
    .replace(/\b\w/g, x => x.toUpperCase());
const dateLabel = (v: unknown) =>
  v
    ? formatDate(String(v), {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not recorded";

export function ProfilePage() {
  const { role, refresh } = useAuth();
  const { language, setLanguage } = useLanguage();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: api.auth.me });
  const prefs = useQuery({
    queryKey: ["preferences"],
    queryFn: api.auth.preferences,
  });
  const buyer = role === "buyer";
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      buyer ? api.auth.patchBuyerProfile(payload) : api.auth.patchMe(payload),
    onSuccess: async () => {
      setSaved(true);
      await qc.invalidateQueries({ queryKey: ["profile"] });
      await refresh();
      toast.success("Your profile was updated.");
    },
    onError: e => toast.error(errorMessage(e)),
  });
  const savePrefs = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.auth.patchPreferences(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["preferences"] });
      toast.success("Preferences saved.");
    },
    onError: e => toast.error(errorMessage(e)),
  });
  const profileUser = profile.data?.user;
  const location = profileUser?.location as Record<string, string> | undefined;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setLanguage(String(fd.get("language") || "en") as Language);
    const city = String(fd.get("city") || "").trim();
    const district = String(fd.get("district") || "").trim();
    const state = String(fd.get("state") || "").trim();
    const address = String(fd.get("address") || "").trim();
    const loc =
      city || district || state || address
        ? {
            source: "manual",
            ...(city ? { city, village: city } : {}),
            ...(district ? { district } : {}),
            ...(state ? { state } : {}),
            ...(address ? { address } : {}),
          }
        : undefined;
    save.mutate({
      full_name: String(fd.get("full_name") || "").trim(),
      phone: fd.get("phone") || null,
      preferred_language: fd.get("language") || "en",
      ...(buyer
        ? {
            business_name: fd.get("business_name") || null,
            buyer_type: fd.get("buyer_type") || null,
          }
        : {
            age: Number(fd.get("age")),
            gender: fd.get("gender"),
            farmer_type: fd.get("farmer_type") || null,
            farming_experience_years: fd.get("experience")
              ? Number(fd.get("experience"))
              : null,
          }),
      ...(loc ? { location: loc } : {}),
    });
  }
  function preferencesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setLanguage(String(fd.get("language") || "en") as Language);
    savePrefs.mutate({
      language: fd.get("language"),
      units: fd.get("units"),
      notification_channels: fd.getAll("channels"),
      weather_location: fd.get("weather_location") || undefined,
      market_location: fd.get("market_location") || undefined,
    });
  }
  if (profile.isLoading)
    return (
      <PageSurface>
        <LoadingState label="Loading your profile…" />
      </PageSurface>
    );
  if (profile.isError || !profileUser)
    return (
      <PageSurface>
        <PageHeading title="Profile & preferences" />
        <ErrorState
          message={errorMessage(profile.error)}
          retry={() => void profile.refetch()}
        />
      </PageSurface>
    );
  const channels = Array.isArray(prefs.data?.notification_channels)
    ? (prefs.data.notification_channels as string[])
    : ["in_app"];
  return (
    <PageSurface>
      <PageHeading
        eyebrow="YOUR ACCOUNT"
        title="Profile & preferences."
        subtitle="Keep your contact details and location up to date. Your role is managed by the backend."
      />
      <div className="profile-layout">
        <div className="profile-main">
          <Card className="form-card">
            <div className="profile-card-intro">
              <div className="profile-avatar-large">
                {profileUser.full_name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map(x => x[0])
                  .join("")
                  .toUpperCase()}
              </div>
              <div>
                <div className="eyebrow">
                  {buyer ? "BUYER ACCOUNT" : "FARMER ACCOUNT"}
                </div>
                <h2>{profileUser.full_name}</h2>
                <span>{profileUser.email}</span>
              </div>
              <Badge kind="success">Active</Badge>
            </div>
            <form className="record-form" onSubmit={submit}>
              <div className="form-grid">
                <TextInput
                  label="Full name"
                  id="profile-name"
                  name="full_name"
                  required
                  defaultValue={profileUser.full_name}
                />
                <TextInput
                  label="Email address"
                  id="profile-email"
                  value={profileUser.email}
                  readOnly
                  hint="Email changes are not supported by the connected API."
                />
                <TextInput
                  label="Phone number"
                  id="profile-phone"
                  name="phone"
                  type="tel"
                  required={!buyer}
                  inputMode="tel"
                  defaultValue={String(profileUser.phone || "")}
                  placeholder={buyer ? "Optional" : "+91 98765 43210"}
                  hint={
                    buyer ? undefined : "Required · include your country code"
                  }
                />
                <SelectInput
                  label="Preferred language"
                  id="profile-language"
                  name="language"
                  value={language}
                  onChange={event => setLanguage(event.target.value as Language)}
                  options={[
                    { value: "en", label: "English" },
                    { value: "hi", label: "हिन्दी" },
                    { value: "kn", label: "ಕನ್ನಡ" },
                    { value: "mr", label: "मराठी" },
                  ]}
                />
                {buyer ? (
                  <>
                    <TextInput
                      label="Business name"
                      id="profile-business"
                      name="business_name"
                      defaultValue={String(profileUser.business_name || "")}
                      placeholder="Optional"
                    />
                    <TextInput
                      label="Buyer type"
                      id="profile-buyer-type"
                      name="buyer_type"
                      defaultValue={String(profileUser.buyer_type || "")}
                      placeholder="e.g. Retailer, processor"
                    />
                  </>
                ) : (
                  <>
                    <TextInput
                      label="Age"
                      id="profile-age"
                      name="age"
                      type="number"
                      min="1"
                      max="120"
                      required
                      inputMode="numeric"
                      defaultValue={String(profileUser.age ?? "")}
                      placeholder="Enter your age"
                    />
                    <SelectInput
                      label="Gender"
                      id="profile-gender"
                      name="gender"
                      required
                      defaultValue={String(profileUser.gender || "")}
                      options={[
                        { value: "female", label: "Female" },
                        { value: "male", label: "Male" },
                        { value: "non_binary", label: "Non-binary" },
                        { value: "other", label: "Other" },
                        {
                          value: "prefer_not_to_say",
                          label: "Prefer not to say",
                        },
                      ]}
                    />
                    <TextInput
                      label="Farmer type"
                      id="profile-farmer-type"
                      name="farmer_type"
                      defaultValue={String(profileUser.farmer_type || "")}
                      placeholder="Optional"
                    />
                    <TextInput
                      label="Years of farming experience"
                      id="profile-experience"
                      name="experience"
                      type="number"
                      min="0"
                      max="100"
                      defaultValue={String(
                        profileUser.farming_experience_years || ""
                      )}
                      placeholder="Optional"
                    />
                  </>
                )}
              </div>
              <div className="location-fields">
                <div className="location-helper">
                  <MapPin size={15} />
                  <span>
                    Approximate location supports weather and market context.
                    You can leave it blank.
                  </span>
                </div>
                <div className="form-grid">
                  <TextInput
                    label="Village or city"
                    id="profile-city"
                    name="city"
                    defaultValue={location?.village || location?.city}
                  />
                  <TextInput
                    label="District"
                    id="profile-district"
                    name="district"
                    defaultValue={location?.district}
                  />
                  <TextInput
                    label="State"
                    id="profile-state"
                    name="state"
                    defaultValue={location?.state}
                  />
                  <TextInput
                    label="Address"
                    id="profile-address"
                    name="address"
                    defaultValue={location?.address}
                  />
                </div>
              </div>
              <div className="form-actions">
                <span className="role-locked-note">
                  <LockKeyhole size={14} /> {profileUser.role} role is set by
                  the API
                </span>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending
                    ? "Saving…"
                    : saved
                      ? "Saved"
                      : "Save profile"}
                  <Check size={15} />
                </Button>
              </div>
            </form>
          </Card>
          <Card className="form-card">
            <SectionHeading
              title="Workspace preferences"
              note="These settings are saved to your account."
            />
            <form className="record-form" onSubmit={preferencesSubmit}>
              <div className="form-grid">
                <SelectInput
                  label="Language"
                  id="pref-language"
                  name="language"
                  value={language}
                  onChange={event => setLanguage(event.target.value as Language)}
                  options={[
                    { value: "en", label: "English" },
                    { value: "hi", label: "हिन्दी" },
                    { value: "kn", label: "ಕನ್ನಡ" },
                    { value: "mr", label: "मराठी" },
                  ]}
                />
                <SelectInput
                  label="Units"
                  id="pref-units"
                  name="units"
                  defaultValue={String(prefs.data?.units || "metric")}
                  options={[
                    { value: "metric", label: "Metric" },
                    { value: "imperial", label: "Imperial" },
                  ]}
                />
                <TextInput
                  label="Weather location note"
                  id="pref-weather"
                  name="weather_location"
                  defaultValue={String(prefs.data?.weather_location || "")}
                  placeholder="Optional"
                />
                <TextInput
                  label="Market location note"
                  id="pref-market"
                  name="market_location"
                  defaultValue={String(prefs.data?.market_location || "")}
                  placeholder="Optional"
                />
              </div>
              <fieldset className="channel-options">
                <legend>Notification channels</legend>
                {[
                  { value: "in_app", label: "In-app notifications" },
                  { value: "email", label: "Email" },
                  { value: "sms", label: "SMS" },
                  { value: "push", label: "Push" },
                ].map(option => (
                  <label key={option.value}>
                    <input
                      type="checkbox"
                      name="channels"
                      value={option.value}
                      defaultChecked={channels.includes(option.value)}
                    />{" "}
                    {option.label}
                  </label>
                ))}
                <small>
                  The backend stores preferences; delivery integrations may not
                  be configured.
                </small>
              </fieldset>
              <div className="form-actions">
                <span className="role-locked-note">
                  <Settings2 size={14} /> Notification delivery availability
                  varies
                </span>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={savePrefs.isPending}
                >
                  {savePrefs.isPending ? "Saving…" : "Save preferences"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
        <aside className="profile-side">
          <Card className="profile-status-card">
            <div className="eyebrow">PROFILE COMPLETION</div>
            <h3>
              {profile.data?.profile_completion?.complete
                ? "Looking good."
                : "A little more context helps."}
            </h3>
            <p>
              {profile.data?.profile_completion?.complete
                ? "Your required profile details are present."
                : `Still needed: ${profile.data?.profile_completion?.missing_fields?.join(", ") || "some profile fields"}.`}
            </p>
            <div className="profile-progress">
              <span
                style={{
                  width: profile.data?.profile_completion?.complete
                    ? "100%"
                    : "62%",
                }}
              />
            </div>
            <small>
              This check uses the backend's required profile fields.
            </small>
          </Card>
          <SecurityCard />
          <Card className="profile-side-note">
            <ShieldCheckIcon />
            <p>
              Location is optional. Weather and market cards report unavailable
              when a configured provider or usable coordinates are missing.
            </p>
          </Card>
        </aside>
      </div>
    </PageSurface>
  );
}
function ShieldCheckIcon() {
  return (
    <div className="side-note-icon">
      <LockKeyhole size={17} />
    </div>
  );
}
function SecurityCard() {
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () =>
      request<{ sessions: IdRecord[]; note: string }>(
        "/profile/security/sessions"
      ),
  });
  return (
    <Card className="security-card">
      <div className="eyebrow">ACCOUNT SECURITY</div>
      <h3>
        <LockKeyhole size={17} /> Active sessions
      </h3>
      {sessions.isLoading ? (
        <LoadingState label="Checking sessions…" />
      ) : sessions.isError ? (
        <ErrorState
          message="Session details are unavailable."
          retry={() => void sessions.refetch()}
        />
      ) : (
        <>
          <p>
            {sessions.data?.sessions.length || 0} active token session
            {sessions.data?.sessions.length === 1 ? "" : "s"} reported by the
            backend.
          </p>
          <small>{sessions.data?.note}</small>
        </>
      )}
    </Card>
  );
}

export function NotificationsPage() {
  const qc = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications", { limit: 50, offset: 0 }],
    queryFn: () => api.notifications.list({ limit: 50, offset: 0 }),
  });
  const unread = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: api.notifications.unreadCount,
  });
  const mark = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Notification marked as read.");
    },
    onError: e => toast.error(errorMessage(e)),
  });
  const markAll = useMutation({
    mutationFn: api.notifications.markAllRead,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All notifications marked as read.");
    },
    onError: e => toast.error(errorMessage(e)),
  });
  return (
    <PageSurface>
      <PageHeading
        eyebrow="UPDATES"
        title="Notifications."
        subtitle="Only messages saved by the backend are shown here."
        action={
          Boolean(unread.data?.count) ? (
            <Button
              variant="secondary"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <Check size={15} /> Mark all read
            </Button>
          ) : undefined
        }
      />
      <div className="notification-summary">
        <span className="notification-summary-icon">
          <Bell size={19} />
        </span>
        <span>
          <strong>{unread.data?.count || 0} unread</strong>
          <small>{notifications.data?.total || 0} stored notifications</small>
        </span>
      </div>
      {notifications.isLoading ? (
        <LoadingState label="Loading notifications…" />
      ) : notifications.isError ? (
        <ErrorState
          message={errorMessage(notifications.error)}
          retry={() => void notifications.refetch()}
        />
      ) : notifications.data?.items.length ? (
        <div className="notification-list">
          {notifications.data.items.map((item, index) => (
            <Card
              key={recordId(item) || index}
              className={`notification-card ${item.read_at ? "read" : "unread"}`}
            >
              <span className={`notification-symbol notification-${index % 4}`}>
                <Bell size={17} />
              </span>
              <div className="notification-copy">
                <div className="notification-title-row">
                  <h3>{String(item.title || "FarmAI update")}</h3>
                  {!item.read_at && <Badge kind="info">New</Badge>}
                </div>
                <p>{String(item.message || "No message content.")}</p>
                <span>{dateLabel(item.created_at)}</span>
                {item.reference_type && (
                  <small>Linked record · {pretty(item.reference_type)}</small>
                )}
              </div>
              {!item.read_at && (
                <Button
                  variant="ghost"
                  className="read-button"
                  disabled={mark.isPending}
                  onClick={() => mark.mutate(recordId(item))}
                >
                  Mark read <Check size={14} />
                </Button>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="You're all caught up"
          description="When a farmer gets buyer interest or a transaction changes state, backend notifications will appear here."
        />
      )}
    </PageSurface>
  );
}

export function MarketPricesPage() {
  const [crop, setCrop] = useState("");
  const query = useQuery({
    queryKey: ["market-prices", crop],
    queryFn: () => api.support.marketPrices(crop.trim() || undefined),
  });
  return (
    <PageSurface>
      <PageHeading
        eyebrow="LIVE MARKET DATA"
        title="Market prices."
        subtitle="Only data from the configured backend provider is shown. No estimates are substituted."
      />
      <div className="market-data-toolbar">
        <TextInput
          label="Crop filter"
          id="price-crop"
          value={crop}
          onChange={e => setCrop(e.target.value)}
          placeholder="e.g. tomato"
        />
        <Button variant="secondary" onClick={() => void query.refetch()}>
          <Store size={15} /> Refresh prices
        </Button>
      </div>
      {query.isLoading ? (
        <LoadingState label="Checking market data provider…" />
      ) : query.isError ? (
        <ErrorState
          message={errorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : query.data?.available ? (
        <Card>
          <div className="market-data-source">
            <span>
              <span className="source-dot" /> Live provider
            </span>
            <span>Retrieved {dateLabel(query.data.retrieved_at)}</span>
          </div>
          <div className="record-table-wrap">
            <table className="record-table">
              <thead>
                <tr>
                  <th>CROP</th>
                  <th>MARKET</th>
                  <th>PRICE</th>
                  <th>UNIT</th>
                  <th>DATE</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((item, i) => (
                  <tr key={recordId(item) || i}>
                    <td>
                      <strong>
                        {String(item.crop || item.crop_name || crop || "Crop")}
                      </strong>
                    </td>
                    <td>
                      {String(item.market || item.mandi || "Not supplied")}
                    </td>
                    <td>
                      {String(item.currency || "INR")}{" "}
                      {String(item.price || item.modal_price || "—")}
                    </td>
                    <td>{String(item.unit || "Not supplied")}</td>
                    <td>
                      {dateLabel(
                        item.date || item.updated_at || item.created_at
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="provider-unavailable">
          <CloudSun size={25} />
          <h3>Market prices aren't connected.</h3>
          <p>
            {query.data?.reason ||
              "A configured provider did not return current data."}{" "}
            This page will not show sample prices.
          </p>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Try again <ArrowRight size={15} />
          </Button>
        </div>
      )}
    </PageSurface>
  );
}

export function WeatherPage() {
  const { role } = useAuth();
  const query = useQuery({
    queryKey: ["weather"],
    queryFn: () => api.support.weather(),
  });
  const result = query.data as Record<string, unknown> | undefined;
  return (
    <PageSurface>
      <PageHeading
        eyebrow="WEATHER"
        title="Weather for your place."
        subtitle="Weather is supplied by your connected provider; FarmAI does not forecast from your location without data."
      />
      {query.isLoading ? (
        <LoadingState label="Checking weather provider…" />
      ) : query.isError ? (
        <ErrorState
          message={errorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : result?.available && result.data ? (
        <Card className="weather-card">
          <div className="weather-card-icon">
            <CloudSun size={27} />
          </div>
          <div className="eyebrow">
            CURRENT CONDITIONS ·{" "}
            {String(result.source || "CONFIGURED PROVIDER")}
          </div>
          <pre>{JSON.stringify(result.data, null, 2)}</pre>
          <small>
            Data returned by your provider. See provider metadata for its
            observation time.
          </small>
        </Card>
      ) : (
        <div className="provider-unavailable">
          <CloudSun size={25} />
          <h3>Weather isn't available yet.</h3>
          <p>
            {String(
              result?.reason ||
                "Add a location with coordinates and make sure a weather provider is configured."
            )}
          </p>
          <Link className="button button-secondary" href={`/${role}/profile`}>
            Update profile location <MapPin size={15} />
          </Link>
        </div>
      )}
    </PageSurface>
  );
}

export function SchemesPage() {
  const query = useQuery({
    queryKey: ["schemes"],
    queryFn: () => api.support.schemes({ limit: 50, offset: 0 }),
  });
  return (
    <PageSurface>
      <PageHeading
        eyebrow="PUBLIC SUPPORT"
        title="Verified schemes & support."
        subtitle="Only active scheme records with an official URL and recent verification are shown by the API."
      />
      {query.isLoading ? (
        <LoadingState label="Loading verified schemes…" />
      ) : query.isError ? (
        <ErrorState
          message={errorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : query.data?.items.length ? (
        <div className="scheme-grid">
          {query.data.items.map((scheme, index) => (
            <Card key={recordId(scheme) || index} className="scheme-card">
              <div className="scheme-card-top">
                <span className="scheme-icon">
                  <FileText size={19} />
                </span>
                <Badge kind="success">Verified</Badge>
              </div>
              <h3>
                {String(scheme.name || scheme.title || "Government scheme")}
              </h3>
              <p>
                {String(
                  scheme.summary ||
                    scheme.description ||
                    "Open the official source to review scheme information and eligibility."
                )}
              </p>
              <div className="scheme-details">
                <span>
                  Last verified
                  <strong>{dateLabel(scheme.last_verified)}</strong>
                </span>
                <span>
                  State<strong>{String(scheme.state || "National")}</strong>
                </span>
              </div>
              <a
                className="button button-secondary full-button"
                href={String(scheme.official_url)}
                target="_blank"
                rel="noreferrer"
              >
                Visit official source <ExternalLink size={15} />
              </a>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No recently verified schemes"
          description="The API will show only active records with an official URL and a verification date within the last 180 days."
        />
      )}
    </PageSurface>
  );
}

export function HistoryPage() {
  const query = useQuery({
    queryKey: ["history"],
    queryFn: () => api.dashboard.history({ limit: 50, offset: 0 }),
  });
  return (
    <PageSurface>
      <PageHeading
        eyebrow="YOUR ACTIVITY"
        title="History."
        subtitle="Recent items returned from your farm and marketplace records."
      />
      {query.isLoading ? (
        <LoadingState label="Loading account history…" />
      ) : query.isError ? (
        <ErrorState
          message={errorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : query.data?.items.length ? (
        <Card>
          <div className="record-list-top">
            <span>{query.data.total} records</span>
            <span>Newest first</span>
          </div>
          <div className="history-list">
            {query.data.items.map((item, index) => (
              <div className="history-row" key={recordId(item) || index}>
                <span className={`history-icon history-${index % 4}`}>
                  <Leaf size={16} />
                </span>
                <div>
                  <strong>
                    {String(
                      item.title ||
                        item.name ||
                        item.crop_name ||
                        item.crop ||
                        pretty(item.record_type)
                    )}
                  </strong>
                  <span>
                    {pretty(item.record_type)} ·{" "}
                    {dateLabel(item.created_at || item.updated_at)}
                  </span>
                </div>
                <Badge>{pretty(item.status || "saved")}</Badge>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          title="Your history is just getting started"
          description="As you save farms, crops, tasks and transactions, this activity feed will grow."
        />
      )}
    </PageSurface>
  );
}

export function PerformancePage() {
  const query = useQuery({
    queryKey: ["performance"],
    queryFn: api.dashboard.performance,
  });
  return (
    <PageSurface>
      <PageHeading
        eyebrow="RECORDED PERFORMANCE"
        title="Your farm, in numbers."
        subtitle="Only values already present in your backend records are displayed. No yield forecasts are generated."
      />
      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          message={errorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : (
        <Card>
          <div className="performance-json">
            {Object.entries(query.data || {})
              .filter(([key]) => !["owner_id", "_id"].includes(key))
              .map(([key, value]) => (
                <div className="performance-item" key={key}>
                  <span>{pretty(key)}</span>
                  <strong>
                    {typeof value === "object" && value !== null
                      ? Array.isArray(value)
                        ? `${value.length} records`
                        : "Details available"
                      : String(value ?? "—")}
                  </strong>
                </div>
              ))}
          </div>
          {!Object.keys(query.data || {}).length && (
            <EmptyState
              title="Not enough records yet"
              description="As you add harvests, expenses and related farm activity, performance summaries will appear here."
            />
          )}
        </Card>
      )}
    </PageSurface>
  );
}

export function HelpPage() {
  const query = useQuery({
    queryKey: ["help"],
    queryFn: () =>
      request<{
        topics: string[];
        contact: string | null;
        available: boolean;
        reason?: string;
      }>("/help", { anonymous: true }),
  });
  return (
    <PageSurface>
      <PageHeading
        eyebrow="SUPPORT"
        title="Help with FarmAI."
        subtitle="Connected support topics and contact availability."
      />
      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          message={errorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : (
        <Card className="help-card">
          <span className="help-icon">
            <CircleHelp size={21} />
          </span>
          <h2>We're here to help you find your way.</h2>
          <p>{query.data?.reason || "Browse the support topics below."}</p>
          <div className="help-topics">
            {(query.data?.topics || []).map(topic => (
              <div key={topic}>
                <span>
                  <FileText size={15} />
                </span>
                {pretty(topic)}
                <ArrowRight size={14} />
              </div>
            ))}
          </div>
          {!query.data?.available && (
            <div className="form-note">
              No support contact channel is configured in the backend yet.
            </div>
          )}
        </Card>
      )}
    </PageSurface>
  );
}
