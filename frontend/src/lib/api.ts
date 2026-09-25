export type Role = "farmer" | "buyer";
export type IdRecord = {
  _id?: string;
  id?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};
export type Page<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};
export type ApiLocation = {
  source: "gps" | "manual" | "map" | "farm" | "profile";
  latitude?: number;
  longitude?: number;
  accuracy_m?: number;
  captured_at?: string;
  state?: string;
  district?: string;
  taluka?: string;
  village?: string;
  city?: string;
  pincode?: string;
  address?: string;
  coordinates?: { type: "Point"; coordinates: [number, number] };
};
export type User = IdRecord & {
  full_name: string;
  email: string;
  role: Role;
  phone?: string | null;
  age?: number | null;
  gender?:
    | "female"
    | "male"
    | "non_binary"
    | "other"
    | "prefer_not_to_say"
    | null;
  preferred_language?: string;
  location?: ApiLocation;
  profile_photo_url?: string | null;
};
export type Farm = IdRecord & {
  name: string;
  size?: number;
  size_unit?: string;
  location?: ApiLocation;
};
export type Field = IdRecord & {
  farm_id: string;
  name: string;
  area: number;
  area_unit?: string;
  soil_type?: string;
  soil_ph?: number;
};
export type Crop = IdRecord & {
  crop_name: string;
  field_id: string;
  growth_stage?: string;
  status?: string;
  expected_harvest_date?: string;
};
export type Task = IdRecord & {
  title: string;
  due_date: string;
  status: string;
  priority?: string;
};
export type Harvest = IdRecord & {
  crop_id: string;
  quantity: number;
  unit: string;
  harvested_at: string;
  remaining_quantity?: number;
  listed_quantity?: number;
};
export type Listing = IdRecord & {
  crop_name: string;
  quantity: number;
  remaining_quantity: number;
  price_per_unit: number;
  unit: string;
  status: string;
  quality_grade?: string;
  location?: ApiLocation;
  seller?: Record<string, unknown>;
};
export type Notification = IdRecord & {
  title: string;
  message: string;
  type: string;
  read_at?: string | null;
  reference_type?: string;
  reference_id?: string;
};
export type SoilTest = IdRecord & {
  farm_id?: string;
  field_id: string;
  test_date?: string;
  test_source: string;
  document_upload_id?: string;
  soil_type?: string;
  ph?: number;
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
  electrical_conductivity?: number;
  organic_carbon?: number;
  moisture_percentage?: number;
  sulfur?: number;
  zinc?: number;
  iron?: number;
  selected_crop?: string;
  growth_stage?: string;
  previous_crop?: string;
  notes?: string;
  extracted_from_report?: boolean;
  verified_by_farmer?: boolean;
  explanation?: SoilExplanation;
};
export type SoilExplanation = {
  overall_health: string;
  parameters: Record<string, {
    value?: number;
    unit?: string;
    status: string;
    meaning: string;
    implications?: string;
    crop_suitability?: string;
  }>;
  strengths: string[];
  deficiency_alerts: string[];
  actionable_recommendations: string[];
  context_notes: string[];
  crop_evaluated?: string;
  growth_stage?: string;
};
export type DocumentRecord = IdRecord & {
  name: string;
  doc_type: string;
  file_upload_id: string;
  filename?: string;
  content_type?: string;
  size_bytes?: number;
  file_url?: string;
  farm_id?: string;
  field_id?: string;
  crop_id?: string;
  notes?: string;
  status: string;
  created_at: string;
};
export type DiseaseReport = IdRecord & {
  crop_id?: string;
  crop_name?: string;
  field_id?: string;
  farm_id?: string;
  report_type: string;
  symptoms?: string[];
  notes?: string;
  image_upload_id?: string;
  diagnosis_status: "diagnosed" | "uncertain" | "analysis_failed" | "model_unavailable" | string;
  is_uncertain?: boolean;
  result?: string;
  confidence?: number;
  review_required?: boolean;
  recommended_next_steps?: string[];
  model_result?: {
    predicted_class?: string;
    disease_name?: string;
    confidence_pct?: number;
    severity?: string;
    is_healthy?: boolean;
    is_low_confidence?: boolean;
    top3_candidates?: Array<{ class: string; confidence_pct: number }>;
    recommended_actions?: string[];
  };
  created_at: string;
};
export type ApiResult<T> =
  | T
  | { available: false; reason?: string; [key: string]: unknown };

