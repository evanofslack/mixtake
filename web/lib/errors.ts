// a failed API call, carrying the server's message
export class RequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly retryAfter?: number,
    ) {
        super(message);
    }

    // spotify serves the same page for private and missing playlists, so the server answers 404
    // for both (its message already explains pasting tracks); 403 is only an explicit refusal
    get isPrivate(): boolean {
        return this.status === 403;
    }
}
