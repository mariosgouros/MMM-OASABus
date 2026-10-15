# MMM-OASABus

A [MagicMirror²](https://magicmirror.builders/) module that displays live bus and trolleybus arrival times for Athens public transport, powered by the [OASA Telematics API](https://oasa-telematics-api.readthedocs.io/en/latest/).

---

## Features

- Live arrival times from the official OASA Telematics API
- Automatic stop name resolution from stop code — no manual lookup needed
- Automatic **bus vs trolleybus** detection — blue badge for buses, amber for trolleybuses (lines 1–16)
- Filter by line, direction, or show all arrivals at a stop
- Two display modes: **full** and **compact**
- Configurable refresh interval
- Graceful handling of API timeouts — keeps last known data on screen without errors
- No npm dependencies — uses Node.js built-in modules only

---

## Screenshots

### Display Modes
#### Full Mode
Shows line badge, route description and arrival time

<img width="842" height="288" alt="Screenshot 2026-07-08 001539" src="https://github.com/user-attachments/assets/9d50da5e-8e9e-4d3c-b88c-fa12ec00b740" />

#### Compac Mode
Shows line badge and arrival time only

<img width="262" height="270" alt="Screenshot 2026-07-08 001125" src="https://github.com/user-attachments/assets/5a78852d-b3d9-4333-a895-fa069ae4851b" />

---

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/mariosgouros/MMM-OASABus
```

No additional dependencies required.

---

## Configuration

Add the following block to your `config/config.js` inside the `modules` array:

```javascript
{
  module: "MMM-OASABus",
  header: "OASA TELEMATICS",
  position: "bottom_right",
  config: {
    stopCode: "060814",
    lineID: "",
    routeType: "",
    displayMode: "full",
    stopDescrEng: "",
    updateInterval: 60000
  }
}
```

---

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `stopCode` | `string` | `""` | **Required.** The OASA stop code for your stop. See [Finding your StopCode](#finding-your-stopcode) below. |
| `lineID` | `string` | `""` | Filter arrivals to a specific line (e.g. `"040"`, `"550"`). Leave empty to show all lines serving the stop. |
| `routeType` | `string` | `""` | Filter by direction. `"1"` = inbound, `"2"` = outbound. Leave empty to show both directions. |
| `displayMode` | `string` | `"full"` | `"full"` shows line badge, route description and arrival time. `"compact"` shows line badge and arrival time only, in a narrower layout. |
| `stopDescrEng` | `string` | `""` | Optional. If provided, used as the stop display name directly, skipping the API name lookup. Useful if you want a custom label. |
| `updateInterval` | `number` | `30000` | How often to refresh arrival data, in milliseconds. Minimum recommended: `30000` (30 seconds). |

### Module-level options (outside `config`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `header` | `string` | `"OASA TELEMATICS"` | The module header displayed by MagicMirror in its native style. Set this outside the `config` block. If omitted, defaults to `"OASA TELEMATICS"`. |
| `position` | `string` | — | Any valid MagicMirror region, e.g. `"bottom_right"`, `"top_left"`. |

---

## Bus vs Trolleybus Detection

Athens trolleybus lines are always identified by a single or double-digit number between **1 and 16** (e.g. `1`, `3`, `7`, `11`). The module detects this automatically from the `LineID` returned by the API and applies a different badge color:

- **Blue badge** — regular bus
- **Amber badge** — trolleybus

No configuration is needed for this feature.

---

## Finding your StopCode

The `stopCode` is the key piece of information needed to configure the module. Here is the easiest way to find it:

From the official OASA website [telematics.oasa.gr](https://telematics.oasa.gr), under the "Stop Info" tab, select "Choose Line" e.g., 040, 
then select "Route" e.g., "SYNTAGMA-PEIRAIAS", and finally select "Stop" e.g., "PYROSBESTIKH". The stop code will now appear e.g., 240082, 
which you have to enter as a required value in module's config. Note: a different code is required for inbound and a different one for outbound.

---

## Finding LineID and RouteType

If you want to filter to a specific line or direction:

**All available lines:**
```
https://telematics.oasa.gr/api/?act=webGetLines
```
Find your line and note the `LineID` field (e.g. `"040"`, `"550"`, `"Α2"`).

**Routes and directions for a line:**
```
https://telematics.oasa.gr/api/?act=webRoutesForStop&p1={StopCode}
```
Each entry has a `RouteType` field: `"1"` for one direction, `"2"` for the other. Check the `RouteDescrEng` field to confirm which direction is which for your line.

---

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `getStopNameAndXY` | Resolves human-readable stop name from stop code |
| `webRoutesForStop` | Loads all routes and their metadata for a stop |
| `getStopArrivals` | Fetches live arrival times for a stop |

All requests use HTTPS. No API key is required.

---

## How it Works

On startup the module runs the following sequence before displaying anything:

1. **Resolve stop name** — calls `getStopNameAndXY` with the configured `stopCode` to get the display name. If `stopDescrEng` is set in config, this step is skipped.
2. **Build route map** — calls `webRoutesForStop` to load all routes serving the stop, including their `LineID`, `RouteDescrEng` and `RouteType`. This is cached and used to enrich arrival data.
3. **Fetch arrivals** — calls `getStopArrivals` and cross-references each `route_code` against the route map to get the line name and description. Results are filtered by `lineID` and/or `routeType` if configured, then sorted by arrival time ascending.
4. **Refresh** — repeats step 3 every `updateInterval` milliseconds. If the API times out or is temporarily unreachable, the last known arrivals remain on screen and the module retries on the next interval.

---

## Troubleshooting

**Module shows "No upcoming arrivals"**
- The stop may have no service at that time of day.
- Verify your `stopCode` is correct using the `getStopNameAndXY` endpoint.
- If `routeType` is set, try removing it to see all directions.

**Stop name shows the stop code number instead of a name**
- The `getStopNameAndXY` API call may have timed out on startup.
- Set `stopDescrEng` in config as a reliable fallback.

**Some lines are missing from arrivals**
- Check the MagicMirror logs for lines starting with `MMM-OASABus:`.
- The `route_code` in the arrivals response may not yet be in the route map. The module will attempt to resolve it automatically on the next refresh.

**"connect ETIMEDOUT" errors in logs**
- This is a temporary network issue with the OASA API server and is outside the module's control. The module handles this gracefully — the display is unchanged and it retries automatically.

---

## License

MIT
