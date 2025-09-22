# Dispatch on Image Push Success

A GitHub Action that informs another repository when a Docker image has been successfully pushed by triggering a repository dispatch event.

## Description

This composite action sends a repository dispatch event to a target repository after a successful Docker image push. It includes metadata about the image (tags, digest, repository name) and build information (commit SHA, run ID, timestamp) in the event payload.

The action performs validation to ensure required inputs are provided and handles API errors gracefully.

## Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| `target_repo` | The target repository to inform (format: `owner/repo`) | Yes | - |
| `target_repo_pat` | Personal Access Token for the target repository with `repo` permissions (store as a secret) | Yes | - |
| `repository_dispatch_event` | Name of the repository dispatch event to trigger in the target repository | Yes | - |
| `tags` | JSON array of Docker image tags that were pushed | No | - |
| `digest` | Docker image digest (format: `sha256:...`) | No | - |
| `image_name` | Docker image name (format: `owner/repo`) | No | - |

## Outputs

| Name | Description |
|------|-------------|
| `result` | Confirmation message indicating whether the dispatch was successful or failed |

## Example Usage

```yaml
name: Build and Push Docker Image
on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Build and push Docker image
        id: build
        uses: docker/build-push-action@v4
        with:
          push: true
          tags: my-image:latest
          outputs: type=registry

      - name: Dispatch to deployment repo
        uses: ./actions/dispatch_on_image_push_success
        with:
          target_repo: 'my-org/deployment-repo'
          target_repo_pat: ${{ secrets.DEPLOYMENT_REPO_PAT }}
          repository_dispatch_event: 'image-pushed'
          tags: ${{ steps.build.outputs.tags }}
          digest: ${{ steps.build.outputs.digest }}
          image_name: 'my-org/my-image'
```

## Prerequisites

- The target repository must have a workflow that listens for the specified `repository_dispatch_event`.
- The Personal Access Token must have `repo` permissions in the target repository.
- The action requires `jq` and `curl` to be available in the runner environment (available by default on Ubuntu runners).

## Event Payload

The repository dispatch event will include a `client_payload` with the following structure:

```json
{
  "event_type": "your-custom-event",
  "client_payload": {
    "repository": "owner/repo",
    "tags": "[\"tag1\", \"tag2\"]",
    "digest": "sha256:abc123...",
    "commit": "abc123def456",
    "run_id": "123456789",
    "timestamp": "2023-12-01T12:00:00Z"
  }
}
```

## Error Handling

The action will fail if:
- `target_repo` is not provided
- `target_repo_pat` is not provided
- `tags` input is empty (this input is effectively required for the dispatch to be meaningful, even though marked as optional in the YAML)
- The API call to GitHub fails (non-2xx response)

## Contributing

Contributions are welcome! Please ensure your changes include appropriate tests and documentation updates.