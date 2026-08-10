/**
 * Server-side SSRF hardening for the custom-provider path (Node-only — imports node:dns, so it
 * must NEVER be imported from browser-bundled code; keep it out of llmShared.ts).
 *
 * `sanitizeBaseUrl` (llmShared.ts) is the cheap, synchronous first pass: https-only, and it
 * rejects obvious private hosts by *string* (localhost, .local/.internal, IP literals). But a
 * public hostname whose DNS record points at a private/link-local address (e.g. a `nip.io`-style
 * name resolving to 169.254.169.254, or a rebinding host) slips past a string check. This module
 * closes that gap for the server proxy: it resolves the hostname and refuses any non-public
 * address, and it forbids redirects so a public host can't 3xx-bounce the request onto an
 * internal one.
 *
 * Residual (documented, accepted for this project's threat model): DNS is resolved here and then
 * again by fetch, so a fast rebind between the two could still race. Fully closing that needs
 * connecting to a pinned IP with a preserved Host/SNI — out of scope for a hobby game proxy that
 * runs on a platform where the metadata endpoint is already unreachable.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const o = Number(p);
    if (o > 255) return null;
    n = n * 256 + o;
  }
  return n >>> 0;
}

function inCidr4(ipInt: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/**
 * True if `ip` (a numeric IPv4/IPv6 literal) is loopback, private, link-local, CGNAT, multicast,
 * or otherwise not a public unicast address. Unparseable input is treated as unsafe (returns true)
 * so a bad value can never be mistaken for "public". Pure — unit-tested.
 */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    if (n === null) return true;
    return (
      inCidr4(n, "0.0.0.0", 8) || // "this network"
      inCidr4(n, "10.0.0.0", 8) || // private
      inCidr4(n, "100.64.0.0", 10) || // CGNAT
      inCidr4(n, "127.0.0.0", 8) || // loopback
      inCidr4(n, "169.254.0.0", 16) || // link-local (incl. cloud metadata 169.254.169.254)
      inCidr4(n, "172.16.0.0", 12) || // private
      inCidr4(n, "192.0.0.0", 24) || // IETF protocol assignments
      inCidr4(n, "192.168.0.0", 16) || // private
      inCidr4(n, "198.18.0.0", 15) || // benchmarking
      inCidr4(n, "224.0.0.0", 4) || // multicast
      inCidr4(n, "240.0.0.0", 4) // reserved / broadcast
    );
  }
  if (kind === 6) {
    let s = ip.toLowerCase();
    const zone = s.indexOf("%");
    if (zone >= 0) s = s.slice(0, zone);
    if (s === "::1" || s === "::") return true; // loopback / unspecified
    // IPv4-mapped or -embedded (::ffff:a.b.c.d, ::a.b.c.d) — classify the embedded v4.
    const embedded = s.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
    if (embedded) return isPrivateAddress(embedded[1]);
    if (/^f[cd]/.test(s)) return true; // fc00::/7 unique-local
    if (/^fe[89ab]/.test(s)) return true; // fe80::/10 link-local
    if (/^ff/.test(s)) return true; // ff00::/8 multicast
    return false;
  }
  return true; // not a valid IP literal
}

/** Resolve `hostname` and throw if it resolves to any non-public address. */
export async function assertPublicHost(hostname: string): Promise<void> {
  // A bare IP literal never reaches here (sanitizeBaseUrl rejects those) but be defensive.
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("endpoint address is not public");
    return;
  }
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new Error("endpoint host did not resolve");
  }
  if (addrs.length === 0) throw new Error("endpoint host did not resolve");
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) throw new Error("endpoint resolves to a non-public address");
  }
}

/**
 * A `fetch` drop-in for the AI SDK's custom-provider client: enforces https, refuses hosts that
 * resolve to non-public addresses, and disables redirect-following (a 3xx could otherwise bounce
 * onto an internal host after the check passed).
 */
export const guardedFetch: typeof fetch = async (input, init) => {
  const href =
    typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  const url = new URL(href);
  if (url.protocol !== "https:") throw new Error("only https endpoints are allowed");
  await assertPublicHost(url.hostname);
  return fetch(input as Parameters<typeof fetch>[0], { ...init, redirect: "error" });
};
