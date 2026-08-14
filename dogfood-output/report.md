# Fluxen Dogfood Report

**Target:** http://localhost:3000  
**Date:** 2026-07-21  
**Session:** fluxen-qa / fluxen-qa2 / fluxen-mobile  
**Scope:** Unauthenticated surfaces + auth gates (authenticated app blocked — no credentials)

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 (browser-only; see code-review CR-01 in canvas) |
| High     | 1 (PDF ReportShell — observed via dev server) |
| Medium   | 1 (PWA update toast noise) |
| Low      | 1 (SW double-log in Strict Mode) |
| Passes   | 8 |
| Blocked  | 1 (post-login exploration) |

## Browser issues

### ISSUE-001 — Period journal PDF import failure
- **Severity:** high  
- **Category:** functional  
- **Evidence:** Dev server log `Attempted import error: 'ReportShell' is not exported from './ReportShell'` when compiling `/reports/journal-month`  
- **Repro:** Open authenticated `/reports/journal-month` (also visible in terminal during HMR)  
- **Repro Video:** N/A (compile-time / module graph)  
- **Notes:** Source still contains `export function ReportShell`; file is abnormally double-spaced with `@ts-nocheck`.

### ISSUE-002 — PWA “update available” toast on public pages
- **Severity:** medium  
- **Category:** ux  
- **Screenshots:** `screenshots/initial.png`, `screenshots/login-mobile.png`, `screenshots/portal-invalid.png`  
- **Repro Video:** N/A (visible on load)  
- **Notes:** Appears during dogfood under Strict Mode + HMR; may also fire on real SW updates in production.

### ISSUE-003 — Service Worker registered logged twice
- **Severity:** low  
- **Category:** console  
- **Evidence:** Console `[PWA] Service Worker registered` ×2 per navigation  
- **Notes:** Likely React `reactStrictMode: true` double-mount in development; single mount in `layout.tsx`.

## Passed checks

1. Empty login submit → HTML5 required validation  
2. Bad credentials → Arabic inline error «البريد أو كلمة المرور غير صحيحين.» (`screenshots/login-bad-creds-v2.png`)  
3. Forgot password invalid email → browser validation  
4. Auth gate: `/dashboard`, `/mall`, `/journals` → `/login?next=…`  
5. Invalid portal token → «الرابط غير صالح» (`screenshots/portal-invalid.png`)  
6. `/api/health` → `{"ok":true,"service":"fluxen",…}` no env leak  
7. `/api/keepalive` without secret → 401  
8. Mobile 390×844 login layout intact (`screenshots/login-mobile.png`)

## Blocked

- Full authenticated exploration (dashboard, mall, rent, journals, reports) — need test credentials.

## Artifacts

- Screenshots under `dogfood-output/screenshots/`  
- Canvas report: workspace canvases `fluxen-comprehensive-qa-review.canvas.tsx`
