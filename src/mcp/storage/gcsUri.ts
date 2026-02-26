export interface ParsedGcsUri {
    bucket: string;
    prefix: string;
}

function normalizePrefix(value: string): string {
    return value.replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/+$/, '');
}

export function parseGcsUri(uri: string): ParsedGcsUri {
    if (typeof uri !== 'string' || uri.trim().length === 0) {
        throw new Error('GCS URI must be a non-empty string.');
    }

    const trimmed = uri.trim();
    if (!trimmed.startsWith('gs://')) {
        throw new Error(`Invalid GCS URI "${uri}": must start with "gs://".`);
    }

    const withoutScheme = trimmed.slice('gs://'.length);
    if (withoutScheme.length === 0) {
        throw new Error(`Invalid GCS URI "${uri}": missing bucket name.`);
    }

    const slashIndex = withoutScheme.indexOf('/');
    const bucket = (slashIndex === -1 ? withoutScheme : withoutScheme.slice(0, slashIndex)).trim();
    if (bucket.length === 0) {
        throw new Error(`Invalid GCS URI "${uri}": missing bucket name.`);
    }

    const rawPrefix = slashIndex === -1 ? '' : withoutScheme.slice(slashIndex + 1);
    const prefix = normalizePrefix(rawPrefix);

    return { bucket, prefix };
}
