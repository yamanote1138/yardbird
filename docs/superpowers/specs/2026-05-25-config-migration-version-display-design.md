# Config Migration & Version Display Design

**Goal:** Ensure new YAML connection fields are picked up by existing users without wiping their layout, and display the app version on the splash screen.

---

## Problem

`useConfig` loads from localStorage first, falling back to YAML only when localStorage is empty. When new fields are added to `yardbird.yaml` (e.g. `rosterGroups`), existing users never see them — their localStorage config is stale but the version check doesn't reject it.

---

## Part 1: YAML Backfill for Connection Settings

### Approach

When loading from localStorage, deep-merge `connections` with the YAML plugin config as defaults. YAML provides the base; the stored config provides overrides. New YAML fields appear automatically. User-saved values (host, port, etc.) are preserved.

`tabs` is not touched — it is fully user-generated data and must not be overwritten from YAML.

### Merge Strategy

```
merged.connections.jmri    = { ...yamlPlugins.jmri,    ...stored.connections.jmri }
merged.connections.homeassistant = { ...yamlPlugins.homeassistant, ...stored.connections.homeassistant }
```

Shallow merge per connection is sufficient. Connection config objects are flat (no deeply nested user data within them — `powerZones` and `rosterGroups` are arrays that come entirely from YAML and should be replaced wholesale by the stored value if present, not element-merged).

### Behaviour

| Scenario | Result |
|---|---|
| New YAML field, not in localStorage | YAML value used |
| Field in both YAML and localStorage | Stored value wins |
| Field only in localStorage (YAML removed it) | Stored value preserved |
| `tabs` | Unchanged — localStorage authoritative |

### StoredConfig version

`StoredConfig.version` remains at `1`. It guards against genuinely incompatible tab/widget schema changes. It is not incremented for connection setting additions (those are handled by the merge).

### Files

- **Modify:** `src/core/useConfig.ts` — update `init()` to backfill connections from YAML after loading stored config

---

## Part 2: Version Display on Splash Screen

### Approach

Import `version` directly from `package.json`. Vite resolves this at build time — no `vite.config.ts` changes needed. Add `v8.2.0` (or whatever the current version is) as small muted text between the "YardBird" title and the "Your customizable layout control panel" subtitle in `ConnectionSetup.vue`.

### Layout

```
YardBird          ← existing <h1>
v8.2.0            ← new: text-xs text-neutral-500, centered
Your customizable layout control panel  ← existing subtitle
```

### Files

- **Modify:** `src/components/ConnectionSetup.vue` — add version line between title and subtitle
- **TypeScript:** `resolveJsonModule` is already enabled via `@vue/tsconfig` — no tsconfig changes needed

---

## Testing

- `useConfig` unit tests: add a case where localStorage has `connections.jmri` without `rosterGroups` but YAML has it — verify `rosterGroups` appears in the loaded config
- Manual: open splash screen, confirm version string displays correctly
