import { describe, it, expect } from "vitest";
import { isPrivateAddress } from "./ssrfGuard";

describe("isPrivateAddress", () => {
  it("flags IPv4 loopback / private / link-local / CGNAT ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "127.10.20.30",
      "10.0.0.1",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "169.254.0.1",
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "224.0.0.1", // multicast
      "255.255.255.255",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("allows genuine public IPv4 addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "140.82.112.3", "172.15.255.255", "172.32.0.1", "100.63.255.255"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("flags IPv6 loopback / ULA / link-local and IPv4-mapped private", () => {
    for (const ip of [
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "fe80::1%eth0",
      "ff02::1", // multicast
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "::ffff:169.254.169.254",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("allows public IPv6 and public IPv4-mapped", () => {
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false); // Cloudflare
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("treats unparseable / non-literal input as unsafe", () => {
    for (const bad of ["", "not-an-ip", "999.999.999.999", "10.0.0", "example.com"]) {
      expect(isPrivateAddress(bad), bad).toBe(true);
    }
  });
});
