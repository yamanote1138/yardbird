# YardBird — Configuration

## How config works

Everything YardBird uses lives in the browser's localStorage under `yardbird:config` (a `StoredConfig` JSON blob): connection settings, tabs, widgets, and their positions. You change it through the app.

YAML is only an import/export format:

| What | Format | Used for |
|---|---|---|
| `yardbird.yaml` | `plugins:` shape (below) | First-run import — by hand from the setup screen, or offered automatically when Docker mounts one |
| Tab bar **Export** | `StoredConfig` shape | Backing up or moving your full dashboard between browsers |

Once a browser is set up, editing `yardbird.yaml` doesn't change it. Reset (or import) to start over.

The list of recently used locos is kept separately under `yardbird:recentLocos` and isn't exported.

---

## yardbird.yaml

Copy `yardbird.example.yaml` and edit it. Full schema:

```yaml
# Enable verbose logging in the browser console
debug: false

plugins:

  jmri:
    host: jmri.local          # JMRI server hostname or IP
    port: 12080               # JSON WebSocket port (default: 12080)
    secure: false             # true → wss:// (for TLS / reverse-proxy setups)
    mock: false               # true → simulated data, no hardware required

    # Command station power buttons in the header toolbar.
    # Option A — explicit stations:
    commandStations:
      - name: DCC             # Button label
        prefix: "L"           # JMRI system-connection prefix
      - name: Trams
        prefix: D
    # Option B — auto-discover from JMRI:
    # commandStations:
    #   discover: true
    # Option C — single combined button: omit commandStations entirely

  homeassistant:              # Optional — remove to disable
    enabled: true
    url: http://homeassistant.local:8123
    token: ''                 # Long-Lived Access Token (HA Profile → Security)
    area: train_room          # HA area_id — only entities in this area appear

# Tabs are managed through the visual editor.
# Leave empty for a fresh start.
tabs: []
```

### Connection prefix

The `prefix` field in `commandStations` must match the system-connection prefix JMRI uses internally. To find it:

1. Enable `debug: true` in `yardbird.yaml` and connect
2. Open the browser console — prefix letters appear in the connection logs
3. Or check JMRI **Preferences → Connections** — the letter is shown next to each connection

---

## Dashboard configuration (visual editor)

Tabs and widgets are configured through the built-in editor — no YAML editing needed.

### Entering edit mode

Click the pencil (✏) icon in the header toolbar. The widget palette slides in on the left and all widgets get a drag handle + config/delete overlay.

### Adding widgets

Drag a widget from the left palette onto the canvas. A config modal opens immediately. Fill in the details and click **Add Widget**.

### Configuring existing widgets

In edit mode, click the ⚙ (gear) icon on any widget.

### Changing a throttle's loco (no edit mode needed)

When a throttle is released, its widget shows a **Change loco** button. It opens the same picker as the gear:

- **Recent** — the last 5 locos you acquired, at the top
- **Roster** — your JMRI roster, with group filters
- **DCC address** — type any address

Your pick is saved right away and stays after a reload. Locos already on another throttle widget are grayed out. The button is hidden while the throttle is acquired, so you can't swap a loco that might still be moving.

### Driving a throttle

- **Speed steps** — tap any of the 10 steps (10%–100%) and the loco ramps there at 2 seconds per step. Tap another step mid-ramp to change course.
- **Direction** — if moving, ramps down, flips, and ramps back up to the same speed
- **Brake** — ramps down to a stop
- **E-Stop** — stops immediately and cancels any ramp

### Moving and resizing

In edit mode, drag widgets by their handle bar. Resize by dragging the bottom-right corner.

### Tab management

In edit mode, the tab bar shows management controls:

- **+** — add a new tab (choose name and icon)
- **Double-click a tab name** — rename inline
- **Hover a tab** — pencil (edit icon and name) + × (delete) buttons appear
- **Drag tabs** — reorder

### Export, import, and reset

In edit mode, the tab bar right side shows:

- **↓ Export** — downloads your full config as `yardbird-config-YYYYMMDD-HHMMSS.yaml`
- **↑ Import** — load a previously exported YAML file (shows a preview before applying)
- **↺ Reset** — clears localStorage and reloads from `yardbird.yaml`

---

## Widget types

| Widget | Plugin | Config fields |
|---|---|---|
| **Throttle** (`jmri-throttle`) | JMRI | DCC address, command station (loco can also be changed at runtime) |
| **Turnout** (`jmri-turnout`) | JMRI | JMRI turnout system name |
| **Light** (`jmri-light`) | JMRI | JMRI light system name |
| **Command Station** (`jmri-power`) | JMRI | Connection prefix, label |
| **Room Control** (`ha-entity`) | Home Assistant | HA entity ID |

### Adding a new widget type

See [architecture.md](architecture.md) — Widget Registry section.

---

## Exported config format (StoredConfig)

Exported files use `StoredConfig` format — different from `yardbird.yaml`:

```yaml
version: 1
debug: false
connections:
  jmri:
    host: jmri.local
    port: 12080
    secure: false
    mock: false
    commandStations:
      - name: DCC
        prefix: L
      - name: Trams
        prefix: D
  homeassistant:
    enabled: true
    url: http://homeassistant.local:8123
    token: eyJ...
    area: train_room
tabs:
  - id: trams-1234567890
    name: Trams
    icon: i-mdi-tram
    widgets:
      - id: f5338dd8-...
        type: jmri-throttle
        grid:
          x: 0
          y: 1
          w: 4
          h: 5
        config:
          address: 30
          commandStation: D
```

Import a `StoredConfig` file via the editor's Import button. The file is validated before it is applied.

---

## Troubleshooting

**Cannot connect to JMRI**
- Verify JSON WebSocket is enabled: JMRI → Preferences → Web Server → JSON WebSocket
- Confirm `host` and `port` match your JMRI server
- Browser and JMRI must be on the same network

**Power zone shows UNKNOWN after connect**
- JMRI does not reliably return named-connection power state via WebSocket
- Toggle the button once — state will be correct from that point on

**Command station picker not showing in throttle config**
- If you imported a config while already connected, the command stations update automatically
- If not, exit and reconnect — the new config is picked up on connect

**DCC-EX / Trams power zone stays UNKNOWN**
- JMRI has lost its DCC-EX connection (common after power-cycling the command station)
- Restart JMRI to restore the connection

**Config changes not appearing**
- `yardbird.yaml` is only offered for import on a browser with no saved setup
- Changes to the active config are made in the app or by importing
- To start over: reset (editor → ↺) or clear `yardbird:config` from DevTools → Application → Local Storage, then reload
