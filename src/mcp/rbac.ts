import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import YAML from 'js-yaml';

export interface RbacUser {
    user_id: string;
    roles: string[];
    enabled: boolean;
}

export interface RbacKey {
    key_id: string;
    user_id: string;
    secret_hash: string;
    enabled: boolean;
    expires_at?: string;
    allowed_projects?: string[];
}

export interface RbacPolicyRule {
    path: string;
    methods: string[];
    public: boolean;
    any_roles: string[];
}

export interface AuthContext {
    user_id: string;
    roles: string[];
    key_id: string;
    allowed_projects?: string[];
}

export interface RouteDecision {
    matchedRule: RbacPolicyRule | null;
    requiresAuthentication: boolean;
    isPublic: boolean;
}

export interface AuthenticationFailure {
    ok: false;
    reason:
        | 'missing_key'
        | 'invalid_key'
        | 'disabled_key'
        | 'expired_key'
        | 'missing_user'
        | 'disabled_user';
}

export interface AuthenticationSuccess {
    ok: true;
    context: AuthContext;
}

export type AuthenticationResult = AuthenticationFailure | AuthenticationSuccess;

export interface AuthorizationResult {
    allowed: boolean;
    reason: 'public_route' | 'auth_any_role' | 'auth_role_match' | 'auth_role_denied' | 'no_policy_match';
}

export interface RbacAuthorizer {
    authenticate(headers: Headers): AuthenticationResult;
    resolveRoute(method: string, pathname: string): RouteDecision;
    authorize(decision: RouteDecision, auth: AuthContext | null): AuthorizationResult;
}

export interface RbacLoadOptions {
    usersPath: string;
    keysPath: string;
    policyPath?: string;
}

interface UsersDocument {
    users?: unknown;
}

interface KeysDocument {
    keys?: unknown;
}

interface PolicyDocument {
    policy?: unknown;
    rules?: unknown;
}

const DEFAULT_POLICY_RULES: RbacPolicyRule[] = [
    { path: '/health', methods: ['GET'], public: true, any_roles: [] },
    { path: '/auth/whoami', methods: ['GET'], public: false, any_roles: ['*'] },
    { path: '/admin/ping', methods: ['GET'], public: false, any_roles: ['admin'] },
    { path: '/mcp', methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], public: false, any_roles: ['*'] },
    { path: '/audio/*', methods: ['GET', 'POST', 'OPTIONS'], public: false, any_roles: ['*'] },
];

function asObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBooleanWithDefault(value: unknown, defaultValue: boolean): boolean {
    if (typeof value === 'boolean') return value;
    return defaultValue;
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => (entry as string).trim())
        .filter(Boolean);
}

function decodeDocument(raw: string, sourcePath: string): unknown {
    const extension = extname(sourcePath).toLowerCase();
    if (extension === '.json') {
        return JSON.parse(raw);
    }
    return YAML.load(raw);
}

async function loadDocument(sourcePath: string): Promise<unknown> {
    const raw = await readFile(sourcePath, 'utf8');
    return decodeDocument(raw, sourcePath);
}

function parseUsers(value: unknown): RbacUser[] {
    const document = asObject(value);
    const source = document ? (document as UsersDocument).users : value;
    if (!Array.isArray(source)) {
        throw new Error('RBAC users file must contain a users array');
    }
    return source.map((entry, index) => {
        const obj = asObject(entry);
        if (!obj) {
            throw new Error(`RBAC users entry at index ${index} must be an object`);
        }
        const userId = asString(obj.user_id);
        if (!userId) {
            throw new Error(`RBAC users entry at index ${index} is missing user_id`);
        }
        const roles = asStringArray(obj.roles);
        if (roles.length === 0) {
            throw new Error(`RBAC user "${userId}" must define at least one role`);
        }
        return {
            user_id: userId,
            roles,
            enabled: asBooleanWithDefault(obj.enabled, true),
        };
    });
}

