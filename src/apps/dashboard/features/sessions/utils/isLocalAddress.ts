/**
 * Heuristically determines whether a session's remote endpoint is on the local network (internal)
 * rather than the public internet (external), based on private/loopback/link-local address ranges.
 */
const isLocalAddress = (endpoint?: string | null): boolean => {
    if (!endpoint) {
        return false;
    }

    let host = endpoint.trim();

    // Strip IPv6 brackets ("[::1]:123") or an IPv4 port ("192.168.1.5:54321").
    if (host.startsWith('[')) {
        const end = host.indexOf(']');
        host = end > 0 ? host.slice(1, end) : host.slice(1);
    } else if (host.includes('.') && host.includes(':')) {
        host = host.split(':')[0];
    }

    host = host.toLowerCase();

    // IPv6 loopback, unique-local (fc00::/7) and link-local (fe80::/10).
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
        return true;
    }

    // IPv4 loopback / private / link-local ranges.
    if (host.startsWith('127.') || host.startsWith('10.')
        || host.startsWith('192.168.') || host.startsWith('169.254.')) {
        return true;
    }

    const match = /^172\.(\d{1,3})\./.exec(host);
    if (match) {
        const second = Number(match[1]);
        return second >= 16 && second <= 31;
    }

    return false;
};

export default isLocalAddress;
