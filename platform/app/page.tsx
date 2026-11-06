import { HomeGate } from "../src/membership/home-gate";
import { Checking, Footer, FrontPage, Launcher } from "../src/lib/home-views";

export default function Home() {
  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <HomeGate checking={<Checking />} signedOut={<FrontPage />} signedIn={<Launcher />} />
      <Footer />
    </div>
  );
}
