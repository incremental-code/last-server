import test from 'node:test';
import assert from 'node:assert/strict';
import { formatListeningMessage } from '../index.js';

test('formatListeningMessage includes the explicit port', () => {
    assert.equal(
        formatListeningMessage('http://localhost:4180'),
        'last-server: listening on http://localhost:4180 (port 4180)',
    );
});

test('formatListeningMessage falls back when the URL has no port', () => {
    assert.equal(
        formatListeningMessage('not-a-url'),
        'last-server: listening on not-a-url',
    );
});
