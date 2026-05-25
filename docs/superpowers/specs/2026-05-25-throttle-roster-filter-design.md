# Throttle Config Roster Filter Design

**Goal:** Let users filter the loco roster in the throttle config dialog by roster group via pill buttons.

**Scope:** Single file — `src/widgets/config/ThrottleConfig.vue`.

---

## Context

`ThrottleConfig.vue` already renders `groupedRoster` (configured JMRI groups) and `ungroupedRoster` (all remaining entries) as labelled sections. With many locos across several groups, the list gets long. A filter reduces visual noise and speeds up selection.

## Design

### Pill Row

A row of pill buttons appears above the roster section whenever `allRoster.length > 0`.

Pills, in order:

| Pill | Always shown? | Condition |
|---|---|---|
| `All` | Yes | Always |
| One per `groupedRoster` entry | Only when groups exist | `groupedRoster.length > 0` |
| `Ungrouped` | Conditional | `ungroupedRoster.length > 0 && groupedRoster.length > 0` |

Active pill: blue highlight (`border-blue-500 bg-blue-500/20 text-blue-300`) — same style already used on the command station buttons.

### Content Area

Driven by `activeFilter: ref<string>('__all__')`, local to the component. Sentinel strings avoid collision with real JMRI group names.

| Active filter | What renders |
|---|---|
| `'__all__'` | Existing layout: named group sections, then ungrouped entries ("DCC Locos" label when groups also exist) |
| A group name string | Flat list of that group's entries; "None connected" if empty |
| `'__ungrouped__'` | Flat list of `ungroupedRoster` entries |

### State

- `activeFilter` is a `ref<string>` local to `ThrottleConfig.vue`, initialised to `'__all__'`.
- No persistence — the dialog is ephemeral.
- Reset to `'__all__'` on component mount (handled by `ref` initialisation).

## Files

- **Modify:** `src/widgets/config/ThrottleConfig.vue`

No other files touched. `useJmri` already exposes `groupedRoster` and `ungroupedRoster`; no composable changes needed.

## Testing

`ThrottleConfig.vue` is a Vue component — unit tests require Nuxt UI stubs not yet wired up (see CLAUDE.md "Future Component Tests"). Manual verification: open throttle config dialog with a layout that has configured roster groups, confirm pill buttons appear and filter the list correctly.
