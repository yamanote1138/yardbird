# Webcam Widget Design

**Date:** 2026-05-26
**Target version:** 8.4.0 (minor — new widget type)
**Branch:** `add-webcam-widget`

## Overview

Add a `webcam` widget type to YardBird's dashboard. The widget displays a live MJPEG stream from a local IP camera in an `<img>` tag, with pause/resume control. No backend, no library dependencies, no plugin affiliation.

Primary target: Amcrest IP2M-841EB at `192.168.1.17` via URL format:
```
http://<user>:<pass>@<ip>:<port>/cgi-bin/mjpg/video.cgi?channel=0&subtype=1
```

## Architecture

### Plugin affiliation

The webcam widget has no plugin dependency — no WebSocket, no composable, no connection state. It is self-contained: a URL goes in, a video stream comes out.

`WidgetDefinition.plugin` is made optional (`plugin?: 'jmri' | 'homeassistant'`). The widget palette shows the webcam widget regardless of which connections are active.

### Config shape

```typescript
// WidgetInstance.config for type 'webcam'
{
  label: string      // display name, optional (empty string = no label)
  streamUrl: string  // full MJPEG URL, credentials embedded if required
}
```

### Stream approach

The `<img>` tag is conditionally mounted with `v-if="!paused"`. Mounting initiates the HTTP connection and begins the MJPEG stream. Unmounting drops it cleanly. No `fetch()`, no blob URLs, no polling — the browser handles the multipart stream natively.

Note on auth: `http://user:pass@host/path` credentials in `<img src` work in most browsers for local network subresource loads. If blocked, the user should disable auth for local subnet access in the camera's settings.

Note on CORS: `<img>` tags are not subject to CORS enforcement for display. Direct camera access works without a proxy.

## Files

### New

| File | Purpose |
|---|---|
| `src/widgets/WebcamWidget.vue` | Widget component — `<img>` stream, pause/resume, loading/error states |
| `src/widgets/config/WebcamConfig.vue` | Config form — label + stream URL fields |

### Modified

| File | Change |
|---|---|
| `src/core/types.ts` | Add `'webcam'` to `WidgetType` union |
| `src/widgets/registry.ts` | Add webcam registry entry; make `plugin` optional in `WidgetDefinition` |

`WidgetPalette.vue` requires **no change** — its `availableWidgets` filter already falls through to `return true` when `def.plugin` is undefined, so the webcam widget appears in the palette unconditionally.

## Widget behaviour

### Grid dimensions

- Default size: `4w × 4h`
- Minimum size: `3w × 3h`
- The `<img>` fills width at 100%; container uses a 16:9 aspect ratio

### States

| State | Trigger | Display |
|---|---|---|
| **Loading** | On mount, before first frame | Black background + centered spinner |
| **Live** | `@load` fires on `<img>` | Full-width MJPEG stream |
| **Paused** | User clicks pause | `<img>` unmounted; black placeholder with ▶ icon |
| **Error** | `@error` fires on `<img>` | Error message + Retry button |

Pause/resume button sits in the bottom-right corner of the video frame — always visible, does not obscure the stream content.

The label (if set) is shown as a small overlay in the bottom-left corner.

### Pause/resume

```
paused ref (false by default)
  → v-if="!paused" on <img>
  → unmounting drops HTTP connection
  → remounting reconnects to live stream (not resuming from a position)
```

### Error recovery

- Retry button sets `paused = false` and resets `loading = true`, re-mounting the `<img>`
- No automatic retry — user-initiated only

## Config form

Two fields:

1. **Label** — text input, placeholder "Train room camera", optional
2. **Stream URL** — text input, placeholder `http://user:pass@192.168.1.17/cgi-bin/mjpg/video.cgi?channel=0&subtype=1`

Emits `update` with `{ label, streamUrl }` immediately on mount and on every change (same pattern as other config forms).

No URL validation — stream errors surface in the widget's error state.

## Type changes

### `src/core/types.ts`

```typescript
export type WidgetType =
  | 'jmri-power'
  | 'jmri-throttle'
  | 'jmri-turnout'
  | 'jmri-light'
  | 'ha-entity'
  | 'webcam'           // new
```

### `src/widgets/registry.ts`

```typescript
export interface WidgetDefinition {
  type: WidgetType
  name: string
  icon: string
  plugin?: 'jmri' | 'homeassistant'   // optional — webcam has none
  defaultSize: WidgetGridPos
  minSize: { w: number; h: number }
  hasConfig: boolean
  component: () => Promise<Component>
}

// New entry:
'webcam': {
  type: 'webcam',
  name: 'Webcam',
  icon: 'i-mdi-webcam',
  // no plugin
  defaultSize: { x: 0, y: 0, w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  hasConfig: true,
  component: () => import('@/widgets/WebcamWidget.vue'),
}
```

## Tests

### `WebcamConfig.test.ts`
- Renders label and URL input fields
- Pre-populates fields from config prop
- Emits `update` immediately with initial values
- Emits `update` on label change
- Emits `update` on URL change

### `WebcamWidget.test.ts`
- Shows loading state on mount (before `@load`)
- Shows label overlay when label is set
- Hides label overlay when label is empty
- Pause button unmounts the `<img>` element
- Resume button remounts the `<img>` element
- Stream URL is applied to `<img>` src
- Error state shown when `@error` fires
- Retry button resets to loading state

## Out of scope

- Snapshot polling fallback
- HLS / WebRTC stream support
- Scrypted integration
- Multiple streams per widget
- Stream health monitoring / auto-retry
