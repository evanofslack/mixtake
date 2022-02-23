import React from "react";
import Image from "next/image";
import { Playlist } from "../interfaces/playlist";
import Link from "next/link";

type cardProps = {
    playlist: Playlist;
};

export default function PlaylistCard({ playlist }: cardProps): JSX.Element {
    return (
        <Link href={"/playlist/" + playlist.id}>
            <div className="m-4 flex h-max w-80 flex-col rounded-sm bg-white p-4 pb-2 drop-shadow-sm hover:drop-shadow-md">
                {playlist.images && (
                    <Image
                        src={playlist.images[0].url}
                        width={playlist.images[0].width}
                        height={playlist.images[0].height}
                        alt={"playlist cover"}
                    />
                )}
                <p className="text-light-primary pt-2">{playlist.name}</p>
                <p className="text-light-secondary pt-2 text-xs">{playlist.description}</p>
            </div>
        </Link>
    );
}
