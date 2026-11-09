import type { ApiError } from "./api";
import { RequestError } from "./errors";
import { mockCreateMix } from "./mock";

// mock mode replaces the backend with a fake event stream: ?mock=1, or NEXT_PUBLIC_MOCK=1
export function isMockMode(query?: Record<string, unknown>): boolean {
    if (process.env.NEXT_PUBLIC_MOCK === "1") {
        return true;
    }
    if (query) {
        return query.mock === "1";
    }
    if (typeof window === "undefined") {
        return false;
    }
    return new URLSearchParams(window.location.search).get("mock") === "1";
}

export async function createMix(input: string, vibe: string, mock: boolean): Promise<string> {
    if (mock) {
        return mockCreateMix(input, vibe);
    }
    let res: Response;
    try {
        res = await fetch("/api/mixes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(vibe ? { input, vibe } : { input }),
        });
    } catch {
        throw new RequestError("Couldn't reach mixtake. Check your connection and try again.", 0);
    }
    if (res.ok) {
        const body = (await res.json()) as { id: string };
        return body.id;
    }
    throw await toError(res);
}

async function toError(res: Response): Promise<RequestError> {
    let message = "";
    try {
        message = ((await res.json()) as ApiError).error ?? "";
    } catch {
        // not json: a proxy error page, or the API isn't running
    }
    const retry = Number(res.headers.get("Retry-After"));
    const retryAfter = Number.isFinite(retry) && retry > 0 ? retry : undefined;
    if (!message) {
        message =
            res.status === 429
                ? "Too many mixes at once."
                : res.status === 503
                  ? "mixtake is busy right now."
                  : res.status >= 500
                    ? "Something went wrong on our side."
                    : "That didn't work.";
    }
    return new RequestError(message, res.status, retryAfter);
}