const TOKEN_KEY = "farmai.access_token";
const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();
export const API_BASE_URL = (
  configuredBase || "http://localhost:8000/api"
).replace(/\/+$/, "");

export function getAccessToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setAccessToken(token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Browser storage can be disabled; authenticated routes will then require re-login. */
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  fieldErrors: Record<string, string>;
  constructor(
    message: string,
    status: number,
    code?: string,
    fieldErrors: Record<string, string> = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

function fieldErrorsFrom(detail: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  if (Array.isArray(detail)) {
    for (const issue of detail) {
      if (!issue || typeof issue !== "object") continue;
      const path = Array.isArray((issue as { loc?: unknown }).loc)
        ? (issue as { loc: unknown[] }).loc.slice(1).join(".")
        : "form";
      errors[path || "form"] = String(
        (issue as { msg?: unknown }).msg ?? "Invalid value"
      );
    }
  }
  return errors;
}

function normalizeBody(body: unknown): unknown {
  if (body && typeof body === "object" && "success" in body && "data" in body) {
    const wrapped = body as {
      success: boolean;
      data?: unknown;
      error?: { message?: string; code?: string };
    };
    if (wrapped.success) return wrapped.data;
    throw new ApiError(
      wrapped.error?.message || "The request could not be completed.",
      400,
      wrapped.error?.code
    );
  }
  return body;
}

export async function request<T>(
  path: string,
  options: RequestInit & {
    params?: Record<string, string | number | boolean | null | undefined>;
    anonymous?: boolean;
  } = {}
): Promise<T> {
  const { params, anonymous, ...init } = options;
  const url = new URL(
    `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`
  );
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));
  });
  const headers = new Headers(init.headers);
  if (!anonymous) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      ...init,
      headers,
      credentials: "omit",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      "Unable to connect to FarmAI. Check your connection and try again.",
      0,
      "NETWORK_ERROR"
    );
  }
  let body: unknown = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  } else if (!response.ok) {
    try {
      body = await response.text();
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      !path.includes("/auth/login") &&
      !path.includes("/auth/register")
    ) {
      setAccessToken(null);
      window.dispatchEvent(new CustomEvent("farmai:unauthorized"));
    }
    const record =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const errorRecord =
      record.error && typeof record.error === "object"
        ? (record.error as Record<string, unknown>)
        : {};
    const detail =
      record.detail ??
      errorRecord.message ??
      (typeof body === "string" ? body : undefined);
    const fallback =
      response.status === 404
        ? "We couldn't find that record."
        : response.status === 403
          ? "You don't have permission to do that."
          : `FarmAI request failed (${response.status}).`;
    throw new ApiError(
      typeof detail === "string" ? detail : fallback,
      response.status,
      String(errorRecord.code || record.code || ""),
      fieldErrorsFrom(detail)
    );
  }
  return normalizeBody(body) as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});
