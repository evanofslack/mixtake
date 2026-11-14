import { useComputedColorScheme } from "@mantine/core";
import { useMounted } from "@mantine/hooks";

// whether the page is dark, but only after mounting: the static export is rendered light, so
// anything drawn from this (like mood colours) must match that on the first render
export function useDark(): boolean {
    const mounted = useMounted();
    const scheme = useComputedColorScheme("light", { getInitialValueInEffect: true });
    return mounted && scheme === "dark";
}
