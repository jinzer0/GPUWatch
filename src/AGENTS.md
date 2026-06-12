# FRONTEND AGENTS

## OVERVIEW

React/TypeScript frontend renders backend DTOs from the Electron preload bridge through React Query and Zustand UI state. Desktop runtime calls must go through action-specific `window.gpuwatcher` methods exposed by preload. Plain Vite browser runs are allowed as a fallback surface for static identity and read-only empty states, but they don't have a desktop backend.

## WHERE TO LOOK

| Task | File | Notes |
|---|---|---|
| Screen routing | `App.tsx` | Tab switch between overview/detail/processes/settings. |
| Shell metrics/navigation | `components/Shell.tsx` | Sidebar counts use overview DTOs. |
| Shared UI states | `components/ui.tsx` | Loading, error, empty, status badge. |
| Electron API boundary | `lib/api.ts` | Calls action-specific `window.gpuwatcher` methods and defines browser fallback behavior. |
| Bridge contract | `../electron/helperContract.ts`, `../electron/preload.ts` | Keep action names and renderer-visible methods aligned. |
| DTO contracts | `lib/types.ts` | No `collectorCommand` field. |
| Formatting nulls | `lib/format.ts` | Unknown/null values render as `unknown`. |
| Settings | `features/settings/` | Server form and no-install requirements copy. |
| Process table | `features/processes/` | Static screen identity must survive API failure. |

## CONVENTIONS

- Keep frontend DTO names camelCase and aligned with Rust serde output.
- Use React Query for command-backed data and tests with mocked API or mocked `window.gpuwatcher` methods.
- Settings payload contains only server connection settings: id/name/host/port/username/key path/polling/enabled.
- Error states should show the problem without hiding the screen's static identity panel when practical.
- Unknown metrics display as `unknown`; zero is shown only when backend sends numeric zero.
- Browser fallback in `src/lib/api.ts` may return read-only empty states and explicit `backend_unavailable` errors for actions that need the desktop backend.

## ANTI-PATTERNS

- Do not add a collector command field, placeholder, default, or validation.
- Do not mention `gpuwatcher --json` in active UI copy.
- Do not add mode selectors for installed collector vs no-install; no-install SSH is the only mode.
- Do not fabricate demo rows to hide missing Electron bridge failures in plain Vite.
- Do not convert null GPU/process values into zero in formatters or JSX.
- Do not add generic IPC calls from renderer code; keep preload methods action-specific.

## VERIFY

```bash
npm run test
npm run build
npm run electron:build
```

Use browser QA for visible changes. Plain Vite may show backend-unavailable text; that is acceptable only if navigation and static screen context remain visible. Electron desktop QA should launch through `npm run electron:dev` or the unsigned package from `npm run electron:pack`.
