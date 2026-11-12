import {
    createTheme,
    CSSVariablesResolver,
    defaultVariantColorsResolver,
    InputWrapper,
    MantineColorsTuple,
    VariantColorsResolver,
} from "@mantine/core";

// near-white to near-black; buttons use the darkest shade in light mode and the
// lightest in dark mode, so the primary colour is always the page's ink
const ink: MantineColorsTuple = [
    "#ece8e1",
    "#d6d1c9",
    "#b8b2a9",
    "#948d84",
    "#6b6f76",
    "#4b4741",
    "#33302c",
    "#24221f",
    "#1b1a18",
    "#16181d",
];

// mantine's dark surfaces, lifted to a dim warm grey so emboss has room for a highlight
// (mantine uses 7 for the body, 6 for inputs and default buttons, 4 for borders)
const dark: MantineColorsTuple = [
    "#efebe5",
    "#d6d1c9",
    "#b2aba1",
    "#948d84",
    "#5e5953",
    "#4c4844",
    "#3b3835",
    "#3b3835",
    "#34312e",
    "#2b2926",
];

// film amber, for the few things that should stand out (progress, the mood map's mean)
const amber: MantineColorsTuple = [
    "#fdf4e7",
    "#f7e3c4",
    "#efcb92",
    "#e7b25e",
    "#e0a458",
    "#d18e35",
    "#b86e1f",
    "#94561a",
    "#733f15",
    "#4f2b0e",
];

// filled ink flips between dark and light with the scheme, so its text has to as well
const variantColorResolver: VariantColorsResolver = (input) => {
    const colors = defaultVariantColorsResolver(input);
    const color = input.color ?? input.theme.primaryColor;
    if (input.variant === "filled" && color === "ink") {
        return { ...colors, color: "var(--mantine-primary-color-contrast)" };
    }
    return colors;
};

export const theme = createTheme({
    variantColorResolver,
    colors: { ink, dark, amber },
    primaryColor: "ink",
    primaryShade: { light: 9, dark: 0 },
    autoContrast: true,
    fontFamily:
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
    fontFamilyMonospace:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    headings: { fontWeight: "650" },
    defaultRadius: "md",
    radius: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "20px" },
    cursorType: "pointer",
    components: {
        InputWrapper: InputWrapper.extend({ styles: { label: { fontWeight: 500 } } }),
    },
});

// the page background is paper or a dim grey room rather than mantine's white or black
export const cssVariablesResolver: CSSVariablesResolver = () => ({
    variables: {},
    light: { "--mantine-color-body": "#ebe8e2", "--mantine-primary-color-contrast": "#ffffff" },
    dark: { "--mantine-color-body": "#3b3835", "--mantine-primary-color-contrast": "#24221f" },
});
