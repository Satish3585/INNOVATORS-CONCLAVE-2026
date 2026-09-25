# FarmAI Frontend Setup

## Local development

The frontend is a static React application. Install the dependencies, start the Vite server, and set the API base URL to the FastAPI backend before starting the browser:

```bash
cd farmai-frontend
pnpm install
VITE_API_BASE_URL=http://localhost:8000/api pnpm dev
```

Run the FastAPI service in a separate terminal. The backend must be available at `http://localhost:8000` and MongoDB must be running. The API base URL includes the `/api` prefix.

## Preview and production

A remote FarmAI preview cannot call `localhost:8000` on the developer's computer. Deploy the API to a publicly reachable HTTPS host, set `VITE_API_BASE_URL` to its `/api` URL in the frontend build environment, then build and deploy the static site. Add the exact frontend origin to the API's `CORS_ORIGINS` configuration. Do not put the API's private keys or database credentials in any `VITE_` variable; browser environment variables are public.

The client stores access tokens in `sessionStorage` and sends them as bearer tokens. The frontend uses `credentials: omit`; configure the API for bearer-token access and the required CORS methods/headers. Review `/health` and `/ready` on the backend before connecting. `/ready` requires MongoDB.

## Connected and optional features

Registration, login, profile, farms, crop records, tasks, harvests, listings, buyer requirements, interests, transactions, notifications, and AI conversations call the matching API routes. Farmer registration and farmer profiles require a phone number, age (1–120) and a gender selection; “Prefer not to say” is available. Buyer registration does not require these farmer-specific fields. The UI offers English (`en`), Hindi (`hi`), Kannada (`kn`) and Marathi (`mr`) at sign-in and inside the app. The chosen locale is stored in browser storage and synchronized to account preferences when authenticated; the matching backend version validates those language codes and asks configured FarmAI providers to answer in the selected language. External weather, market-price, government-scheme and LLM answers depend on providers configured on the backend. When a provider is unavailable, the UI reports this rather than inventing values. The frontend does not handle or collect payments.

The API URL falls back to `http://localhost:8000/api` for local development when `VITE_API_BASE_URL` is not set.

## Verification

```bash
pnpm check
pnpm build
```

Deploy the corresponding FarmAI API revision as well as the static frontend to enable persisted language preferences and language-aware AI output.
