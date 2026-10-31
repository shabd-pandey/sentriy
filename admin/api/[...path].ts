// Vercel Functions entrypoint for the Command Deck. Same shared backend as the
// customer app, so both deployments read and write the same Neon database.
export { default } from "../../backend/src/vercel";
