import { createRoot } from "react-dom/client";
import Home from "../../app/page";
import Account from "../../app/account/page";
import ConnectAi from "../../app/connect-ai/page";
import "../../app/globals.css";
createRoot(document.getElementById("root")!).render(
  location.pathname === "/account" ? (
    <Account />
  ) : location.pathname === "/connect-ai" ? (
    <ConnectAi />
  ) : (
    <Home />
  ),
);
