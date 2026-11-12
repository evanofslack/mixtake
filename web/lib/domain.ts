// Axis ranges that fit the data, for charts of 0–1 scores.

export type Domain = [number, number];

export const FULL: Domain = [0, 1];

// The range of `values` with some padding, snapped outward to `step` and kept inside [0, 1]. A
// range narrower than `minSpan` is widened around its middle, so a tight cluster isn't blown up
// until noise looks like structure.
export function fitDomain(values: number[], pad = 0.06, minSpan = 0.3, step = 0.05): Domain {
    if (values.length === 0) {
        return FULL;
    }
    let lo = Math.min(...values) - pad;
    let hi = Math.max(...values) + pad;
    if (hi - lo < minSpan) {
        const mid = (lo + hi) / 2;
        lo = mid - minSpan / 2;
        hi = mid + minSpan / 2;
    }
    // slide back inside [0, 1] before clamping, so the span survives at the edges
    if (lo < 0) {
        hi -= lo;
        lo = 0;
    }
    if (hi > 1) {
        lo -= hi - 1;
        hi = 1;
    }
    lo = Math.max(0, Math.floor(round(lo / step)) * step);
    hi = Math.min(1, Math.ceil(round(hi / step)) * step);
    return [round(lo), round(hi)];
}

export function isFull(d: Domain): boolean {
    return d[0] <= 0 && d[1] >= 1;
}

// floating-point noise from the divisions above (0.15 / 0.05 = 2.9999…)
function round(v: number): number {
    return Math.round(v * 1e6) / 1e6;
}
