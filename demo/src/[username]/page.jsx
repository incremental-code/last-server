export default function Profile({ router, params: { username }, body }) {
    return <div>
        <h1>Profile for {username}</h1>
        <p>{body.greeting}</p>
        <p>{body.status}</p>
        <button onclick={() => router.push('/')}>Home</button>
    </div>;
}