const patch = (body: unknown): RequestInit => ({
  method: "PATCH",
  body: JSON.stringify(body),
});
const list = <T>(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>
) => request<Page<T>>(path, { params });

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{
        access_token: string;
        user: User;
        role: Role;
        profile_completion?: { complete: boolean; missing_fields: string[] };
      }>("/auth/login", { ...json({ email, password }), anonymous: true }),
    register: (payload: Record<string, unknown>) =>
      request<{
        user: User;
        profile_completion?: { complete: boolean; missing_fields: string[] };
      }>("/auth/register", { ...json(payload), anonymous: true }),
    logout: () =>
      request<{ success: boolean; message: string }>("/auth/logout", {
        method: "POST",
      }),
    me: () =>
      request<{
        user: User;
        profile_completion?: { complete: boolean; missing_fields: string[] };
      }>("/profile/me"),
    patchMe: (payload: Record<string, unknown>) =>
      request<{
        user: User;
        profile_completion?: { complete: boolean; missing_fields: string[] };
      }>("/profile/me", patch(payload)),
    preferences: () => request<Record<string, unknown>>("/profile/preferences"),
    patchPreferences: (payload: Record<string, unknown>) =>
      request<Record<string, unknown>>("/profile/preferences", patch(payload)),
    buyerProfile: () => request<User>("/buyers/profile"),
    patchBuyerProfile: (payload: Record<string, unknown>) =>
      request<User>("/buyers/profile", patch(payload)),
  },
  dashboard: {
    farmer: () => request<Record<string, unknown>>("/dashboard/home"),
    buyer: () => request<Record<string, unknown>>("/buyers/dashboard"),
    performance: () => request<Record<string, unknown>>("/performance"),
    history: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<IdRecord>("/history", params),
  },
  farms: {
    list: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<Farm>("/farms", params),
    get: (id: string) => request<Farm>(`/farms/${id}`),
    create: (payload: Record<string, unknown>) =>
      request<Farm>("/farms", json(payload)),
    update: (id: string, payload: Record<string, unknown>) =>
      request<Farm>(`/farms/${id}`, patch(payload)),
    archive: (id: string) =>
      request<Record<string, unknown>>(`/farms/${id}/archive`, {
        method: "POST",
      }),
    summary: (id: string) =>
      request<Record<string, unknown>>(`/farms/${id}/summary`),
    fields: (
      id: string,
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<Field>(`/farms/${id}/fields`, params),
    createField: (id: string, payload: Record<string, unknown>) =>
      request<Field>(`/farms/${id}/fields`, json(payload)),
  },
  fields: {
    get: (id: string) => request<Field>(`/fields/${id}`),
    update: (id: string, payload: Record<string, unknown>) =>
      request<Field>(`/fields/${id}`, patch(payload)),
    summary: (id: string) =>
      request<Record<string, unknown>>(`/fields/${id}/summary`),
    soil: (fieldId?: string) =>
      request<{ items: Field[]; available: boolean }>("/soil", {
        params: { field_id: fieldId },
      }),
    updateSoil: (payload: Record<string, unknown>) =>
      request<Record<string, unknown>>("/soil", json(payload)),
  },
  cultivations: {
    list: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<IdRecord>("/cultivations", params),
    get: (id: string) =>
      request<{ cultivation: IdRecord; crops: Crop[] }>(`/cultivations/${id}`),
    create: (payload: Record<string, unknown>) =>
      request<{ cultivation: IdRecord; crops: Crop[] }>(
        "/cultivations",
        json(payload)
      ),
    update: (id: string, payload: Record<string, unknown>) =>
      request<IdRecord>(`/cultivations/${id}`, patch(payload)),
  },
  crops: {
    list: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<Crop>("/crops", params),
    get: (id: string) => request<Crop>(`/crops/${id}`),
    update: (id: string, payload: Record<string, unknown>) =>
      request<Crop>(`/crops/${id}`, patch(payload)),
    journey: (id: string) =>
      request<{ crop: Crop; timeline: IdRecord[] }>(`/crops/${id}/journey`),
    timeline: (id: string) =>
      request<{ crop: Crop; timeline: IdRecord[] }>(`/crops/${id}/timeline`),
    recommend: (payload: Record<string, unknown>) =>
      request<{
        success: boolean;
        top_recommendations: Array<{
          crop: string;
          display_name: string;
          confidence_pct: number;
          agronomic_rationale: string;
          water_requirement: string;
          growing_season: string;
          duration_days: string;
          soil_suitability?: Record<string, unknown>;
        }>;
        crop_rotation_considerations: string[];
        intercrop_suggestions: Array<{
          primary: string;
          companion: string;
          compatibility: string;
          reason: string;
        }>;
        warnings: string[];
        input_parameters: Record<string, unknown>;
      }>("/recommendations/crops", json(payload)),
  },
  records: {
    tasks: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<Task>("/tasks", params),
    createTask: (payload: Record<string, unknown>) =>
      request<Task>("/tasks", json(payload)),
    patchTask: (id: string, payload: Record<string, unknown>) =>
      request<Task>(`/tasks/${id}`, patch(payload)),
    taskAction: (
      id: string,
      action: "complete" | "skip" | "reschedule",
      payload?: Record<string, unknown>
    ) =>
      request<Task>(`/tasks/${id}/${action}`, {
        method: "POST",
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      }),
    irrigation: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<IdRecord>("/irrigation", params),
    createIrrigation: (payload: Record<string, unknown>) =>
      request<IdRecord>("/irrigation", json(payload)),
    inputs: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<IdRecord>("/inputs", params),
    createInput: (payload: Record<string, unknown>) =>
      request<IdRecord>("/inputs", json(payload)),
    expenses: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<IdRecord>("/expenses", params),
    createExpense: (payload: Record<string, unknown>) =>
      request<IdRecord>("/expenses", json(payload)),
    health: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<IdRecord>("/health-checks", params),
    createHealth: (payload: Record<string, unknown>) =>
      request<IdRecord>("/health-checks", json(payload)),
    createDiseaseReport: (payload: Record<string, unknown>) =>
      request<IdRecord>("/disease", json(payload)),
    harvests: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<Harvest>("/harvests", params),
    getHarvest: (id: string) => request<Harvest>(`/harvests/${id}`),
    createHarvest: (payload: Record<string, unknown>) =>
      request<Harvest>("/harvests", json(payload)),
  },
  marketplace: {
    listings: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<Listing>("/marketplace/listings", params),
    listing: (id: string) => request<Listing>(`/marketplace/listings/${id}`),
    createListing: (payload: Record<string, unknown>) =>
      request<Listing>("/marketplace/listings", json(payload)),
    closeListing: (id: string) =>
      request<Record<string, unknown>>(`/listings/${id}/close`, {
        method: "POST",
      }),
    interest: (id: string, payload: Record<string, unknown>) =>
      request<IdRecord>(`/marketplace/listings/${id}/interest`, json(payload)),
    interests: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<IdRecord>("/marketplace/interests", params),
    updateInterest: (id: string, payload: Record<string, unknown>) =>
      request<IdRecord>(`/marketplace/interests/${id}`, patch(payload)),
    requirements: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<IdRecord>("/requirements", params),
    createRequirement: (payload: Record<string, unknown>) =>
      request<IdRecord>("/requirements", json(payload)),
    updateRequirement: (id: string, payload: Record<string, unknown>) =>
      request<IdRecord>(`/requirements/${id}`, patch(payload)),
    matches: (requirementId?: string) =>
      request<{
        items: Array<{
          requirement: IdRecord;
          matches: Array<Record<string, unknown>>;
          match_status: string;
          guaranteed: boolean;
        }>;
      }>("/matches", { params: { requirement_id: requirementId } }),
    transactions: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<IdRecord>("/transactions", params),
    createTransaction: (payload: Record<string, unknown>) =>
      request<IdRecord>("/transactions", json(payload)),
    updateTransaction: (id: string, payload: Record<string, unknown>) =>
      request<IdRecord>(`/transactions/${id}/status`, patch(payload)),
  },
  notifications: {
    list: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<Notification>("/notifications", params),
    unreadCount: () =>
      request<{ count: number }>("/notifications/unread-count"),
    markRead: (id: string) =>
      request<Notification>(`/notifications/${id}/read`, patch({})),
    markAllRead: () =>
      request<{ updated_count: number }>("/notifications/read-all", patch({})),
  },
  ai: {
    conversations: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<IdRecord>("/ai/conversations", params),
    conversation: (id: string) => request<IdRecord>(`/ai/conversations/${id}`),
    createConversation: (payload: Record<string, unknown> = {}) =>
      request<IdRecord>("/ai/conversations", json(payload)),
    sendMessage: (id: string, payload: Record<string, unknown>) =>
      request<Record<string, unknown>>(
        `/ai/conversations/${id}/messages`,
        json(payload)
      ),
    actions: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<IdRecord>("/ai/actions", params),
    createAction: (payload: Record<string, unknown>) =>
      request<Record<string, unknown>>("/ai/actions", json(payload)),
    decideAction: (id: string, decision: "approve" | "reject") =>
      request<IdRecord>(`/ai/actions/${id}/decision`, json({ decision })),
  },
  support: {
    weather: (locationId?: string) =>
      request<ApiResult<Record<string, unknown>>>("/weather", {
        params: { location_id: locationId },
      }),
    marketPrices: (crop?: string, locationId?: string) =>
      request<{
        available: boolean;
        items: IdRecord[];
        reason?: string;
        source?: string;
        retrieved_at?: string;
      }>("/market/prices", { params: { crop, location_id: locationId } }),
    schemes: (
      params?: Record<string, string | number | boolean | null | undefined>
    ) => list<IdRecord>("/schemes", params),
    scheme: (id: string) => request<IdRecord>(`/schemes/${id}`),
    upload: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return request<{
        upload_id: string;
        content_type: string;
        size_bytes: number;
        created_at: string;
      }>("/uploads", { method: "POST", body });
    },
    imageUrl: (id: string) =>
      `${API_BASE_URL}/uploads/${encodeURIComponent(id)}`,
  },
  soilTests: {
    list: (params?: Record<string, string | number | boolean | null | undefined>) =>
      list<SoilTest>("/soil-tests", params),
    get: (id: string) => request<SoilTest>(`/soil-tests/${id}`),
    create: (payload: Record<string, unknown>) =>
      request<SoilTest>("/soil-tests", json(payload)),
    extract: (uploadId: string) =>
      request<{
        status: string;
        message: string;
        extracted_values: Record<string, any>;
        fields_found: string[];
        preview_snippet?: string;
        upload_id: string;
        file_url: string;
        filename?: string;
      }>("/soil-tests/extract", json({ upload_id: uploadId })),
    explain: (payload: Record<string, unknown>) =>
      request<SoilExplanation>("/soil-tests/explain", json(payload)),
    history: (fieldId: string) =>
      request<{
        field: Field;
        tests: SoilTest[];
        comparison: {
          comparison_available: boolean;
          test_count?: number;
          initial_date?: string;
          latest_date?: string;
          trends?: Record<string, {
            initial_value: number;
            latest_value: number;
            change: number;
            direction: "increased" | "decreased" | "stable";
            unit: string;
          }>;
          message?: string;
        };
      }>(`/soil-tests/history/${fieldId}`),
  },
  documents: {
    list: (params?: Record<string, string | number | boolean | null | undefined>) =>
      list<DocumentRecord>("/documents", params),
    get: (id: string) => request<DocumentRecord>(`/documents/${id}`),
    create: (payload: Record<string, unknown>) =>
      request<DocumentRecord>("/documents", json(payload)),
    delete: (id: string) =>
      request<{ success: boolean; id: string; deleted: boolean }>(`/documents/${id}`, { method: "DELETE" }),
  },
  disease: {
    check: (payload: Record<string, unknown>) =>
      request<DiseaseReport>("/agriculture/disease-check", json(payload)),
    history: (params?: Record<string, string | number | boolean | null | undefined>) =>
      list<DiseaseReport>("/agriculture/disease-history", params),
  },
  system: {
    status: () =>
      request<{
        status: string;
        service: string;
        subsystems: Record<string, { available: boolean; label: string; status: string }>;
      }>("/system/status"),
  },
};

export function recordId(item: IdRecord | null | undefined): string {
  return String(item?._id || item?.id || "");
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
