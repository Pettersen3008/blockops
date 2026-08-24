# Console invariants

These invariants were verified against `backend/internal/console/hub.go`, the
Console HTTP/WebSocket handlers, authorization middleware, and the frontend
stream lifecycle. A human must review changes to this lifecycle before merge.

- Every WebSocket frame starts as `unknown` and passes `consoleLineSchema`
  before entering React state. Non-string, malformed JSON, and schema-invalid
  frames never enter state or render.
- A mounted stream owns at most one active socket and one reconnect timer.
- Cleanup cancels the timer, detaches every socket callback, closes the active
  socket, reports `disconnected`, and prevents reconnect after unmount.
- Connection states and transitions stay explicit: `connecting`, `connected`,
  `reconnecting`, and `disconnected`.
- Reconnect backoff is exponential from 500 ms, resets after open, and caps at
  10 seconds.
- A socket error only closes that socket. Its close callback solely owns
  reconnect scheduling, and may schedule no more than one timer.
- Live and merged lines retain the latest 2,000. HTTP history retains at most
  the server/schema limit of 1,000. Merge overlap deduplicates by sequence,
  live data wins an overlap, and output order is ascending sequence.
- Pause snapshots the visible merged stream while live ingestion remains
  bounded. Resume reveals accumulated live data.
- Auto-scroll happens only while live. It scrolls the log without moving focus
  and never defeats a paused snapshot.
