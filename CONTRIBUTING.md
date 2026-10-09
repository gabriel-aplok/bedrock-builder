# Contributing

Thanks for helping improve Bedrock Builder.

## Before you start

Use Node.js 20.19 or newer. Install dependencies with:

```bash
npm install
```

## Development checks

Run these before opening a pull request:

```bash
npm run format:check
npm run typecheck
npm test
npm run docs:check
```

Build the package locally with:

```bash
npm run build
npm run build:prod
```

The production build is minified and does not include sourcemaps.

## Documentation

Edit source pages in `docs/content/`. Regenerate the site with:

```bash
npm run docs
```

Do not edit generated pages in `docs/docs/` by hand.

## Extensions

Extensions are enabled in the project configuration and should own their format-specific dependencies. Keep private extensions outside the repository or add them to `.gitignore`.

## Pull requests

- Keep changes focused.
- Add or update tests for behavior changes.
- Keep comments short and lowercase.
- Do not commit build output, local tarballs, credentials, or private extensions.
- Describe the user-visible change and the checks you ran.

## Commits

Use a short imperative subject, for example:

```text
add extension dependency checks
```
