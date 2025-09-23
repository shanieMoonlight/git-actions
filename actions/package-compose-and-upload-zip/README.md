# Package and Upload Zip

A GitHub Action that packages a specified file into a timestamped ZIP archive and uploads it as a workflow artifact.

## Description

This composite action creates a ZIP file with a timestamped filename from a given input file, then uploads the ZIP as a GitHub Actions artifact. This is useful for packaging deployment files (like `docker-compose.yml`) with unique names for traceability.

The action generates filenames in the format: `{zip_prefix}_{YYYYMMDD_HHMMSS}.zip`

## Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| `file_to_zip` | Path to the file to package into the ZIP | Yes | `docker-compose.yml` |
| `zip_prefix` | Prefix for the ZIP filename (before the timestamp) | No | `deploy` |
| `artifact_name` | Name for the uploaded artifact in GitHub Actions | No | `deploy-package` |
| `retention_days` | Number of days to retain the artifact (1-90) | No | `7` |

## Outputs

| Name | Description |
|------|-------------|
| `zip_name` | The generated ZIP filename (e.g., `deploy_20231201_120000.zip`) |

## Example Usage

```yaml
name: Package and Deploy
on:
  push:
    branches: [ main ]

jobs:
  package:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Generate docker-compose.yml
        run: |
          # Your steps to create docker-compose.yml
          echo "version: '3'" > docker-compose.yml
          echo "services:" >> docker-compose.yml
          echo "  app:" >> docker-compose.yml
          echo "    image: myapp:latest" >> docker-compose.yml

      - name: Package and upload
        id: package
        uses: ./actions/package-compose-and-upload-zip
        with:
          file_to_zip: docker-compose.yml
          zip_prefix: my-deployment
          artifact_name: deployment-zip
          retention_days: 30

      - name: Show zip name
        run: echo "Created ZIP: ${{ steps.package.outputs.zip_name }}"
```

## Prerequisites

- The `zip` command must be available in the runner environment (available by default on Ubuntu runners).
- The input file (`file_to_zip`) must exist in the workspace.

## Notes

- The timestamp is generated in UTC using the format `YYYYMMDD_HHMMSS`.
- Artifacts are retained for the specified number of days (default: 7).
- The action runs on any GitHub Actions runner that supports composite actions.

## Contributing

Contributions are welcome! Please ensure your changes include appropriate tests and documentation updates.