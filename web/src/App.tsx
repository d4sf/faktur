import { useEffect, useState } from "react";

export default function App() {
  const [health, setHealth] = useState("comprobando");

  useEffect(() => {
    fetch("/api/health")
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((data: { status: string }) => setHealth(data.status))
      .catch(() => setHealth("sin conexión"));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Blinka PayAgent</h1>
      <p>Entorno de desarrollo listo.</p>
      <p>API: {health}</p>
    </main>
  );
}
