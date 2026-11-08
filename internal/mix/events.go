package mix

// Server-sent event names for GET /api/mixes/{id}/events. Each event's data is JSON.
const (
	EventSnapshot = "snapshot" // Snapshot, always first
	EventTrack    = "track"    // TrackResult, when a track finishes or fails
	EventProgress = "progress" // Coverage
	EventProfile  = "profile"  // Profile, every ~10 tracks and at the end
	EventDone     = "done"     // Coverage, last event of a finished job
	EventError    = "error"    // ErrorEvent, last event of a failed job
)

// Event is one server-sent event.
type Event struct {
	Name string
	Data any
}

// ErrorEvent is the data of an error event.
type ErrorEvent struct {
	Message string `json:"message"`
}
