import { Html, Head, Main, NextScript } from "next/document";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";

export default function Document() {
    return (
        <Html lang="en" {...mantineHtmlProps}>
            <Head>
                <ColorSchemeScript defaultColorScheme="light" />
                {/* the front page's title is set in it, so fetch it before first paint */}
                <link
                    rel="preload"
                    href="/fonts/instrument-serif.woff2"
                    as="font"
                    type="font/woff2"
                    crossOrigin=""
                />
            </Head>
            <body className="m-0 p-0">
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
