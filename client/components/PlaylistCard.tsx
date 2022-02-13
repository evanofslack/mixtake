import React from "react";
import Image from "next/image"
import { Playlist } from "../interfaces/playlist"

type cardProps = {
    playlist: Playlist
}

export default function PlaylistCard({ playlist }: cardProps): JSX.Element {

    return (
        <div className="w-80 h-max bg-white p-4 m-8 rounded-md">
            {playlist.images &&
                    <Image src={playlist.images[0].url} width={playlist.images[0].width} height={playlist.images[0].height} />}
            <p>{playlist.name}</p>

        </div>
    );
}