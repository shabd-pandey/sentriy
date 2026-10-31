// Sign-in is disabled for the ticketing test deployment, so the API needs a
// stable identity that survives reloads and identifies this browser without an
// account. The worker trusts it only while Clerk is unconfigured (demo mode).
const KEY = "sentriy.guestId";

const isValid = (value: string) => /^[A-Za-z0-9_-]{8,64}$/.test(value);

export function guestId(): string {
  if (typeof localStorage === "undefined") return "demo-customer";
  let value = localStorage.getItem(KEY) ?? "";
  if (!isValid(value)) {
    const generated = globalThis.crypto?.randomUUID?.()
      ?? `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    value = generated.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    localStorage.setItem(KEY, value);
  }
  return value;
}
