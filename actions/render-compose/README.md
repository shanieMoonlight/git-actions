# Render Compose (TypeScript)

A GitHub Action that renders a `docker-compose.yml` file from a template by resolving the latest Docker image tags for specified services.

## Description

This TypeScript action takes a template file and a services configuration JSON, then dynamically resolves the latest available tags for each service from Docker Hub. It replaces placeholders in the template with the resolved image references and generates a complete `docker-compose.yml` file.

For each service, the action:
- Queries Docker Hub's API for available tags
- Selects the most recent tag (preferring timestamp-formatted tags like `20230101_123456`)
- Optionally fetches the image digest for immutable references
- Saves resolution details to `state/{service-name}.json`
- Replaces the service's placeholder in the template

## Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| `template` | Path to the docker-compose template file | Yes | - |
| `services` | Path to the services JSON configuration file | Yes | - |
| `docker_username` | Docker Hub username for authenticated API access | No | - |
| `dockerhub_token` | Docker Hub token/password for authenticated API access | No | - |

## Services JSON Format

The services input should point to a JSON file with this structure:

```json
{
  "services": [
    {
      "name": "web",
      "repo": "myorg/myapp",
      "placeholder": "{{WEB_IMAGE}}"
    },
    {
      "name": "api",
      "repo": "myorg/api",
      "placeholder": "{{API_IMAGE}}"
    }
  ]
}
```

## Template Format

The template file should contain placeholders that match those defined in the services JSON:

```yaml
version: '3.8'
services:
  web:
    image: {{WEB_IMAGE}}
    ports:
      - "80:80"
  api:
    image: {{API_IMAGE}}
    ports:
      - "3000:3000"
```

## Outputs

This action does not define explicit outputs but creates the following files in the workspace:

- `docker-compose.yml`: The rendered compose file with resolved image references
- `state/{service-name}.json`: Resolution details for each service, including tag, digest, and timestamp

## Example Usage

```yaml
name: Render Compose
on:
  workflow_dispatch

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Create template
        run: |
          cat > docker-compose.template.yml << 'EOF'
          version: '3.8'
          services:
            app:
              image: {{APP_IMAGE}}
              ports:
                - "8080:8080"
          EOF

      - name: Create services config
        run: |
          cat > services.json << 'EOF'
          {
            "services": [
              {
                "name": "app",
                "repo": "myorg/myapp",
                "placeholder": "{{APP_IMAGE}}"
              }
            ]
          }
          EOF

      - name: Render compose
        uses: ./actions/render-compose
        with:
          template: docker-compose.template.yml
          services: services.json
          docker_username: ${{ secrets.DOCKER_USERNAME }}
          dockerhub_token: ${{ secrets.DOCKER_TOKEN }}

      - name: Show rendered compose
        run: cat docker-compose.yml
```

## Authentication

Provide `docker_username` and `dockerhub_token` for authenticated access to Docker Hub. This allows:
- Higher rate limits
- Access to private repositories
- More reliable API responses

Without credentials, the action will work but may hit rate limits for public repositories.

## Tag Selection Logic

The action selects tags using this priority:
1. Tags with timestamp format (`YYYYMMDD_HHMMSS`) are preferred
2. Falls back to the most recently updated tag
3. Excludes the `latest` tag to avoid unstable references

## Build

To build locally:

```bash
cd actions/render-compose
npm install
npm run build
```

This produces `dist/index.cjs` which the `action.yml` references.

## Dependencies

- Node.js 20+
- `undici` for HTTP requests
- Access to Docker Hub API

## Error Handling

The action will fail if:
- Template or services files cannot be read
- Services JSON is malformed
- Docker Hub API requests fail
- No suitable tags are found for a service

## Contributing

Contributions are welcome! Please ensure changes include tests and documentation updates.