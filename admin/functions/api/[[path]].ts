// The command deck serves the same shared backend as the customer app.
// This re-export keeps one source of truth: all API behaviour and the
// owner/admin authorization rules live in the prototype Pages Functions.
export { onRequest } from "../../../prototype/functions/api/[[path]]";