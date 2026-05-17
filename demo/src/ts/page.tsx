import { greet } from './api.js';

type Props = { body: { who: string } };

export default function TsPage({ body }: Props) {
    const message: string = greet(body.who);
    return <div>
        <h1>{message}</h1>
        <p>typed page rendered via tsx</p>
    </div>;
}
