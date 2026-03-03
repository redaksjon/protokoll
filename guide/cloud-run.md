# Cloud Run Deployment Template

This template deploys the Protokoll MCP HTTP server (`protokoll-mcp-http`) to Google Cloud Run using Cloud Build.

Use these files:

- `deploy/cloud-run/Dockerfile`
- `deploy/cloud-run/cloudbuild.yaml`
- `deploy/cloud-run/env.example.yaml`
- `deploy/cloud-run/rbac-users.example.yaml`
- `deploy/cloud-run/rbac-keys.example.yaml`
- `deploy/cloud-run/rbac-policy.example.yaml`

## 1) Runtime Service Account

Create a dedicated runtime service account for Cloud Run:

```bash
gcloud iam service-accounts create protokoll-runtime \
  --display-name="Protokoll Cloud Run Runtime"
```

Grant only the permissions your configured storage/backend needs.

For GCS storage (`storage.backend: gcs`), start with:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:protokoll-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

If using project-level ADC discovery, you may also need:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:protokoll-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.admin"
```

Allow deploy identities to use the runtime service account:

```bash
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

gcloud iam service-accounts add-iam-policy-binding "protokoll-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="user:${USER_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

gcloud iam service-accounts add-iam-policy-binding "protokoll-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

## 2) Required APIs + Deployer/Builder IAM

Enable required services:

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  storage.googleapis.com
```

Minimum project roles for deploy user (`USER_EMAIL`):

- `roles/cloudbuild.builds.editor`
- `roles/run.admin`
- `roles/artifactregistry.writer`
- `roles/storage.admin` (for Cloud Build staging bucket setup)

Minimum project roles for Cloud Build service account (`${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com`):

- `roles/run.admin`
- `roles/artifactregistry.writer`
## 3) Artifact Registry (one-time)

Create an Artifact Registry Docker repo for images:

```bash
gcloud artifacts repositories create protokoll \
  --repository-format=docker \
  --location=us-central1 \
  --description="Protokoll images"
```

## 4) Secrets (recommended)

Use Secret Manager for API keys instead of plaintext env files:

```bash
PROJECT_ID="your-project-id"

# OPENAI_API_KEY must be present in your shell environment.
printf '%s' "$OPENAI_API_KEY" | gcloud secrets create protokoll-openai-api-key \
  --project="$PROJECT_ID" \
  --replication-policy=automatic \
  --data-file=- || \
printf '%s' "$OPENAI_API_KEY" | gcloud secrets versions add protokoll-openai-api-key \
  --project="$PROJECT_ID" \
  --data-file=-
```

Grant Cloud Run runtime service account access to read secrets:

```bash
gcloud secrets add-iam-policy-binding protokoll-openai-api-key \
  --project="$PROJECT_ID" \
  --member="serviceAccount:protokoll-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## 5) Environment Variables (non-secret)

Copy and edit env vars:

```bash
cp deploy/cloud-run/env.example.yaml deploy/cloud-run/env.prod.yaml
```

Update `deploy/cloud-run/env.prod.yaml` with non-secret values only.

### Optional: Secured mode (RBAC)

Set the following env vars when you want API-key auth + RBAC enabled:

- `PROTOKOLL_HTTP_SECURED=true`
- `RBAC_USERS_PATH=/app/rbac/users.yaml`
- `RBAC_KEYS_PATH=/app/rbac/keys.yaml`
- `RBAC_POLICY_PATH=/app/rbac/policy.yaml` (optional)
- `RBAC_RELOAD_SECONDS=300` (optional)

When `PROTOKOLL_HTTP_SECURED=true`, startup fails fast if the required RBAC files are missing/invalid.

## 6) Configure Cloud Build Substitutions

Use `deploy/cloud-run/cloudbuild.yaml` substitutions:

- `_REGION`
- `_SERVICE_NAME`
- `_AR_REPO`
- `_IMAGE_NAME`
- `_SERVICE_ACCOUNT`
- `_ENV_VARS_FILE`
- `_OPENAI_SECRET`
- `_REQUEST_TIMEOUT` (seconds; default `3600` for MCP SSE streams)
- `_MIN_INSTANCES` (default `1` to reduce cold starts/worker interruptions)

For production, set `_ENV_VARS_FILE=deploy/cloud-run/env.prod.yaml`.

## 7) Deploy

From the repo root:

```bash
gcloud builds submit --config deploy/cloud-run/cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_SERVICE_NAME=protokoll-mcp,_AR_REPO=protokoll,_IMAGE_NAME=protokoll-mcp,_SERVICE_ACCOUNT=protokoll-runtime@${PROJECT_ID}.iam.gserviceaccount.com,_ENV_VARS_FILE=deploy/cloud-run/env.prod.yaml,_OPENAI_SECRET=protokoll-openai-api-key,_REQUEST_TIMEOUT=3600,_MIN_INSTANCES=1
```

## Notes

- The server listens on `PORT` (Cloud Run standard) and supports `MCP_PORT`/`PROTOKOLL_MCP_PORT`.
- The Docker image includes `ffmpeg`, required for audio format conversion/splitting.
- Cloud Run should use service account identity (ADC); do not bake key files into the image.
- Cloud Build uses `${BUILD_ID}` for image tags in this template so `gcloud builds submit` works reliably outside trigger contexts.
- Deploy defaults include `--timeout=3600`, `--min-instances=1`, and `--no-cpu-throttling` to better support long-lived MCP SSE connections and in-process background polling.
