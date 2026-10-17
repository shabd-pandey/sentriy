// Real RS256 token factory for the acceptance harness.
//
// The worker verifies Clerk JWTs itself (JWKS fetch + WebCrypto RS256). We do
// not stub that logic: we generate a real RSA key pair, serve its public JWK
// from a stubbed JWKS endpoint, and mint genuinely signed tokens. Issuer,
// audience, expiry and signature checks are therefore exercised for real.
export const TEST_ISSUER = "https://clerk.test";
export const TEST_AUDIENCE = "platform-api";
export const TEST_KID = "acceptance-key-1";

export const CUSTOMER_EMAIL = "customer@example.test";
export const OWNER_EMAIL = "owner@example.test";
export const STAFF_EMAIL = "staff@example.test";
export const WRONG_ISSUER = "https://not-clerk.example.test";

export type ClerkPublicJwk = JsonWebKey & { kid: string; alg: string; use: string };

export interface TestKeys {
  publicJwk: ClerkPublicJwk;
  privateKey: CryptoKey;
}

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const encodeJson = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

async function generateKeys(): Promise<TestKeys> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { publicJwk: { ...publicJwk, kid: TEST_KID, alg: "RS256", use: "sig" }, privateKey: pair.privateKey };
}

let keysPromise: Promise<TestKeys> | undefined;
let forgedKeysPromise: Promise<TestKeys> | undefined;

/** The signing key whose public JWK the harness serves from the JWKS stub. */
export const testKeys = (): Promise<TestKeys> => (keysPromise ??= generateKeys());

/** A second key pair sharing the `kid`, used to forge a bad signature. */
const forgedKeys = (): Promise<TestKeys> => (forgedKeysPromise ??= generateKeys());

export interface TokenSpec {
  sub?: string;
  /** `null` removes the claim entirely. */
  role?: string | null;
  /** `null` removes the claim entirely. */
  email?: string | null;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  kid?: string;
  signWith?: CryptoKey;
  claims?: Record<string, unknown>;
}

/** Mint a signed RS256 JWT. Everything the worker checks is real. */
export async function mintToken(spec: TokenSpec = {}): Promise<string> {
  const { privateKey } = await testKeys();
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: TEST_ISSUER,
    sub: "user_test",
    aud: TEST_AUDIENCE,
    exp: now + 60 * 60,
    ...spec.claims,
  };
  if (spec.iss !== undefined) payload.iss = spec.iss;
  if (spec.sub !== undefined) payload.sub = spec.sub;
  if (spec.aud !== undefined) payload.aud = spec.aud;
  if (spec.exp !== undefined) payload.exp = spec.exp;
  if (spec.nbf !== undefined) payload.nbf = spec.nbf;
  if (spec.role !== undefined) {
    if (spec.role === null) delete payload.role;
    else payload.role = spec.role;
  }
  if (spec.email !== undefined) {
    if (spec.email === null) delete payload.email;
    else payload.email = spec.email;
  }

  const signingInput = `${encodeJson({ alg: "RS256", typ: "JWT", kid: spec.kid ?? TEST_KID })}.${encodeJson(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    spec.signWith ?? privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

/** A signed-in public customer (the role a Google sign-up receives). */
export const customerToken = (spec: TokenSpec = {}) =>
  mintToken({ sub: "user_customer", role: "customer", email: CUSTOMER_EMAIL, ...spec });

/** A signed-in owner carrying the metadata role `admin` (allowlist unset). */
export const ownerToken = (spec: TokenSpec = {}) =>
  mintToken({ sub: "user_owner", role: "admin", email: OWNER_EMAIL, ...spec });

/** A signed-in owner whose admin access comes only from the OWNER_EMAILS allowlist. */
export const allowlistedOwnerToken = (spec: TokenSpec = {}) =>
  mintToken({ sub: "user_allowlisted", role: "customer", email: OWNER_EMAIL, ...spec });

/** A signed-in staff member carrying the metadata role `staff`. */
export const staffToken = (spec: TokenSpec = {}) =>
  mintToken({ sub: "user_staff", role: "staff", email: STAFF_EMAIL, ...spec });

/** Well-formed, correctly signed, but expired. */
export const expiredToken = (spec: TokenSpec = {}) =>
  mintToken({ sub: "user_expired", role: "customer", email: CUSTOMER_EMAIL, exp: Math.floor(Date.now() / 1000) - 60, ...spec });

/** Correct claims, signed by a key the JWKS endpoint does not publish. */
export async function badlySignedToken(spec: TokenSpec = {}): Promise<string> {
  const { privateKey } = await forgedKeys();
  return customerToken({ signWith: privateKey, ...spec });
}

/** Not a JWT at all. */
export const GARBAGE_TOKEN = "this-is-not-a-jwt";
