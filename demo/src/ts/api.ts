export function greet(name: string): string {
    return `Hello, ${name}!`;
}

export default function (): { who: string } {
    return { who: 'typescript' };
}
