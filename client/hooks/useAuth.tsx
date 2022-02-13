import { useState, useEffect } from 'react'


async function getAuth(): Promise<boolean> {

    let auth: boolean = false
    const response = await fetch("/api/current-user")
    if (response.status == 200) {
        auth = true
    }
    return auth
}

export default function useAuth() {

    const [isLoading, setLoading] = useState(true)
    const [isAuth, setAuth] = useState(false)

    useEffect(() => {

        getAuth().then((auth) => {
            setAuth(auth)
            setLoading(false)
        })
    })

    return {isLoading, isAuth}
}
