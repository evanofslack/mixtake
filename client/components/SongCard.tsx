import React from "react";
import Image from "next/image";
import { Track } from "../interfaces/playlist";

type props = {
    track: Track;
};

export default function PlaylistCard({ track }: props): JSX.Element {
    return (
        <div className="m-4 flex h-max w-80 flex-col rounded-sm bg-white p-4 pb-2 drop-shadow-sm hover:drop-shadow-md">
            {track.album.images && (
                <Image
                    src={track.album.images[0].url}
                    width={track.album.images[0].width}
                    height={track.album.images[0].height}
                    alt={"playlist cover"}
                />
            )}
            <p className="pt-2">{track.name}</p>
        </div>
    );
}
