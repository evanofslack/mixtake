import usePlaylistFeatures from "../hooks/usePlaylistFeatures";
import { ResponsiveRadar } from "@nivo/radar";

type radarProps = {
    id: string;
};

export default function FeatureRadar({ id }: radarProps): JSX.Element {
    const { features, loading, error } = usePlaylistFeatures(id);

    if (loading) return <div>Loading</div>;

    if (error) return <div>An error has occurred</div>;

    return (
        <div>
            {/* <div className="text-light-primary px-8 py-4">
                <p>Acousticness: {features.acousticness}</p>
                <p>Danceability: {features.danceability}</p>
                <p>Energy: {features.energy}</p>
                <p>Valence: {features.valence}</p>
                <p>Instrumentalness: {features.instrumentalness}</p>
                <p>Liveness: {features.liveness}</p>
                <p>Loudness: {features.loudness}</p>
                <p>Speechiness: {features.speechiness}</p>
                <p>Key: {features.key}</p>
                <p>Mode: {features.mode}</p>
                <p>Duration: {features.duration_ms}</p>
                <p>Time Signature: {features.time_signature}</p>
                <p>Tempo: {features.tempo}</p>
            </div> */}
            <div className=" h-[29rem] w-[29rem] rounded-[2rem]">
                <ResponsiveRadar
                    data={[
                        {
                            features: "Acousticness",
                            playlist: features.acousticness,
                        },
                        {
                            features: "Danceability",
                            playlist: features.danceability,
                        },
                        {
                            features: "Energy",
                            playlist: features.energy,
                        },
                        {
                            features: "Valence",
                            playlist: features.valence,
                        },
                        {
                            features: "Speechiness",
                            playlist: features.speechiness,
                        },
                    ]}
                    keys={["playlist"]}
                    indexBy="features"
                    valueFormat=">-.2f"
                    margin={{ top: 0, right: 120, bottom: 0, left: 120 }}
                    borderColor={{ from: "color" }}
                    gridLabelOffset={36}
                    dotSize={10}
                    dotColor={{ theme: "background" }}
                    dotBorderWidth={2}
                    colors={{ scheme: "dark2" }}
                    blendMode="multiply"
                    motionConfig="wobbly"
                    borderWidth={3}
                    fillOpacity={0.4}
                    gridShape="linear"
                    gridLevels={3}
                    theme={{ textColor: "#344459", fontSize: 14 }}
                />
            </div>
        </div>
    );
}
