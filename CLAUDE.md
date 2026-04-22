# YardBird - Project Guide

This file contains project conventions, architecture decisions, and development standards for maintaining consistency across Claude sessions.

## Project Overview

**YardBird** is a modern web-based control system for JMRI (Java Model Railroad Interface) operations. It's a single-page application (SPA) that provides real-time control of model railroad equipment through a responsive web interface.

### Tech Stack
- **Vue 3** with Composition API and TypeScript
- **Vite** for fast development and building
- **Nuxt UI 4** + **Tailwind CSS 4** for responsive UI components
- **Iconify** (Material Design Icons + Heroicons) for icons
- **jmri-client 4.1+** for WebSocket-based JMRI communication (power, throttles, turnouts, lights)
- **Node.js 20+** required

### Current Version
v4.8.0 - DC PWM frequency selector for tram control

## User Context & Preferences

**Train Enthusiasm**: The user is specifically interested in Japanese trains, particularly the Yamanote Line (Tokyo's iconic green loop line). When discussing trains in conversation, examples, or explanations, favor Japanese railway references when appropriate. This is context for communication style only - do NOT add Japanese train references to code, documentation, or user-facing features.

## Architecture Principles

### Pure Frontend SPA
- **No backend server** - The browser communicates directly with JMRI via WebSocket
- **Direct WebSocket connection** - Uses the jmri-client library to connect to JMRI's JSON WebSocket server (port 12080)
- **Network requirement** - Browser and JMRI server must be on the same network
- **Mock mode support** - Can run without hardware using simulated data for testing/demos

### DCC-EX Direct Connection (v4.7.0+)
- **Separate from JMRI** - DC tram control connects directly to DCC-EX EX-CommandStation
- **WiThrottle protocol** - Throttle acquire/speed/direction/release via WiThrottle over WebSocket
- **Dual-connection proxy** - WebSocket-to-TCP proxy opens two TCP connections per client: one WiThrottle (throttles), one native (power commands `<1>`/`<0>`)
- **Why two connections?** - DCC-EX classifies connections by first message character (`<` = native, else WiThrottle) and locks them forever. WiThrottle `PPA` only controls MAIN tracks, not DC tracks. Native `<1>`/`<0>` controls ALL tracks including DC.
- **Proxy runs in Docker** - Same container as Caddy, activated by `DCCEX_HOST` env var
- **Proxy message queuing** - Browser WS connects faster than proxy TCP to DCC-EX; proxy buffers early messages and flushes when TCP is ready
- **useDccEx composable** - Singleton state pattern matching useJmri. Three-state connection (`disconnected`/`connecting`/`connected`). Power state from both WiThrottle `PPA` and native `<p>` responses. Queries native `<s>` on connect for true power state (WiThrottle greeting `PPA` can be stale).
- **Tram addresses** - 30 (Track A / Inner Loop), 31 (Track B / Outer Loop) — filtered from main locomotive roster
- **PWM frequency control (v4.8.0+)** - Per-track DC PWM frequency selector via native `<F cab DCFREQ n>` command. Four options: 131Hz (0), 490Hz (1), 3.4kHz (2), Supersonic (3). Defaults to 490Hz. Sent via native protocol through proxy. Requires DCC-EX `configurable-pwm` branch firmware.

### Key Architecture Decisions

1. **jmri-client Browser Bundle**
   - CRITICAL: Use the browser-specific bundle from jmri-client
   - Vite config aliases `jmri-client` to `node_modules/jmri-client/dist/browser/jmri-client.js`
   - This ensures proper WebSocket reconnection handling in the browser
   - DO NOT use the Node.js version of jmri-client

2. **Singleton State Pattern**
   - JMRI connection state is managed as a singleton in `useJmri` composable
   - Single JmriClient instance shared across all components
   - Prevents multiple WebSocket connections
   - State persists across component mounts/unmounts

3. **Power State Management**
   - Uses official PowerState enum from jmri-client (0=UNKNOWN, 2=ON, 4=OFF)
   - Three-state UI: ON (green), OFF (red), UNKNOWN (yellow)
   - Always fetch initial power state on connection
   - Verify power state after setting to handle JMRI quirks

6. **Lights & Turnouts / LCC Independence**
   - Lights and turnouts use LCC (Layout Command Control), independent of DCC track power
   - Light and turnout controls remain enabled even when track power is OFF
   - Only requires active JMRI connection (unlike throttles which also need power)

4. **Heartbeat Interval**
   - Set to 15 seconds to prevent idle disconnects
   - JMRI disconnects after 30s of no heartbeat
   - Previous 30s interval was hitting timeout threshold

5. **Runtime Configuration (v3.5.0+)**
   - Connection settings configured through web UI on first launch
   - Settings stored in browser localStorage
   - No environment variables or build-time configuration needed
   - ConnectionSetup component handles initial configuration
   - Logout button returns to setup screen to change settings

## Project Structure

```
/
├── src/
│   ├── components/          # Vue components
│   │   ├── ConnectionSetup.vue  # Initial connection configuration
│   │   ├── LightList.vue        # Light toggle controls (LCC)
│   │   ├── LocomotiveHeader.vue # Locomotive name/image header
│   │   ├── PowerControl.vue     # Track power control + status
│   │   ├── RosterCard.vue       # Locomotive roster display
│   │   ├── ThrottleCard.vue     # Individual locomotive control
│   │   ├── ThrottleList.vue     # List of active throttles
│   │   ├── TramControl.vue      # DC tram control (DCC-EX direct)
│   │   └── TurnoutList.vue      # Turnout toggle controls (LCC)
│   ├── composables/         # Reusable composition functions
│   │   ├── ExtendedJmriClient.ts # Extended JMRI client (named power sources)
│   │   ├── useDccEx.ts         # DCC-EX direct WiThrottle client (singleton)
│   │   ├── useJmri.ts          # Main JMRI client (singleton)
│   │   └── useWebSocket.ts     # WebSocket utilities
│   ├── types/              # TypeScript type definitions
│   │   └── jmri.ts            # JMRI-related types
│   ├── utils/              # Utility functions
│   │   └── logger.ts          # Logging utility
│   ├── App.vue             # Root component
│   └── main.ts             # Application entry point
├── proxy/                  # DCC-EX WebSocket-to-TCP proxy
│   └── dccex-ws-proxy.mjs      # Dual-connection WS→TCP relay
├── docker-entrypoint.sh    # Starts proxy + Caddy in container
├── debug/                  # Debug files (GITIGNORED - not committed)
│   ├── *.mjs                   # Test scripts
│   └── *.png                   # Screenshots
├── vite.config.ts          # Vite build configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies and scripts
```

## Development Conventions

### Vue/TypeScript Style

1. **Composition API Only**
   - Use `<script setup>` syntax for all components
   - Prefer `ref` and `computed` over reactive objects
   - Use TypeScript with proper type annotations

2. **Component Organization**
   ```vue
   <script setup lang="ts">
   // 1. Imports (grouped: vue, external libs, local)
   import { ref, computed, onMounted } from 'vue'
   import { useJmri } from '@/composables/useJmri'

   // 2. Props/Emits
   const props = defineProps<{ ... }>()

   // 3. Composables
   const { state, methods } = useJmri()

   // 4. Local state
   const localState = ref(...)

   // 5. Computed properties
   const computed = computed(() => ...)

   // 6. Methods
   const handleAction = () => { ... }

   // 7. Lifecycle hooks
   onMounted(() => { ... })
   </script>

   <template>
     <!-- Simple, semantic HTML -->
   </template>

   <style scoped>
     /* Component-specific styles */
   </style>
   ```

3. **Import Aliases**
   - Use `@/` for src imports: `import { logger } from '@/utils/logger'`
   - Never use relative paths like `../../utils/logger`

4. **Logging**
   - Use the centralized logger from `@/utils/logger`
   - Available methods: `logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()`
   - Don't use `console.log()` directly

5. **Debugging Files**
   - ALWAYS place debugging scripts, test files, and screenshots in the `debug/` directory
   - The `debug/` directory is gitignored and never committed
   - Examples of debug files: test scripts (.mjs), screenshots (.png), inspection tools
   - Keep the root directory clean - no uncommitted files outside of `debug/`

### Runtime Configuration

**As of v3.5.0**, the application uses runtime configuration instead of build-time environment variables.

1. **Connection Setup Screen**
   - Displayed on first launch (when `!isInitialized`)
   - Form fields for JMRI host, port, secure connection
   - Mock mode toggle for testing without hardware
   - Debug logging checkbox
   - Settings saved to browser localStorage

2. **LocalStorage Keys**
   - `jmri-connection-settings` - JSON object with connection configuration
   - `jmri-debug-enabled` - String 'true'/'false' for debug logging
   - Settings persist across browser sessions
   - Settings are per-browser, per-domain

3. **Configuration Flow**
   ```typescript
   // User configures in ConnectionSetup component
   interface ConnectionSettings {
     host: string              // e.g., 'raspi-jmri.local'
     port: number              // e.g., 12080
     secure: boolean           // false = ws, true = wss
     mockEnabled: boolean      // Enable mock mode
     debugEnabled: boolean     // Enable debug logging
     dccexEnabled: boolean     // Enable DCC-EX tram controller
     dccexHost: string         // DCC-EX proxy host (default: same as JMRI host)
     dccexPort: number         // DCC-EX proxy WS port (default: 2561)
   }

   // Settings converted to JmriConnectionSettings
   // Passed to useJmri().initialize(settings)
   // JmriClient created with runtime settings
   ```

4. **Logger Configuration**
   - Debug messages only show when `localStorage.getItem('jmri-debug-enabled') === 'true'`
   - Info, warn, error always shown
   - User controls via checkbox in ConnectionSetup

5. **Changing Settings**
   - User clicks "Logout" button in header
   - Calls `disconnect()` to clean up JMRI client
   - Returns to ConnectionSetup screen
   - New settings saved and connection re-established

### Git Commit Conventions

1. **Commit Message Format**
   - Use clear, descriptive commit messages
   - Focus on the "why" not just the "what"
   - NO AI attribution in commits (see user preferences)

2. **Release Commits**
   - Format: `Release vX.Y.Z: Brief description`
   - Example: `Release v3.2.0: JMRI server compatibility improvements`
   - Include detailed changes in commit body

3. **Feature Commits**
   - Format: `Brief description of change`
   - Examples:
     - `Mobile-first UI improvements`
     - `Fix compatibility with real JMRI servers`
     - `Reduce heartbeat interval to prevent idle disconnects`

4. **Version Updates**
   - Update `package.json` version for releases
   - Update README.md if jmri-client version changes significantly
   - Keep versioning consistent across the project

5. **Using GitHub CLI (gh)**
   - **ALWAYS use `gh` for releases** instead of manual GitHub UI
   - Workflow for new releases:
     ```bash
     # 1. Commit all changes
     git add src/ CLAUDE.md
     git commit -m "Descriptive commit message"

     # 2. Bump version in package.json and commit
     # Edit package.json version
     git add package.json
     git commit -m "Release vX.Y.Z: Brief description"

     # 3. Create annotated tag
     git tag -a vX.Y.Z -m "Release vX.Y.Z: Brief description"

     # 4. Push commits and tags
     git push && git push --tags

     # 5. Create GitHub release with detailed notes
     gh release create vX.Y.Z --title "vX.Y.Z: Title" --notes "Release notes..."
     ```
   - Release notes should include:
     - Summary of changes by category
     - Breaking changes (if any)
     - Full changelog link
   - Use `gh pr` commands for pull request operations when needed

### Code Quality

1. **TypeScript Strictness**
   - Run `npm run type-check` before committing
   - Fix all TypeScript errors - don't use `@ts-ignore`
   - Properly type all function parameters and return values

2. **Build Process**
   - Build command runs type-check automatically: `npm run build`
   - Must pass type-check before successful build
   - Always test production builds with `npm run preview`

3. **Responsive Design**
   - Mobile-first approach (as of v3.1.0)
   - Tailwind CSS utility classes for responsive layouts
   - Nuxt UI components (UButton, UCard, UInput, UCheckbox, UAlert, UIcon)
   - Test on mobile, tablet, and desktop viewports
   - Dev server allows network access (`host: true`) for device testing

## Docker & CI/CD

### Docker Setup

The project includes Docker support for both development and production environments:

1. **Production Deployment**
   - Multi-stage Dockerfile builds optimized production image
   - Builder stage: Compiles Vue/TypeScript app with Node 20 Alpine
   - Production stage: Node 20 Alpine with Caddy binary + DCC-EX proxy
   - Image published to Docker Hub: `yamanote1138/yardbird`
   - Includes health check endpoint
   - DCC-EX proxy starts automatically when `DCCEX_HOST` env var is set

2. **Docker Compose Files**
   - `compose.yaml` - Production deployment using pre-built registry image
   - `compose.dev.yaml` - Development mode with hot reload and volume mounts

3. **Key Docker Features**
   - Multi-platform builds: linux/amd64 and linux/arm64
   - GitHub Actions cache for faster builds
   - SPA routing support (all routes serve index.html)
   - Automatic gzip compression
   - Lightweight Caddy server - no configuration files needed

### Docker Configuration (v3.5.0+)

**As of v3.5.0**, Docker deployment is greatly simplified - no build args or environment variables needed!

1. **Runtime Configuration**
   - Single Docker image works for all deployments
   - Users configure JMRI connection through web UI on first launch
   - Settings stored in browser localStorage (persists per-browser)
   - No need to rebuild image for different JMRI servers

2. **Deployment Simplicity**
   ```bash
   # Production deployment - works anywhere
   docker compose up -d
   # Access at http://localhost:8080
   # Configure JMRI connection in web UI

   # With DCC-EX tram support:
   DCCEX_HOST=192.168.1.231 docker compose up -d
   # Proxy starts on port 2561, relays to DCC-EX at 192.168.1.231:2560
   ```

3. **CI/CD Build Strategy**
   - GitHub Actions builds single universal image
   - No environment-specific builds needed
   - Image published to Docker Hub: `yamanote1138/yardbird`
   - Same image used for all deployments

4. **Development**
   - `compose.dev.yaml` for hot reload during development
   - Still mounts source files as volumes
   - Vite dev server handles rebuilds

### GitHub Actions Workflows

Two automated workflows handle CI/CD:

1. **CI Workflow** (`.github/workflows/ci.yml`)
   - Triggers on: pushes to `main` and all pull requests
   - Runs type checking and builds
   - Validates Docker image builds
   - Uses GitHub Actions cache for faster npm and Docker builds
   - Does NOT push images (validation only)

2. **Docker Build & Push** (`.github/workflows/docker-build-push.yml`)
   - Triggers on: version tags (e.g., `v3.4.0`)
   - Builds multi-platform Docker images
   - Pushes to Docker Hub registry
   - Tags images with version and `latest`
   - Requires secrets: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`

### Release Workflow with Docker

When creating a new release:

```bash
# 1. Commit all changes
git add .
git commit -m "Feature description"

# 2. Bump version in package.json and commit
# Edit package.json version to match tag
git add package.json
git commit -m "Release vX.Y.Z: Brief description"

# 3. Create annotated tag (triggers Docker build/push)
git tag -a vX.Y.Z -m "Release vX.Y.Z: Brief description"

# 4. Push commits and tags
git push && git push --tags

# 5. GitHub Actions automatically builds and pushes Docker image

# 6. Create GitHub release with notes
gh release create vX.Y.Z --title "vX.Y.Z: Title" --notes "Release notes..."
```

The tag push triggers the Docker build workflow, which builds and publishes the image to Docker Hub with appropriate version tags.

## Common Tasks

### Starting Development
```bash
# First time setup
npm install

# Daily development
npm run dev      # Vite only (JMRI features)
npm run dev:all  # Vite + DCC-EX proxy (tram features)
```

Open http://localhost:5173 in your browser and configure your JMRI connection through the setup screen.

When using `dev:all`, the DCC-EX proxy starts on port 2561 and connects to the CommandStation at 192.168.1.231:2560 by default. Enable DCC-EX in the connection setup screen (host: `localhost`, port: `2561`).

### Testing Without Hardware
When the app loads, simply check the "Demo Mode" checkbox on the connection setup screen. No configuration files needed!

### Building for Production
```bash
npm run build      # Type-checks and builds
npm run preview    # Preview production build
```

### Running with Docker

**Development mode** (with hot reload):
```bash
docker compose -f compose.dev.yaml up --build
# Access at http://localhost:5173
# Source files mounted as volumes - changes reflect immediately
```

**Production mode** (local build):
```bash
docker compose up --build
# Access at http://localhost:8080
# Full production build with Caddy
```

**Production mode** (from Docker Hub):
```bash
docker compose up
# Pulls yamanote1138/yardbird:latest
# Access at http://localhost:8080
```

**Customize the port:**
```bash
# Use a different port (e.g., 3000)
PORT=3000 docker compose up -d

# Or create a .env file
echo "PORT=3000" > .env
docker compose up -d
```

**Stop containers**:
```bash
docker compose down
# Or for dev: docker compose -f compose.dev.yaml down
```

### Updating Dependencies
```bash
npm update                    # Update to latest compatible versions
npm outdated                  # Check for outdated packages
npm install package@version   # Install specific version
```

**IMPORTANT:** If updating `jmri-client`, also update:
- README.md tech stack section
- This CLAUDE.md file
- Test thoroughly with real JMRI hardware if possible

## JMRI Integration Details

### Connection Lifecycle
1. Application initializes JmriClient with config
2. Manual connection triggered (autoConnect: false)
3. On connect: fetch initial power state, turnouts, and lights
4. User-initiated roster fetch after connection established
5. Maintain 15-second heartbeat to prevent timeout
6. Handle reconnection on disconnect (jmri-client handles this)

### Throttle Management
- Throttles created on-demand when user selects locomotive
- Each throttle mapped by DCC address
- Throttle IDs stored in Map for reuse
- Release throttles when no longer needed (future enhancement)

### Function Buttons
- Dynamic function buttons from JMRI roster
- Parse `functionKeys` array from roster entries
- Display only functions with labels (plus F0 as headlight)
- Icon mapping for common functions (bell, horn, brake, etc.)

### Light Control
- Lights use LCC, independent of DCC track power
- Fetched on connect via `listLights()`, real-time updates via `light:changed` event
- Toggle between ON (LightState.ON=2) and OFF (LightState.OFF=4)
- LightList component NOT disabled when track power is off (unlike throttles)

### Power Control Quirks
- JMRI power state can be inconsistent immediately after setting
- Always verify state after power on/off
- Handle UNKNOWN state gracefully with yellow indicator
- Fetch fresh state on reconnection

## Troubleshooting Common Issues

### WebSocket Connection Failures
- Check JMRI WebSocket server is enabled in preferences
- Verify correct host/port in connection setup screen
- Ensure browser and JMRI on same network
- Check browser console for WebSocket errors

### Throttle Control Not Working
- Verify locomotive exists in JMRI roster
- Check DCC address matches roster entry
- Look for throttle acquisition errors in console
- Try releasing and re-acquiring throttle

### Build/Type Errors
- Run `npm run type-check` to isolate TypeScript issues
- Check for outdated type definitions
- Verify all imports are correctly typed
- Make sure tsconfig references are intact

### Mobile Display Issues
- Test responsive breakpoints (640px, 768px, 1024px, 1280px — Tailwind defaults)
- Use Tailwind responsive utilities (sm:, md:, lg:, xl:)
- Check for fixed-width elements breaking mobile layout
- Test touch interactions on actual mobile devices

## Future Enhancement Ideas

These are NOT committed work, just ideas for consideration:

- [ ] Automatic throttle release when idle
- [ ] Route/automation control
- [ ] Consist (multiple unit) control
- [ ] Saved layouts/presets
- [ ] Sound/haptic feedback on mobile
- [ ] PWA (Progressive Web App) for offline capability
- [ ] Multiple railroad profiles

## References

- **JMRI Documentation**: https://www.jmri.org/help/en/html/web/JsonServlet.shtml
- **jmri-client Package**: https://www.npmjs.com/package/jmri-client
- **Vue 3 Composition API**: https://vuejs.org/guide/extras/composition-api-faq.html
- **Vite**: https://vitejs.dev/guide/
- **Nuxt UI**: https://ui.nuxt.com/
- **Tailwind CSS**: https://tailwindcss.com/docs

---

*Last Updated: April 2026 (v4.8.0)*
