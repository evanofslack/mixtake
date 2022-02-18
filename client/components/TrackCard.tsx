import React from "react";
import Image from "next/image";
import { Track } from "../interfaces/playlist";

type props = {
    track: Track;
};

export default function TrackCard({ track }: props): JSX.Element {
    return (
        <div className="m-1 flex h-max w-full flex-row items-center justify-start rounded-sm drop-shadow-sm hover:bg-gray-100">
            {track.album.images && (
                <div className="h-16 w-16">
                    <Image
                        src={track.album.images[0].url}
                        width={track.album.images[0].width}
                        height={track.album.images[0].height}
                        alt={"album cover"}
                    />
                </div>
            )}
            <div className="mx-2 flex flex-col items-start justify-center">
                <p className="text-light-primary">{track.name}</p>
                <p className="text-light-secondary text-sm">
                    {track.artists && track.artists[0].name}
                </p>
            </div>
        </div>
    );
}
