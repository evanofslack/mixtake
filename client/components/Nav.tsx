import Image from "next/image";
import { RiNeteaseCloudMusicLine } from "react-icons/ri";
import { BiLogOut } from "react-icons/bi";
import useUser from "../hooks/useUser";

export default function Nav() {
    const { user, isLoading, error } = useUser();

    async function logout() {
        fetch("/api/logout")
            .then((res) => res.json)
            .then(() => {
                window.location.href = "http://localhost:3000/";
            });
    }

    async function login() {
        await fetch("/api/login").then((response) =>
            response.json().then((data) => {
                window.location.href = data.url;
            })
        );
    }

    return (
        <nav className="text-light-primary flex flex-row justify-between p-2 text-lg font-medium">
            <div className="flex flex-row">
                <RiNeteaseCloudMusicLine size="1.6rem" />
                &nbsp;mixtake
            </div>

            {isLoading && !user && <div>Loading</div>}

            {!isLoading && !user && <div onClick={login}>Login</div>}

            {!isLoading && user && (
                <div className="flex flex-row items-center">
                    Hi {user.display_name.split(" ")[0]}
                    {/* <div className="w-16 h-16">
                        {user.images &&
                            <Image src={user.images[0].url} width={user.images[0].width} height={user.images[0].height} layout="responsive"/>
                        }
                    </div> */}
                    &nbsp;
                    <BiLogOut size="1.4rem" onClick={logout} />
                </div>
            )}
        </nav>
    );
}
