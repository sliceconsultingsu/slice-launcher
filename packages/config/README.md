# Shared development rules

These defaults apply across the repository:

- `eslint.config.mjs`: code-quality and import rules.
- `prettier.config.mjs`: formatting.
- `tsconfig.base.json`: TypeScript defaults.
- `package.json`: exports used by the root and platform configuration.

The root ESLint/Prettier files import these shared rules. Platform-specific framework and test setup stays in `platform/`; app-specific public settings stay in `platform/apps/<id>/app.json`. Review shared changes carefully because they affect all contributors.
