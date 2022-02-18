import React from "react";

export default function LoginButton() {
    async function getRedirect() {
        await fetch("/api/login").then((response) =>
            response.json().then((data) => {
                console.log(data);
                window.location.href = data.url;
            })
        );
    }
    return (
        <button
            className="bg-spotify-green rounded-md p-2 px-8 font-medium text-white"
            onClick={() => getRedirect()}
        >
            CONNECT WITH SPOTIFY
        </button>
    );
}
