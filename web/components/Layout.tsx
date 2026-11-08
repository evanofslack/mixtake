import { ReactNode } from "react";
import Head from "next/head";
import Header from "./Header";
import Footer from "./Footer";

const SITE = "https://mixtake.evanslack.dev";
const DESCRIPTION =
    "Paste a Spotify playlist and get a film-photo cover that matches its mood, with a live analysis of every song.";

type Props = {
    children?: ReactNode;
    title?: string;
};

export default function Layout({ children, title = "mixtake" }: Props) {
    return (
        <>
            <Head>
                <title>{title}</title>
                <meta
                    name="viewport"
                    content="initial-scale=1.0, width=device-width, viewport-fit=cover"
                />
                <meta name="description" content={DESCRIPTION} />
                <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
                <meta property="og:type" content="website" />
                <meta property="og:url" content={SITE} />
                <meta property="og:title" content={title} />
                <meta property="og:description" content={DESCRIPTION} />
            </Head>
            <div className="flex min-h-screen flex-col">
                <Header />
                <main className="grow">{children}</main>
                <Footer />
            </div>
        </>
    );
}
