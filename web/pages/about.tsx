import { ReactNode } from "react";
import Layout from "../components/Layout";

export default function AboutPage() {
    return (
        <Layout title="about · mixtake">
            <article className="mx-auto max-w-2xl px-4 pt-12 sm:px-6">
                <h1 className="text-3xl font-semibold tracking-tight">About</h1>
                <p className="mt-3 font-serif text-xl leading-snug text-balance">
                    mixtake listens to the songs in a playlist, maps their mood, and finds a film
                    photograph that fits.
                </p>

                <Section title="How it works">
                    <ol className="list-decimal space-y-2 pl-5">
                        <li>
                            Spotify&apos;s public embed pages give us the playlist or album&apos;s
                            name, cover, tracks and a 30 second preview of each song. No login is
                            needed, which is why a playlist has to be public, or its tracks pasted.
                        </li>
                        <li>
                            Each preview is analysed with{" "}
                            <A href="https://essentia.upf.edu">Essentia</A> and its pretrained
                            models: tempo and key, and scores for how happy, sad, relaxed,
                            aggressive, danceable, acoustic and instrumental it sounds, plus its
                            likely genres.
                        </li>
                        <li>
                            Those scores become a position on the mood map (sad to happy, calm to
                            energetic) and a profile of the whole mix.
                        </li>
                        <li>
                            The profile, and your vibe if you gave one, become a few scene
                            descriptions that we search for in{" "}
                            <A href="https://analogdb.com">analogdb</A>, a collection of film
                            photographs, ranked by how well their colours fit the mood.
                        </li>
                    </ol>
                </Section>

                <Section title="Privacy">
                    <p>
                        There are no accounts. We store track ids, their titles and artists, the
                        analysed features, and the list of tracks in each mix, so a mix can be
                        opened again by its link and songs don&apos;t have to be analysed twice.
                        Audio previews are analysed and thrown away. Your cover&apos;s text and crop
                        live only in its share link.
                    </p>
                </Section>

                <Section title="Credits and licences">
                    <ul className="list-disc space-y-2 pl-5">
                        <li>
                            Audio analysis by <A href="https://essentia.upf.edu">Essentia</A>{" "}
                            (AGPL-3.0), from the Music Technology Group at Universitat Pompeu Fabra.
                            Its models are licensed{" "}
                            <A href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
                                CC BY-NC-SA 4.0
                            </A>
                            , so mixtake is non-commercial.
                        </li>
                        <li>
                            Photographs come from <A href="https://analogdb.com">analogdb</A> and
                            belong to their photographers; each cover credits and links to its
                            source.
                        </li>
                        <li>
                            mixtake isn&apos;t affiliated with or endorsed by Spotify. Song and
                            playlist names and artwork belong to their owners.
                        </li>
                        <li>
                            The code is on{" "}
                            <A href="https://github.com/evanofslack/mixtake">GitHub</A>.
                        </li>
                    </ul>
                </Section>
            </article>
        </Layout>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <div className="mt-3 leading-relaxed text-muted">{children}</div>
        </section>
    );
}

function A({ href, children }: { href: string; children: ReactNode }) {
    return (
        <a
            href={href}
            className="text-ink underline underline-offset-2 transition-opacity hover:opacity-60"
        >
            {children}
        </a>
    );
}
