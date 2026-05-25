# YAML Import/Export & Config Refactor Design

**Goal:** Remove `yardbird.yaml` as a silent fallback config. YAML becomes import/export only. `useConfig` is a pure localStorage manager. New users set up manually or import a YAML file; existing configs are sanitized on load to strip deprecated/unknown fields.

---

## Problem

`public/yardbird.yaml` contains layout-specific values (hostnames, roster groups, power zones) that ship with the app. Every new user starts with someone else's config. Adding new YAML fields requires a backfill workaround. The app is not truly generic.

---

## Architecture

### What changes

| Before | After |
|---|---|
| `useConfig` imports `useLayout`, waits for YAML on every load | `useConfig` is pure localStorage — no YAML dependency |
| Empty localStorage → silent YAML fallback | Empty localStorage → `needsSetup: true` state |
| `useLayout.ts` fetches and parses `yardbird.yaml` | Deleted — replaced by `useYamlConfig.ts` |
| `LayoutConfig` type in `types.ts` | Deleted |
| YAML backfill in `useConfig.init()` | Deleted — superseded by this design |
| `public/yardbird.yaml` = layout-specific factory default | `public/yardbird.yaml` = documented template only, never auto-loaded |

### What stays the same

- `StoredConfig` shape and `version: 1`
- `localStorage` as the primary config store
- Connection setup form as the primary first-run experience
- All save/saveTabs/saveConnections/reset API on `useConfig()`

---

## Part 1: useConfig — pure localStorage manager

### `needsSetup` state

`useConfig()` exposes a new `needsSetup: ComputedRef<boolean>` that is `true` when localStorage is empty, corrupt, or unsanitisable. `App.vue` already gates on `loading` — it will also gate on `needsSetup` to show `ConnectionSetup.vue`.

### `sanitize(raw: unknown): StoredConfig | null`

Defined in `src/core/useYamlConfig.ts` and imported by `useConfig.ts`. A pure function used on both localStorage load and YAML import. Rules:

- Returns `null` if `raw` is not an object, or if `connections.jmri` is missing entirely
- Strips any fields not in the known `StoredConfig` shape
- Strips deprecated fields: `connections.jmri.tramPrefix`
- `version` must be `1`; anything else → return `null`
- `tabs` defaults to `[]` if missing
- `debug` defaults to `false` if missing
- All connection sub-fields (`rosterGroups`, `commandStations`, `powerZones`, etc.) are passed through if present, stripped if the wrong type

### `init()` — simplified

```typescript
async function init(): Promise<void> {
  const stored = loadFromStorage()  // calls sanitize() internally
  if (!stored) {
    needsSetup.value = true
    loading.value = false
    return
  }
  config.value = stored
  loading.value = false
}
```

No YAML fetch, no `waitForLayout`, no `migrateFromLayout`, no `backfillConnections`.

### Files

- **Modify:** `src/core/useConfig.ts`
- **Delete:** `useLayout` import + all YAML-related functions
- **Add:** `needsSetup` ref; import `sanitize` from `useYamlConfig`

---

## Part 2: useYamlConfig.ts — stateless YAML parser/serialiser

New file: `src/core/useYamlConfig.ts`

### `importYaml(text: string): { config: StoredConfig | null; warnings: string[] }`

1. Parse text as YAML (using `js-yaml`)
2. Map YAML shape → `StoredConfig` shape:
   - `plugins.jmri` → `connections.jmri`
   - `plugins.homeassistant` → `connections.homeassistant`
   - Top-level `tabs` → `tabs`
   - Top-level `debug` → `debug`
3. Run through `sanitize()` from `useConfig`
4. Collect `warnings[]` for any stripped/deprecated fields found (e.g. `tramPrefix` → warn "tramPrefix is no longer supported and was ignored")
5. Return `{ config, warnings }` — `config` is `null` if fatally unusable

### `exportYaml(config: StoredConfig): string`

Serialise `StoredConfig` to YAML using `js-yaml`. Maps back: `connections.jmri` → `plugins.jmri`, etc. Produces a clean, human-readable file.

### Files

- **Create:** `src/core/useYamlConfig.ts`
- **Delete:** `src/core/useLayout.ts`
- **Modify:** `src/core/types.ts` — remove `LayoutConfig` type

---

## Part 3: ConnectionSetup.vue — import/export UI

### First-run (needsSetup)

1. **Docker banner (conditional):** On mount, attempt `fetch('/yardbird.yaml')`. Run through `importYaml` — if the result has a non-null `config` with a non-empty `connections.jmri.host` (i.e. it's a real config, not just the blank template), show a dismissable banner: _"A server config was found. [Import it]"_. Clicking pre-fills the connection form. User still confirms via "All Aboard!".
2. **Manual form:** Unchanged — primary path. Fields start blank.
3. **"Import from file" link:** Below the manual form. File input accepting `.yaml`/`.yml`. Runs `importYaml`, shows warnings, pre-fills form.

### Already configured

4. **"Export config" link:** Next to "Reset to defaults". Downloads current `StoredConfig` as `yardbird.yaml` via a Blob download.

### Import warnings display

If `importYaml` returns `warnings.length > 0`: show a `<ul>` of warning strings above the form before the user confirms. Non-blocking.

### Files

- **Modify:** `src/components/ConnectionSetup.vue`

---

## Part 4: public/yardbird.yaml — template only

Replace content with a fully-commented template. No real hostnames or layout-specific values. Still served by Vite/Caddy — Docker operators can volume-mount it as a seed config for the "Import server config" banner.

---

## Types cleanup

Remove from `src/core/types.ts`:
- `LayoutConfig` interface
- `LayoutPluginsConfig` interface (if it exists as a separate type)
- The comment block `// ── Legacy YAML config`

---

## Testing

- `sanitize()` — unit tests: valid config, missing jmri, unknown fields stripped, deprecated `tramPrefix` stripped, wrong version returns null
- `importYaml()` — unit tests: valid YAML, YAML with deprecated fields (warnings returned), YAML with unknown fields (stripped silently), fatally broken YAML (null returned)
- `exportYaml()` — unit test: round-trip (export then import returns equivalent config)
- `useConfig` — update existing tests: remove YAML-fallback tests, add `needsSetup` test for empty localStorage
- `ConnectionSetup.vue` — manual verification (no component test harness yet)

---

## Migration notes

- `useConfig.test.ts`: remove `freshConfig()` pattern (no more module-level `useLayout` mock needed) and the YAML-fallback describe blocks; add `needsSetup` test
- The YAML backfill added in the previous session (`backfillConnections`, `waitForLayout`) is removed — it is superseded by this design
