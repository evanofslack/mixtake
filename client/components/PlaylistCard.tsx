import React from "react";
import Image from "next/image"
import { Playlist } from "../interfaces/playlist"
import Link from 'next/link'


type cardProps = {
    playlist: Playlist
}

export default function PlaylistCard({ playlist }: cardProps): JSX.Element {

    return (
        <Link href={"/playlist/" + playlist.id}>
            <div className="w-80 h-max bg-white p-4 pb-2 m-4 rounded-sm flex flex-col drop-shadow-sm hover:drop-shadow-md">
                {playlist.images &&
                        <Image src={playlist.images[0].url} width={playlist.images[0].width} height={playlist.images[0].height} />}
                <p className="pt-2 text-light-primary">{playlist.name}</p>
                <p className="pt-2 text-xs text-light-secondary">{playlist.description}</p>

            </div>
        </Link>
    );
}