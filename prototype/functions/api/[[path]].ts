// Customer Pages project serves the single shared backend in backend/src/worker.ts.
// This re-export keeps one source of truth: all API behaviour and the
// owner/admin authorization rules live in backend/.
export { onRequest } from "../../../backend/src/worker";
