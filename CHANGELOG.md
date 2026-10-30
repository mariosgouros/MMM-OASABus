# Changelog

All notable changes to this project are documented in this file.

## [1.1.0]

### Added

- `package.json` with module metadata.
- `CHANGELOG.md`.
- "Update" section in the README.

### Changed

- `node_helper.js` now imports the scoped `node:https` module.
- Removed unused variables flagged by ESLint (`cfg` in `buildRouteMap`, unused `catch` binding).
- README config example now ends with a trailing comma so it can be pasted into `config.js` as-is.

## [1.0.0]

### Added

- Live bus and trolleybus arrivals from the OASA Telematics API for any stop, configured by `stopCode`.
- Automatic stop name lookup (`getStopNameAndXY`), overridable with `stopDescrEng`.
- Filtering by `lineID` and `routeType` (direction), or all arrivals at the stop.
- Automatic bus (blue badge) vs trolleybus (amber badge, lines 1–16) detection.
- `full` and `compact` display modes (`displayMode`).
- Native MagicMirror `header` support, defaulting to "OASA TELEMATICS".
- 10 second request timeout; on API failure the last known arrivals stay on screen and the module retries on the next interval.
