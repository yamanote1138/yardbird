# Trains on the Interwebs (TOTI)

Modern web-based control system for JMRI model railroad operations.

## Tech Stack

- **Vue 3** - Composition API with TypeScript
- **Vite** - Fast build tool
- **Bootstrap 5** - Modern CSS framework
- **jmri-client 3.5** - WebSocket-based JMRI communication

## Requirements

- Node.js 20+ (for development only)
- JMRI server running with JSON WebSocket enabled (or use Mock Mode)
- Browser on same network as JMRI server

## Quick Start

The application features a **connection setup screen** on first launch where you configure your JMRI connection. No configuration files needed!

### First Run

1. **Install and start:**
   ```bash
   npm install
   npm run dev
   ```

2. **Open http://localhost:5173 in your browser**

3. **Configure connection** in the setup screen:
   - Enter your JMRI hostname (e.g., `raspi-jmri.local`)
   - Set port (default: `12080`)
   - Enable secure connection if using HTTPS/WSS
   - OR enable Mock Mode for demo without hardware

4. **Click Connect** - Your settings are saved in browser localStorage

### Connection Options

**Real JMRI Server:**
- Host: Your JMRI server hostname or IP (e.g., `raspi-jmri.local`, `192.168.1.100`)
- Port: `12080` (default JMRI WebSocket port)
- Secure: Check if JMRI has SSL configured (uses `wss://` instead of `ws://`)

**Mock Mode (Demo/Testing):**
- No JMRI hardware required
- Simulated locomotives and controls
- Perfect for testing UI changes or demos

**Debug Logging:**
- Enable to see detailed logs in browser console
- Useful for troubleshooting connection issues

Your settings are automatically saved and reloaded on next visit. Click the **Logout** button to return to the setup screen and change settings.

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type-check
npm run type-check
```

The dev server will start at http://localhost:5173

## Deployment

### Docker (Recommended)

The application features **runtime configuration** - no build-time environment variables needed! Configure your JMRI connection through the web UI on first launch.

**Deploy with Docker:**
```bash
docker compose up -d
```
Access at http://localhost:8080

**Customize the port:**
```bash
# Use a different port (e.g., 3000)
PORT=3000 docker compose up -d

# Or create a .env file
echo "PORT=3000" > .env
docker compose up -d
```

On first visit, you'll see a connection setup screen where you can:
- Enter your JMRI server hostname and port
- Enable Mock Mode for testing without hardware
- Enable debug logging
- All settings saved in browser localStorage

**Development with hot reload:**
```bash
docker compose -f compose.dev.yaml up --build
```
Access at http://localhost:5173

### Manual Deployment

Build the app and serve the `dist/` folder from any static web server:

```bash
npm run build
npx serve dist
```

Or use GitHub Pages, Netlify, Vercel, etc.

## Features

- **Power Control** - Track power on/off
- **Throttle Control** - Speed, direction, and functions for locomotives
- **Turnout Control** - Switch turnout positions
- **Real-time Updates** - WebSocket connection for instant feedback
- **Responsive Design** - Works on desktop, tablet, and mobile

## Architecture

This is a pure frontend single-page application (SPA) that connects directly to JMRI via WebSocket. There is no backend server required - the browser communicates directly with JMRI since they're on the same network.

```
┌─────────────────────┐
│   Browser (Vue 3)   │
│                     │
│  - Train controls   │
│  - Power controls   │
│  - Turnout controls │
│  - Throttle UI      │
└──────────┬──────────┘
           │ WebSocket
           │ (jmri-client)
           ▼
┌─────────────────────┐
│   JMRI Server       │
│  astrotrain.local   │
│     :12080          │
└─────────────────────┘
```

## Troubleshooting

**"Disconnected from JMRI" error:**
- Verify JMRI is running
- Check that the WebSocket server is enabled in JMRI preferences
- Verify hostname/IP and port in connection settings
- Verify browser and JMRI are on the same network
- Click **Logout** to return to setup screen and change settings
- Enable debug logging to see detailed connection info in console

**Locomotives not showing:**
- Make sure locomotives are configured in JMRI roster
- Enable debug logging and check browser console for errors
- Try clicking Logout and reconnecting

**Change connection settings:**
- Click the **Logout** button in the header
- This returns you to the connection setup screen
- Enter new settings and reconnect

## License

Private use only
