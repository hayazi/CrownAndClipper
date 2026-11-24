# Crown & Clipper — Google Cloud Run Deployment Guide (`australia-southeast1`)

This application keeps all Google Calendar API calls, OAuth refresh tokens, and service account keys strictly on the Express backend (`server.ts`). Clients only receive available time slots and booking confirmations in `Australia/Sydney` time.

## 1. Prerequisites

- A Google Cloud project with **Billing**, **Cloud Run API**, **Artifact Registry API**, **Secret Manager API**, and **Google Calendar API** enabled:
  ```bash
  gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    calendar-json.googleapis.com
  ```

## 2. Choose Your Backend Calendar Auth Strategy

### Option A: Google Service Account (Recommended for Public Booking)
Public customers arriving from Instagram or TikTok can view real-time availability and book without signing into Google.

1. Create a service account in Google Cloud IAM:
   ```bash
   gcloud iam service-accounts create barber-calendar-sync \
     --display-name="Barber Calendar Sync"
   ```
2. Generate a JSON key and store it in Google Secret Manager:
   ```bash
   gcloud iam service-accounts keys create sa-key.json \
     --iam-account="barber-calendar-sync@YOUR_PROJECT_ID.iam.gserviceaccount.com"

   gcloud secrets create google-service-account-json --data-file=sa-key.json
   rm sa-key.json
   ```
3. Open Google Calendar -> **Settings and sharing** for the barber's calendar -> **Share with specific people or groups** -> add the service account email with **Make changes to events** permission.
4. Set `GOOGLE_CALENDAR_ID` to the barber's calendar email (or calendar ID).

### Option B: Server-Side OAuth2 Refresh Token
1. Store `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REFRESH_TOKEN` in Secret Manager.
2. Mount them as environment variables on Cloud Run; `server/calendarService.ts` exchanges the refresh token for short-lived access tokens on the backend.

## 3. Deploy to Google Cloud Run (`australia-southeast1` — Sydney)

```bash
gcloud run deploy crown-and-clipper \
  --source . \
  --region australia-southeast1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,BOOKING_MODE=live,TZ=Australia/Sydney,GOOGLE_CALENDAR_ID=YOUR_BARBER_CALENDAR_ID" \
  --set-secrets "GOOGLE_SERVICE_ACCOUNT_JSON=google-service-account-json:latest"
```

### Recommended Production Hardening
- Set `ALLOWED_ORIGIN` to your custom domain (e.g. `https://book.crownandclipper.com.au`).
- Keep `--min-instances=0` for scale-to-zero savings or `--min-instances=1` for instant link-in-bio cold-start response from Instagram/TikTok.
- Grant the Cloud Run runtime service account `roles/secretmanager.secretAccessor` only on the calendar secret.

## 4. Testing Without Live Credentials (Mock Mode)
Set `BOOKING_MODE=mock` in `.env` (or leave credentials unset) to test full `Australia/Sydney` slot calculation, realistic busy blocks, and double-booking conflict protection locally before connecting Google Calendar.
