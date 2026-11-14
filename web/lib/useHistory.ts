import { useCallback, useEffect, useRef, useState } from "react";

// how many undo steps are kept
const LIMIT = 100;
// edits closer together than this are one step, so a slider drag or a typed word undoes at once
const COALESCE_MS = 600;

type Stacks<T> = { past: T[]; present: T; future: T[]; at: number };

// a value with undo and redo. `set` records a step; `replace` changes the value without one
// (for corrections the person didn't make, like resetting the crop for a new photo).
export function useHistory<T>(initial: T) {
    const [s, setS] = useState<Stacks<T>>({ past: [], present: initial, future: [], at: 0 });

    const set = useCallback((fn: (v: T) => T) => {
        setS((h) => {
            const next = fn(h.present);
            if (Object.is(next, h.present)) {
                return h;
            }
            const now = Date.now();
            const merge = now - h.at < COALESCE_MS && h.past.length > 0;
            return {
                past: merge ? h.past : [...h.past, h.present].slice(-LIMIT),
                present: next,
                future: [],
                at: now,
            };
        });
    }, []);

    const replace = useCallback((fn: (v: T) => T) => {
        setS((h) => ({ ...h, present: fn(h.present) }));
    }, []);

    const undo = useCallback(() => {
        setS((h) =>
            h.past.length === 0
                ? h
                : {
                      past: h.past.slice(0, -1),
                      present: h.past[h.past.length - 1],
                      future: [h.present, ...h.future],
                      at: 0,
                  },
        );
    }, []);

    const redo = useCallback(() => {
        setS((h) =>
            h.future.length === 0
                ? h
                : {
                      past: [...h.past, h.present],
                      present: h.future[0],
                      future: h.future.slice(1),
                      at: 0,
                  },
        );
    }, []);

    return {
        value: s.present,
        set,
        replace,
        undo,
        redo,
        canUndo: s.past.length > 0,
        canRedo: s.future.length > 0,
    };
}

// ⌘Z / ctrl+Z undoes and ⇧⌘Z / ctrl+Y redoes, except while typing, where the field's own undo wins
export function useUndoKeys(undo: () => void, redo: () => void): void {
    const ref = useRef({ undo, redo });
    ref.current = { undo, redo };
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey) || e.altKey) {
                return;
            }
            const t = e.target as HTMLElement | null;
            if (t && (t.isContentEditable || typing(t))) {
                return;
            }
            const key = e.key.toLowerCase();
            if (key === "z" && !e.shiftKey) {
                ref.current.undo();
            } else if ((key === "z" && e.shiftKey) || key === "y") {
                ref.current.redo();
            } else {
                return;
            }
            e.preventDefault();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
}

function typing(el: HTMLElement): boolean {
    if (el.tagName === "TEXTAREA") {
        return true;
    }
    return (
        el instanceof HTMLInputElement &&
        !["radio", "checkbox", "range", "button", "submit", "color"].includes(el.type)
    );
}
