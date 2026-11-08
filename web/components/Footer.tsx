export default function Footer() {
    return (
        <footer className="mt-24 text-sm text-muted">
            <div className="mx-auto flex max-w-6xl flex-row flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6">
                <p>
                    photos from{" "}
                    <a
                        href="https://analogdb.com"
                        className="underline underline-offset-2 transition-opacity hover:opacity-60"
                    >
                        analogdb
                    </a>
                    , audio analysis by{" "}
                    <a
                        href="https://essentia.upf.edu"
                        className="underline underline-offset-2 transition-opacity hover:opacity-60"
                    >
                        essentia
                    </a>
                </p>
                <p>not affiliated with Spotify</p>
            </div>
        </footer>
    );
}
