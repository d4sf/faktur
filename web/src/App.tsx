import { Router } from "./router.js";

import { SessionProvider } from "@/components/session/SessionProvider";

export default function App() {
  return (
    <SessionProvider>
      <Router />
    </SessionProvider>
  );
}
