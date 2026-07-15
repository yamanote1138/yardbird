<div align="center">
  <img src="public/favicon.svg" width="96" alt="YardBird" />
  <h1>YardBird</h1>
  <p>A drag-and-drop layout control panel for model railroads.</p>

  [![CI](https://github.com/yamanote1138/yardbird/actions/workflows/ci.yml/badge.svg)](https://github.com/yamanote1138/yardbird/actions/workflows/ci.yml)
  [![Docker Pulls](https://img.shields.io/docker/pulls/yamanote1138/yardbird?logo=docker&logoColor=white)](https://hub.docker.com/r/yamanote1138/yardbird)
  ![Vue](https://img.shields.io/badge/-Vue_3-4FC08D?logo=vuedotjs&logoColor=white)
  ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
  ![Vite](https://img.shields.io/badge/-Vite-646CFF?logo=vite&logoColor=white)
  ![Tailwind CSS](https://img.shields.io/badge/-Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)
</div>

---

YardBird is a pure frontend SPA that connects directly to your layout hardware — no backend server, no database. Build your control panel visually: create tabs, drag widgets onto a grid, and configure each one. Your layout is saved locally and can be exported as a YAML file.

<p align="center">
  <img src="docs/screenshots/dashboard.png" width="49%" alt="YardBird dashboard — throttles, turnouts, and lights" />
  <img src="docs/screenshots/edit-mode.png" width="49%" alt="YardBird visual dashboard editor" />
</p>

## Features

- **Visual dashboard editor** — drag widgets onto a grid, resize, reorder tabs, import/export config
- **Locomotive throttles** — speed, direction, and function buttons from your JMRI roster
- **Turnouts** — toggle switch positions via JMRI / LCC
- **Lights** — toggle LCC lights, independent of track power
- **DC tram control** — JMRI-native tram loop control via a DCC-EX sub-connection, with configurable PWM frequency
- **Command station power** — per-connection power buttons with combined on/off in the header
- **Home Assistant** — control HA lights and switches from your dashboard
- **Responsive** — works on desktop, tablet, and mobile

## Quick start

### Docker

```bash
mkdir -p config
cp yardbird.example.yaml config/yardbird.yaml
$EDITOR config/yardbird.yaml   # set your JMRI host
docker compose up -d
```

Open `http://localhost:9273`.

### Development

```bash
npm install
npm run dev    # http://localhost:5173
```

See [docs/installation.md](docs/installation.md) for full setup details, including JMRI prerequisites and DCC-EX tram control.

## Configuration

Connection settings are managed through the UI and saved in localStorage. `yardbird.yaml` provides factory defaults — it is only read when no saved config exists (first run or after a reset).

See [docs/configuration.md](docs/configuration.md) for the full YAML schema, widget reference, and export/import format.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the plugin system, config flow, Gridstack canvas details, and how to add new widget types.

## Tech Stack

| | |
|---|---|
| [Vue 3](https://vuejs.org/) + TypeScript | Composition API throughout |
| [Vite](https://vitejs.dev/) | Dev server and build tool |
| [Nuxt UI 4](https://ui.nuxt.com/) + [Tailwind CSS 4](https://tailwindcss.com/) | UI components and styling |
| [Gridstack](https://gridstackjs.com/) | Drag-and-drop grid canvas |
| [jmri-client](https://www.npmjs.com/package/jmri-client) | JMRI WebSocket communication |
| [js-yaml](https://github.com/nodeca/js-yaml) | Config file parsing and export |

## License

Private use only
