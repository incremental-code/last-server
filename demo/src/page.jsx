import { Signal } from 'signal-polyfill';

export default function Home({ router, body }) {
    const input = new Signal.State('alice');
    const go = () => {
        const name = input.get().trim();
        if (name) router.push('/' + encodeURIComponent(name));
    };

    return <div>
        <h1>{body.title}</h1>
        <p>{body.intro}</p>
        <input
            value={input.get()}
            placeholder="username"
            oninput={e => input.set(e.target.value)}
            onkeydown={e => { if (e.key === 'Enter') go(); }}
        />
        <button onclick={go}>View profile</button>
    </div>;
}
