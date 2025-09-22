# calculate-docker-tags

> Calculate Docker image tags for CI

This JavaScript action computes image tags (latest, short SHA, timestamp, release) and returns them in two formats: a JSON array and a newline-separated string.

## Usage

In a workflow step:

```yaml
- name: Calculate tags
  uses: shanieMoonlight/spider-baby-actions/.github/actions/calculate-docker-tags@v1.0.0
  with:
    image_name: owner/repo
```

## Inputs

- `image_name` (required): Image name (e.g. `owner/repo`)

## Outputs

- `tags`: JSON array of image tags (e.g. `["owner/repo:latest", "owner/repo:abc1234"]`)
- `tags_newline_separated`: Newline-separated image tags (e.g. `owner/repo:latest\nowner/repo:abc1234`)

## Build

To build locally:

```powershell
npm --prefix .github/actions/calculate-docker-tags run build
```

This will produce `dist/index.js` which the `action.yml` references.

## Release notes

- The action consumer must reference a Git tag (e.g. `v1.0.0`) or commit that contains `dist/index.js` at that ref. GitHub executes the action code from the repository at the referenced ref, so the built files must be present.
- Recommended release flow: Build in CI, commit the built `dist/` into a release commit or push a tag that includes `dist/`. Alternatively, build locally and commit `dist/` before tagging.

## Development

- Shared code can live in `libs/common` and be imported by the action source.
- Use Nx targets to build the action in CI: `npx nx build calculate-docker-tags`.

## License

MIT