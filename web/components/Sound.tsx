import type { Profile, TrackResult } from "../lib/api";
import GenreBars from "./GenreBars";
import Panel from "./Panel";
import TopArtists from "./TopArtists";

type Props = {
    profile?: Profile;
    tracks: TrackResult[];
};

// what the mix is made of: its genres and who appears most, in one panel
export default function Sound({ profile, tracks }: Props) {
    return (
        <Panel
            title="Genres and artists"
            info="Genres from the Essentia Discogs model"
            className="lg:col-span-5"
        >
            <h3 className="mb-1.5 text-[10px] font-medium tracking-wider text-muted uppercase">
                Genres
            </h3>
            <GenreBars genres={profile?.genres} tracks={tracks} />
            <h3 className="mt-5 mb-1.5 border-t border-line pt-4 text-[10px] font-medium tracking-wider text-muted uppercase">
                Artists
            </h3>
            <TopArtists artists={profile?.artists} tracks={tracks} />
        </Panel>
    );
}
