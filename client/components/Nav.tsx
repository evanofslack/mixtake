import { RiNeteaseCloudMusicLine } from "react-icons/ri";

export default function Nav() {
    return (
        <nav className="flex flex-row text-light-primary p-2 text-lg font-medium justify-between">
            <div className="flex flex-row">
                <RiNeteaseCloudMusicLine size="1.6rem" />
                &nbsp;mixtake
            </div>
            
            <div>Login</div>

        </nav>
    )
}