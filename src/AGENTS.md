# FRONTEND AGENTS

## OVERVIEW

React/TypeScript frontend renders backend DTOs from Tauri commands through React Query and Zustand UI state.

## WHERE TO LOOK

| Task | File | Notes |
|---|---|---|
| Screen routing | `App.tsx` | Tab switch between overview/detail/processes/settings. |
| Shell metrics/navigation | `components/Shell.tsx` | Sidebar counts use overview DTOs. |
| Shared UI states | `components/ui.tsx` | Loading, error, empty, status badge. |
| Tauri API boundary | `lib/api.ts` | Command map must mirror Rust command names. |
| DTO contracts | `lib/types.ts` | No `collectorCommand` field. |
| Formatting nulls | `lib/format.ts` | Unknown/null values render as `unknown`. |
| Settings | `features/settings/` | Server form and no-install requirements copy. |
| Process table | `features/processes/` | Static screen identity must survive API failure. |

## CONVENTIONS

- Keep frontend DTO names camelCase and aligned with Rust serde output.
- Use React Query for command-backed data and tests with mocked API or mocked Tauri `invoke`.
- Settings payload contains only server connection settings: id/name/host/port/username/key path/polling/enabled.
- Error states should show the problem without hiding the screen's static identity panel when practical.
- Unknown metrics display as `unknown`; zero is shown only when backend sends numeric zero.

## ANTI-PATTERNS

- Do not add a collector command field, placeholder, default, or validation.
- Do not mention `gpuwatcher --json` in active UI copy.
- Do not add mode selectors for installed collector vs no-install; no-install SSH is the only mode.
- Do not fabricate demo rows to hide Tauri `invoke` failures in plain Vite.
- Do not convert null GPU/process values into zero in formatters or JSX.

## VERIFY

```bash
npm run test
npm run build
```

Use browser QA for visible changes. Plain Vite may show Tauri backend-unavailable text; that is acceptable only if navigation and static screen context remain visible.
