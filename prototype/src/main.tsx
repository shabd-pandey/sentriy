import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Sign-in is disabled on this deployment. The customer app talks to the shared
// backend as a guest: `apiRequest` sends the browser's guest id, and the worker
// resolves the account, wallet and rewards from it. Bookings are confirmed in
// the Command Deck, so there is no checkout step here.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