function parseKeys(value: unknown): RbacKey[] {
    const document = asObject(value);
    const source = document ? (document as KeysDocument).keys : value;
    if (!Array.isArray(source)) {
        throw new Error('RBAC keys file must contain a keys array');
    }
    return source.map((entry, index) => {
        const obj = asObject(entry);
        if (!obj) {
            throw new Error(`RBAC keys entry at index ${index} must be an object`);
        }
        const keyId = asString(obj.key_id);
        const userId = asString(obj.user_id);
        const secretHash = asString(obj.secret_hash);
        if (!keyId) throw new Error(`RBAC keys entry at index ${index} is missing key_id`);
        if (!userId) throw new Error(`RBAC key "${keyId}" is missing user_id`);
        if (!secretHash) throw new Error(`RBAC key "${keyId}" is missing secret_hash`);
        return {
            key_id: keyId,
            user_id: userId,
            secret_hash: secretHash,
            enabled: asBooleanWithDefault(obj.enabled, true),
            expires_at: asString(obj.expires_at) ?? undefined,
            allowed_projects: asStringArray(obj.allowed_projects),
        };
    });
}

function parsePolicy(value: unknown): RbacPolicyRule[] {
    if (value === undefined || value === null) {
        return [...DEFAULT_POLICY_RULES];
    }

    const document = asObject(value);
    const source = document
        ? (document as PolicyDocument).policy ?? (document as PolicyDocument).rules
        : value;
    if (!Array.isArray(source)) {
        throw new Error('RBAC policy file must contain a policy array');
    }
    const rules = source.map((entry, index) => {
        const obj = asObject(entry);
        if (!obj) {
            throw new Error(`RBAC policy entry at index ${index} must be an object`);
        }
        const path = asString(obj.path);
        if (!path) {
            throw new Error(`RBAC policy entry at index ${index} is missing path`);
        }
        const methods = asStringArray(obj.methods).map((method) => method.toUpperCase());
        const anyRoles = asStringArray(obj.any_roles);
        return {
            path,
            methods: methods.length > 0 ? methods : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            public: asBooleanWithDefault(obj.public, false),
            any_roles: anyRoles,
        };
    });

    const hasHealthRule = rules.some((rule) => rule.path === '/health' && rule.public);
    if (!hasHealthRule) {
        rules.unshift({ path: '/health', methods: ['GET'], public: true, any_roles: [] });
    }
    return rules;
}

function parseScryptHash(encoded: string): { n: number; r: number; p: number; salt: Buffer; derivedKey: Buffer } {
    const parts = encoded.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
        throw new Error('Unsupported key hash format (expected scrypt$N$r$p$salt$derived)');
    }
    const n = Number.parseInt(parts[1], 10);
    const r = Number.parseInt(parts[2], 10);
    const p = Number.parseInt(parts[3], 10);
    if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || n <= 1 || r <= 0 || p <= 0) {
        throw new Error('Invalid scrypt parameters');
    }
    const salt = Buffer.from(parts[4], 'base64');
    const derivedKey = Buffer.from(parts[5], 'base64');
    if (salt.length === 0 || derivedKey.length === 0) {
        throw new Error('Invalid scrypt salt or derived key');
    }
    return { n, r, p, salt, derivedKey };
}

function verifyScryptSecret(rawSecret: string, encodedHash: string): boolean {
    const parsed = parseScryptHash(encodedHash);
    const calculated = scryptSync(rawSecret, parsed.salt, parsed.derivedKey.length, {
        N: parsed.n,
        r: parsed.r,
        p: parsed.p,
    });
    if (calculated.length !== parsed.derivedKey.length) return false;
    return timingSafeEqual(calculated, parsed.derivedKey);
}

function extractApiKey(headers: Headers): string | null {
    const authHeader = headers.get('authorization');
    if (authHeader && authHeader.trim().toLowerCase().startsWith('bearer ')) {
        const token = authHeader.trim().slice(7).trim();
        if (token.length > 0) return token;
    }
    const keyHeader = headers.get('x-api-key');
    if (keyHeader && keyHeader.trim().length > 0) {
        return keyHeader.trim();
    }
    return null;
}

function methodMatches(rule: RbacPolicyRule, method: string): boolean {
    const normalized = method.toUpperCase();
    return rule.methods.includes(normalized) || rule.methods.includes('*');
}

function pathMatches(rulePath: string, pathname: string): boolean {
    if (rulePath === pathname) return true;
    if (rulePath.endsWith('*')) {
        const prefix = rulePath.slice(0, -1);
        return pathname.startsWith(prefix);
    }
    return false;
}

