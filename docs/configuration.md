# YardBird — Configuration

## How config works

YardBird has two config layers:

| Layer | Format | Where |
|---|---|---|
| **Factory defaults** | `LayoutConfig` (YAML) | `yardbird.yaml` / `config/yardbird.yaml` |
| **Active config** | `StoredConfig` (JSON) | Browser localStorage (`yardbird:config`) |

On first load, the factory defaults are read from `yardbird.yaml`, migrated to `StoredConfig`, and saved to localStorage. All subsequent loads use localStorage — the YAML file is not re-read unless you reset to defaults.

Your full dashboard layout (tabs, widgets, positions, connection settings) is stored in localStorage and can be exported to a YAML file from within the app for backup and transfer between devices.

---

## yardbird.yaml (factory defaults)

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

    # Tram / DC loop control
    tramPrefix: D             # System-connection prefix for DCC-EX in JMRI
                              # Omit if you have only one system connection
    tramPwmFreq: 3            # PWM frequency on acquire: 0=131Hz 1=490Hz 2=3.4kHz 3=Supersonic

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

The `prefix` field in `commandStations` (and `tramPrefix`) must match the system-connection prefix JMRI uses internally. To find it:

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
| **Throttle** (`jmri-throttle`) | JMRI | DCC address, command station |
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
    tramPrefix: D
    tramPwmFreq: 3
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
- `yardbird.yaml` is only read on first load (or after reset)
- Changes to the active config are made through the visual editor or import
- To force a YAML re-read: reset to defaults (editor → ↺) or clear `yardbird:config` from DevTools → Application → Local Storage
