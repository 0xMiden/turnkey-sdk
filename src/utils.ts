import type { Turnkey } from "./types";

export const fromTurnkeySig = (sig: { r: string; s: string; v: string }) => {
  // TODO: bug in miden crypto where there is an extra byte in the signature buffer
  const sigBuff = new Uint8Array(67);
  sigBuff[0] = 1;
  const rBytes = hexToBytes(sig.r);
  const sBytes = hexToBytes(sig.s);

  sigBuff.set(rBytes, 1);
  sigBuff.set(sBytes, 33);
  sigBuff[65] = parseInt(sig.v);
  return sigBuff;
};

export const hexToBytes = (hex: string): Uint8Array => {
  if (hex.startsWith("0x")) {
    hex = hex.slice(2);
  }
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(`${hex[i]}${hex[i + 1]}`, 16);
  }
  return bytes;
};

export async function fetchUncompressedPublicKey(input: {
  client: Turnkey;
  privateKeyId: string;
  organizationId: string;
}): Promise<string> {
  const { client, privateKeyId, organizationId } = input;

  const keyInfo = await client.getPrivateKey({
    organizationId,
    privateKeyId,
  });

  const uncompressedPublicKey = keyInfo.privateKey.publicKey;
  return uncompressedPublicKey;
}

export function isValidUuid(s: string): boolean {
  const regex = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  return regex.test(s);
}

export const evmPkToCommitment = async (compressedPk: string) => {
  const { Felt, Rpo256, FeltArray } = await import("@miden-sdk/miden-sdk/lazy");
  const bytes = hexToBytes(compressedPk);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // convert bytes to a felt array
  // 4 bytes per felt therefore a 9 felt array
  const felts = Array.from(
    { length: 8 },
    (_, i) => new Felt(BigInt(view.getUint32(i * 4, true)))
  );
  // push the last 33rd byte
  felts.push(new Felt(BigInt(bytes[32])));
  const pk = Rpo256.hashElements(new FeltArray(felts));
  return pk;
};

/**
 * Derives a 32-byte seed buffer from a UTF-8 string, truncating when longer than 32 bytes.
 */
export const accountSeedFromStr = (str?: string) => {
  if (!str) return;
  const buffer = new Uint8Array(32);
  const bytes = new TextEncoder().encode(str);
  buffer.set(bytes.slice(0, 32));
  return buffer;
};
