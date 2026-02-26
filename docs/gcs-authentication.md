# GCS Authentication

This guide describes how to authenticate Protokoll when running with `storage.backend: gcs`.

## Cloud Run Recommendation (No Key File)

When running in Google Cloud Run, prefer the runtime service account identity:

- Do **not** set `storage.gcs.credentialsFile`
- Attach a service account to the Cloud Run service
- Grant that service account IAM access to the configured GCS buckets/prefixes

In this mode, Protokoll uses Google Application Default Credentials (ADC) from the Cloud Run environment.

## Recommended for This Phase

For local/dev and non-Cloud Run environments, use a service account key file and set:

- `storage.gcs.credentialsFile` in `protokoll-config.yaml`

Example:

```yaml
storage:
  backend: gcs
  gcs:
    inputUri: gs://my-input-bucket/protokoll/input/
    outputUri: gs://my-output-bucket/protokoll/output/
    contextUri: gs://shared-context-bucket/redaksjon/context/
    credentialsFile: /absolute/path/to/service-account.json
```

## Create a Service Account Key

1. In Google Cloud Console, create/select a service account.
2. Grant bucket permissions required for your workload.
   - Typical minimum: read/write object access on configured bucket paths.
3. Create and download a JSON key file.
4. Store the key file in a secure location outside source control.
5. Reference that absolute path as `storage.gcs.credentialsFile`.

## Optional: ADC Environment Variable

If `credentialsFile` is omitted, the underlying Google SDK can use default credentials resolution (for example `GOOGLE_APPLICATION_CREDENTIALS`).

Example:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json"
```

Then omit `credentialsFile` from config.

## Permissions Checklist

For each configured URI bucket:

- `inputUri` bucket/prefix: list/read access for input object discovery and reads
- `outputUri` bucket/prefix: write/read/delete access for output objects
- `contextUri` bucket/prefix: read/write access for context entities

If any required permission is missing, Protokoll will fail fast in GCS mode.

## Security Notes

- Never commit service account JSON keys to git.
- Restrict key file permissions on disk.
- Prefer separate service accounts for environments (dev/stage/prod).
- Rotate keys periodically.

