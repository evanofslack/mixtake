import { User } from "../interfaces/user"
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function useUser() {

    let user: User | null = null

    const { data, error } = useSWR('/api/current-user', fetcher)
    if (!error) {
        user = data
    }
    return {
        user: user,
        isLoading: !error && !data,
        error: error
    }
}