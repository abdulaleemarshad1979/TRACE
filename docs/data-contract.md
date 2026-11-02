# TRACE data contract

The supplied HTML and two APK archives were used as reverse-engineering references. Their Java source was not available. The rebuilt Route app writes the paths the dashboard already reads; the sample in `tests/fixtures/sample-data.json` is synthetic and does not access the previous Firebase project.

| RTDB path | Shape | Writer | Reader |
| --- | --- | --- | --- |
| `roles/{uid}` | `admin`, `monitor`, or `route` | Admin | Owner, admin |
| `assignments/{uid}` | `sd`, `ps`, `route`, `officer`, `mobile` | Admin | Owner, admin |
| `config/routes/{id}` | Route definition | Admin | Signed-in users |
| `config/stations/{id}` | Polling site and coordinates | Admin | Signed-in users |
| `config/settings` | Thresholds and election name | Admin | Signed-in users |
| `devices/{uid}` | Assigned unit metadata, app version | Owner after approved assignment; admin | Control room, owner |
| `live/{uid}` | `lat`, `lng`, GPS timestamp `t`, server contact time `up`, `gps`, `spd`, `hdg`, `acc`, `bat`, `sig`, `duty`, `sessionId` | Owner; admin | Control room, owner |
| `track/{uid}/{YYYYMMDD}/mobile/{GPS timestamp}` | `[lat, lng, accuracy metres, speed km/h]` | Owner | Control room |
| `events/{id}` | `type`, `uid`, original timestamp `t`, optional location and report fields | Owner creates; admin updates | Control room |
| `msg/{uid}` | `id`, `text`, `t`, optional `voice` | Admin | Owner, control room |
| `photos/{id}` | `uid`, `t`, base64 JPEG `img`, optional `note` | Owner creates | Control room |
| `voice/{id}` | base64 `a`, `mime`, `t`, `by`, optional `uid` | Owner creates or admin | Signed-in users |
| `incidents/{id}` | Incident lifecycle and dispatch data | Admin | Control room |
| `lock/{key}` | Existing route lock state | Admin | Signed-in users |

`track` retains the dashboard's nested date/batch format. The Route app uses a fixed `mobile` batch key and original GPS timestamps, making retries idempotent. SOS events use fixed generated IDs. The offline SQLite queue preserves event and point order; the latest `live` snapshot is coalesced while offline. A successful Firebase HTTP write is treated as server receipt; operator acknowledgement is stored separately on the event.

The current media format mirrors the supplied dashboard. Large deployments should move blobs to Cloud Storage and keep authorized metadata in RTDB before production use.
