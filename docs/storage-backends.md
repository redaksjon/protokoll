# Storage Backends

Protokoll supports two storage backends for `input`, `output`, and `context`:

- `filesystem` (default)
- `gcs` (optional, explicit opt-in)

If `storage.backend` is not set, Protokoll runs in filesystem mode exactly as before.

## Filesystem Mode (Default)

You do not need a `storage` section for filesystem mode.

Example `protokoll-config.yaml`:

```yaml
inputDirectory: ./recordings
outputDirectory: ./notes
processedDirectory: ./processed
contextDirectories:
  - ./context
```

Behavior:

- Protokoll reads audio from `inputDirectory`
- writes transcript/output artifacts under `outputDirectory`
- loads context entities from `contextDirectories`

## GCS Mode

To use GCS, explicitly set `storage.backend: gcs` and provide all three domain URIs.

Example `protokoll-config.yaml`:

```yaml
inputDirectory: ./recordings
outputDirectory: ./notes
processedDirectory: ./processed

storage:
  backend: gcs
  gcs:
    inputUri: gs://my-input-bucket/protokoll/input/
    outputUri: gs://my-output-bucket/protokoll/output/
    contextUri: gs://shared-context-bucket/redaksjon/context/
    credentialsFile: /absolute/path/to/service-account.json
```

Notes:

- URIs must use canonical `gs://bucket/path` format.
- You can use different buckets per domain (`input`, `output`, `context`).
- A shared context bucket/prefix is supported.
- If `credentialsFile` is omitted, the Google SDK default credential chain is used.

## Fail-Fast Validation in GCS Mode

When `storage.backend: gcs` is enabled, startup validates:

- `storage.gcs.inputUri`
- `storage.gcs.outputUri`
- `storage.gcs.contextUri`
- `credentialsFile` readability (if provided)
- bucket access for configured input/output storage

Protokoll fails at startup when validation fails; it does not fall back to filesystem.

## Common Configuration Errors

- `storage.backend is set to gcs, but storage.gcs is missing`
  - Add the `storage.gcs` section.
- `Invalid GCS URI "...": must start with "gs://"`
  - Use `gs://bucket/path`.
- `GCS credentials file is not readable: ...`
  - Fix path/permissions for the configured key file.
- Bucket access errors (metadata/read/write failures)
  - Verify bucket names, IAM roles, and service account access.

