import { describe, expect, it } from 'vitest';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRbacAuthorizer, loadRbacAuthorizerFromFiles } from '../../src/mcp/rbac';

function createScryptHash(secret: string): string {
    const n = 16384;
    const r = 8;
    const p = 1;
    const salt = randomBytes(16);
    const derived = scryptSync(secret, salt, 32, { N: n, r, p });
    return `scrypt$${n}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

function createHeaders(input: Record<string, string>): Headers {
    return new Headers(input);
}

describe('rbac authorizer', () => {
    const adminSecret = 'admin-secret';
    const editorSecret = 'editor-secret';
    const authorizer = createRbacAuthorizer({
        users: [
            { user_id: 'admin-user', roles: ['admin', 'editor'], enabled: true },
            { user_id: 'editor-user', roles: ['editor'], enabled: true },
        ],
        keys: [
            { key_id: 'k-admin', user_id: 'admin-user', secret_hash: createScryptHash(adminSecret), enabled: true },
            { key_id: 'k-editor', user_id: 'editor-user', secret_hash: createScryptHash(editorSecret), enabled: true },
        ],
        policy: [
            { path: '/health', methods: ['GET'], public: true, any_roles: [] },
            { path: '/auth/whoami', methods: ['GET'], public: false, any_roles: ['*'] },
            { path: '/admin/ping', methods: ['GET'], public: false, any_roles: ['admin'] },
        ],
    });

    it('allows public route without authentication', () => {
        const decision = authorizer.resolveRoute('GET', '/health');
        const result = authorizer.authorize(decision, null);
        expect(decision.isPublic).toBe(true);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe('public_route');
    });

    it('authenticates Bearer and allows any-role routes', () => {
        const auth = authorizer.authenticate(createHeaders({ Authorization: `Bearer ${editorSecret}` }));
        expect(auth.ok).toBe(true);
        if (!auth.ok) return;
        const decision = authorizer.resolveRoute('GET', '/auth/whoami');
        const result = authorizer.authorize(decision, auth.context);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe('auth_any_role');
    });

    it('authenticates X-API-Key and enforces admin role', () => {
        const auth = authorizer.authenticate(createHeaders({ 'X-API-Key': adminSecret }));
        expect(auth.ok).toBe(true);
        if (!auth.ok) return;
        const decision = authorizer.resolveRoute('GET', '/admin/ping');
        const result = authorizer.authorize(decision, auth.context);
        expect(result.allowed).toBe(true);
    });

    it('denies invalid key and returns missing key reason', () => {
        const missing = authorizer.authenticate(createHeaders({}));
        expect(missing.ok).toBe(false);
        if (missing.ok) return;
        expect(missing.reason).toBe('missing_key');

        const invalid = authorizer.authenticate(createHeaders({ Authorization: 'Bearer nope' }));
        expect(invalid.ok).toBe(false);
        if (invalid.ok) return;
        expect(invalid.reason).toBe('invalid_key');
    });

    it('defaults to deny when policy does not match', () => {
        const auth = authorizer.authenticate(createHeaders({ 'X-API-Key': adminSecret }));
        expect(auth.ok).toBe(true);
        if (!auth.ok) return;
        const decision = authorizer.resolveRoute('GET', '/not-defined');
        const result = authorizer.authorize(decision, auth.context);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('no_policy_match');
    });

    it('denies non-admin access to admin endpoint', () => {
        const auth = authorizer.authenticate(createHeaders({ Authorization: `Bearer ${editorSecret}` }));
        expect(auth.ok).toBe(true);
        if (!auth.ok) return;
        const decision = authorizer.resolveRoute('GET', '/admin/ping');
        const result = authorizer.authorize(decision, auth.context);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('auth_role_denied');
    });

    it('handles disabled and expired keys', () => {
        const expiredAuthorizer = createRbacAuthorizer({
            users: [
                { user_id: 'admin-user', roles: ['admin'], enabled: true },
            ],
            keys: [
                {
                    key_id: 'expired',
                    user_id: 'admin-user',
                    secret_hash: createScryptHash('expired'),
                    enabled: true,
                    expires_at: '2000-01-01T00:00:00.000Z',
                },
                {
                    key_id: 'disabled',
                    user_id: 'admin-user',
                    secret_hash: createScryptHash('disabled'),
                    enabled: false,
                },
            ],
        });

        const expired = expiredAuthorizer.authenticate(createHeaders({ 'X-API-Key': 'expired' }));
        expect(expired.ok).toBe(false);
        if (!expired.ok) expect(expired.reason).toBe('expired_key');

        const disabled = expiredAuthorizer.authenticate(createHeaders({ 'X-API-Key': 'disabled' }));
        expect(disabled.ok).toBe(false);
        if (!disabled.ok) expect(disabled.reason).toBe('disabled_key');
    });

    it('denies disabled users', () => {
        const disabledUserAuthorizer = createRbacAuthorizer({
            users: [
                { user_id: 'u1', roles: ['editor'], enabled: false },
            ],
            keys: [
                {
                    key_id: 'k1',
                    user_id: 'u1',
                    secret_hash: createScryptHash('k1-secret'),
                    enabled: true,
                },
            ],
        });
        const result = disabledUserAuthorizer.authenticate(createHeaders({ Authorization: 'Bearer k1-secret' }));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('disabled_user');
    });

    it('validates cross references and hash format', () => {
        expect(() => createRbacAuthorizer({
            users: [{ user_id: 'u1', roles: ['editor'], enabled: true }],
            keys: [{
                key_id: 'k1',
                user_id: 'missing-user',
                secret_hash: createScryptHash('abc'),
                enabled: true,
            }],
        })).toThrow('references unknown user_id');

        expect(() => createRbacAuthorizer({
            users: [{ user_id: 'u1', roles: ['editor'], enabled: true }],
            keys: [{
                key_id: 'k1',
                user_id: 'u1',
                secret_hash: 'invalid-hash',
                enabled: true,
            }],
        })).toThrow('Unsupported key hash format');
    });

    it('supports wildcard path matching rules', () => {
        const wildcardAuthorizer = createRbacAuthorizer({
            users: [{ user_id: 'u1', roles: ['editor'], enabled: true }],
            keys: [{
                key_id: 'k1',
                user_id: 'u1',
                secret_hash: createScryptHash('secret'),
                enabled: true,
            }],
            policy: [
                { path: '/health', methods: ['GET'], public: true, any_roles: [] },
                { path: '/audio/*', methods: ['GET'], public: false, any_roles: ['editor'] },
            ],
        });
        const auth = wildcardAuthorizer.authenticate(createHeaders({ 'X-API-Key': 'secret' }));
        expect(auth.ok).toBe(true);
        if (!auth.ok) return;
        const decision = wildcardAuthorizer.resolveRoute('GET', '/audio/123');
        const result = wildcardAuthorizer.authorize(decision, auth.context);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe('auth_role_match');
    });
});

describe('rbac file loading', () => {
    it('loads yaml/json users keys and policy', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'rbac-load-'));
        try {
            const usersPath = join(dir, 'users.yaml');
            const keysPath = join(dir, 'keys.json');
            const policyPath = join(dir, 'policy.yaml');
            const secret = 'file-secret';
            const hash = createScryptHash(secret);

            await writeFile(usersPath, [
                'users:',
                '  - user_id: file-user',
                '    roles: [editor]',
                '    enabled: true',
                '',
            ].join('\n'));
            await writeFile(keysPath, JSON.stringify({
                keys: [
                    {
                        key_id: 'file-key',
                        user_id: 'file-user',
                        secret_hash: hash,
                        enabled: true,
                    },
                ],
            }, null, 2));
            await writeFile(policyPath, [
                'policy:',
                '  - path: /health',
                '    methods: [GET]',
                '    public: true',
                '  - path: /auth/whoami',
                '    methods: [GET]',
                '    any_roles: ["*"]',
                '',
            ].join('\n'));

            const authorizer = await loadRbacAuthorizerFromFiles({ usersPath, keysPath, policyPath });
            const auth = authorizer.authenticate(new Headers({ Authorization: `Bearer ${secret}` }));
            expect(auth.ok).toBe(true);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('fails on invalid document shape', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'rbac-invalid-'));
        try {
            const usersPath = join(dir, 'users.yaml');
            const keysPath = join(dir, 'keys.yaml');

            await writeFile(usersPath, 'users: {}\n');
            await writeFile(keysPath, 'keys: []\n');

            await expect(loadRbacAuthorizerFromFiles({ usersPath, keysPath }))
                .rejects.toThrow('users array');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
