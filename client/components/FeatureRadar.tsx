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
            <div className=" h-96 w-96">
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
                            features: "Instrumental",
                            playlist: features.instrumentalness,
                        },
                    ]}
                    keys={["playlist"]}
                    indexBy="features"
                    valueFormat=">-.2f"
                    margin={{ top: 70, right: 100, bottom: 40, left: 100 }}
                    borderColor={{ from: "color" }}
                    gridLabelOffset={36}
                    dotSize={10}
                    dotColor={{ theme: "background" }}
                    dotBorderWidth={2}
                    colors={{ scheme: "nivo" }}
                    blendMode="multiply"
                    motionConfig="wobbly"
                    // legends={[
                    //     {
                    //         anchor: "top-left",
                    //         direction: "column",
                    //         translateX: -50,
                    //         translateY: -40,
                    //         itemWidth: 80,
                    //         itemHeight: 20,
                    //         itemTextColor: "#999",
                    //         symbolSize: 12,
                    //         symbolShape: "circle",
                    //         effects: [
                    //             {
                    //                 on: "hover",
                    //                 style: {
                    //                     itemTextColor: "#000",
                    //                 },
                    //             },
                    //         ],
                    //     },
                    // ]}
                />
            </div>
        </div>
    );
}
