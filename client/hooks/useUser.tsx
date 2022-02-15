import { useState, useEffect } from 'react'
import { User } from "../interfaces/user"


async function getUser(): Promise<User | null> {

    let user = null
    const response = await fetch("/api/current-user")
    if (response.status != 200) {
        user = null
    } else {
        user = response.json()
    }
    return user
}


export default function useUser() {

    const [isLoading, setLoading] = useState(true)
    const [user, setUser] = useState<User | null>(null)

    useEffect(() => {

        getUser().then((user) => {
            setUser(user)
            setLoading(false)
        })
    }, [])

    return {isLoading, user}
}
