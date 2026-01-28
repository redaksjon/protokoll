# protokoll_get_version

Get the current version of Protokoll including git information and system details.

## Purpose

This tool is useful for diagnosing if you are using the latest version of Protokoll. It returns detailed version information including:
- Package version
- Git branch and commit
- Git commit date
- System platform, architecture, and Node.js version

## Parameters

None required.

## Returns

```typescript
{
  version: string;        // Full version string with git and system info
  programName: string;    // "protokoll"
  fullVersion: string;    // "protokoll <version>"
}
```

## Example Output

```json
{
  "version": "1.0.1-dev.0 (working/de9eb6d  2026-01-27 10:55:39 -0800) darwin arm64 v24.8.0",
  "programName": "protokoll",
  "fullVersion": "protokoll 1.0.1-dev.0 (working/de9eb6d  2026-01-27 10:55:39 -0800) darwin arm64 v24.8.0"
}
```

## Usage

Call this tool whenever you need to verify which version of Protokoll is running, especially when:
- Troubleshooting issues
- Verifying you have the latest changes
- Reporting bugs
- Checking if a feature is available in your version

## Version String Format

The version string follows this format:
```
<package-version> (<git-branch>/<git-commit> <commit-date>) <platform> <arch> <node-version>
```

Example breakdown:
- `1.0.1-dev.0` - Package version from package.json
- `working/de9eb6d` - Git branch and short commit hash
- `2026-01-27 10:55:39 -0800` - Commit timestamp with timezone
- `darwin arm64` - Operating system and architecture
- `v24.8.0` - Node.js version
