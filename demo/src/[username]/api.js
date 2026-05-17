export default async function* ({ params }) {
    yield { greeting: `Hello, ${params.username}!`, status: 'loading...' };
    await new Promise(r => setTimeout(r, 300));
    yield { status: 'ready' };
}