function parseIsoDate(value: string | undefined): number | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function validateCrossReferences(users: RbacUser[], keys: RbacKey[]): void {
    const userMap = new Map(users.map((user) => [user.user_id, user]));
    const seenKeyIds = new Set<string>();
    for (const key of keys) {
        if (seenKeyIds.has(key.key_id)) {
            throw new Error(`Duplicate key_id "${key.key_id}" in RBAC keys file`);
        }
        seenKeyIds.add(key.key_id);
        if (!userMap.has(key.user_id)) {
            throw new Error(`RBAC key "${key.key_id}" references unknown user_id "${key.user_id}"`);
        }
        parseScryptHash(key.secret_hash);
        const expiresAt = parseIsoDate(key.expires_at);
        if (key.expires_at && expiresAt === null) {
            throw new Error(`RBAC key "${key.key_id}" has invalid expires_at timestamp`);
        }
    }
}

export function createRbacAuthorizer(config: {
    users: RbacUser[];
    keys: RbacKey[];
    policy?: RbacPolicyRule[];
}): RbacAuthorizer {
    validateCrossReferences(config.users, config.keys);
    const policy = config.policy && config.policy.length > 0
        ? config.policy
        : [...DEFAULT_POLICY_RULES];
    const usersById = new Map(config.users.map((user) => [user.user_id, user]));
    const keys = [...config.keys];

    return {
        authenticate(headers: Headers): AuthenticationResult {
            const apiKey = extractApiKey(headers);
            if (!apiKey) {
                return { ok: false, reason: 'missing_key' };
            }

            const key = keys.find((candidate) => {
                try {
                    return verifyScryptSecret(apiKey, candidate.secret_hash);
                } catch {
                    return false;
                }
            });
            if (!key) {
                return { ok: false, reason: 'invalid_key' };
            }
            if (!key.enabled) {
                return { ok: false, reason: 'disabled_key' };
            }
            const expiresAt = parseIsoDate(key.expires_at);
            if (expiresAt !== null && Date.now() >= expiresAt) {
                return { ok: false, reason: 'expired_key' };
            }

            const user = usersById.get(key.user_id);
            if (!user) {
                return { ok: false, reason: 'missing_user' };
            }
            if (!user.enabled) {
                return { ok: false, reason: 'disabled_user' };
            }

            return {
                ok: true,
                context: {
                    user_id: user.user_id,
                    roles: [...user.roles],
                    key_id: key.key_id,
                    allowed_projects: key.allowed_projects && key.allowed_projects.length > 0
                        ? [...key.allowed_projects]
                        : undefined,
                },
            };
        },

        resolveRoute(method: string, pathname: string): RouteDecision {
            const matchedRule = policy.find((rule) => methodMatches(rule, method) && pathMatches(rule.path, pathname)) ?? null;
            if (!matchedRule) {
                return {
                    matchedRule: null,
                    requiresAuthentication: true,
                    isPublic: false,
                };
            }
            return {
                matchedRule,
                requiresAuthentication: !matchedRule.public,
                isPublic: matchedRule.public,
            };
        },

        authorize(decision: RouteDecision, auth: AuthContext | null): AuthorizationResult {
            if (decision.isPublic) {
                return { allowed: true, reason: 'public_route' };
            }
            if (!auth) {
                return { allowed: false, reason: 'auth_role_denied' };
            }
            if (!decision.matchedRule) {
                return { allowed: false, reason: 'no_policy_match' };
            }
            const allowedRoles = decision.matchedRule.any_roles;
            if (allowedRoles.length === 0 || allowedRoles.includes('*')) {
                return { allowed: true, reason: 'auth_any_role' };
            }
            const roleMatch = auth.roles.some((role) => allowedRoles.includes(role));
            if (roleMatch) {
                return { allowed: true, reason: 'auth_role_match' };
            }
            return { allowed: false, reason: 'auth_role_denied' };
        },
    };
}

export async function loadRbacAuthorizerFromFiles(options: RbacLoadOptions): Promise<RbacAuthorizer> {
    const usersDoc = await loadDocument(options.usersPath);
    const keysDoc = await loadDocument(options.keysPath);
    const policyDoc = options.policyPath ? await loadDocument(options.policyPath) : null;

    const users = parseUsers(usersDoc);
    const keys = parseKeys(keysDoc);
    const policy = parsePolicy(policyDoc);

    return createRbacAuthorizer({ users, keys, policy });
}
