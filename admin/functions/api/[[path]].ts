// The command deck serves the same shared backend as the customer app.
// This re-export keeps one source of truth: all API behaviour and the
// owner/admin authorization rules live in backend/src/worker.ts.
export { onRequest } from "../../../backend/src/worker";