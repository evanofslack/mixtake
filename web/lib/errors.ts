// a failed API call, carrying the server's message
export class RequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly retryAfter?: number,
    ) {
        super(message);
    }

    // private playlists can't be read through the embed, whatever status the server picks for it
    get isPrivate(): boolean {
        return this.status === 403 || /private/i.test(this.message);
    }
}
