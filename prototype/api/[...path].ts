// Vercel Functions entrypoint for the customer app.
// All routes, auth and SQL live in the shared backend; this file only adapts
// Vercel's Node request/response to the worker's Web-standard contract.
export { default } from "../../backend/src/vercel";
