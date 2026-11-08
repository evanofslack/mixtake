import { useCallback, useEffect, useRef, useState } from "react";

// the content width of an element, kept current with a ResizeObserver. a callback ref, so it
// measures whenever the element mounts, even if that is after the component's first render
export function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
    const [width, setWidth] = useState(0);
    const observer = useRef<ResizeObserver | null>(null);

    const ref = useCallback((el: T | null) => {
        observer.current?.disconnect();
        observer.current = null;
        if (!el) {
            return;
        }
        setWidth(el.getBoundingClientRect().width);
        observer.current = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        observer.current.observe(el);
    }, []);

    useEffect(() => () => observer.current?.disconnect(), []);

    return [ref, width];
}
