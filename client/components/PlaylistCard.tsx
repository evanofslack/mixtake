import React from "react";
import Image from "next/image"
import { Playlist } from "../interfaces/spotify"

export default function PlaylistCard(props: Playlist) {
    return (
        <div>
            <Image src={props.image_url}></Image>
            <p>{props.name}</p>
        </div>
    );
}