import { Bell, Trash2, Webhook } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface SlackStatus {
  configured: boolean;
  url: string | null;
}

export default function Integraciones() {
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/integrations/slack")
      .then((res) => res.json())
      .then((data: SlackStatus) => setStatus(data))
      .catch(() => setError("No se pudo cargar el estado"));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/integrations/slack", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setMessage("Webhook de Slack guardado correctamente.");
      setUrl("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/integrations/slack", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage("Webhook eliminado.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/integrations/slack/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(url.trim() ? { url: url.trim() } : {}),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(`Prueba enviada correctamente (HTTP ${data.status}).`);
      } else {
        setError(data.error ?? "La prueba falló");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al probar");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          Integraciones
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configurá la URL del incoming webhook de Slack para recibir avisos cuando una factura se
          escala a un humano o es rechazada.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="size-4" />
            Slack (webhook)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-xs">
            <Bell className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">
              Estado:{" "}
              <span
                className={
                  status?.configured
                    ? "text-emerald-600 font-semibold"
                    : "text-rose-600 font-semibold"
                }
              >
                {status?.configured ? "Configurado" : "No configurado"}
              </span>
              {status?.configured && status.url && (
                <span className="ml-2 font-mono text-muted-foreground">({status.url})</span>
              )}
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              URL del incoming webhook (https://hooks.slack.com/...)
            </label>
            <Input
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleSave} disabled={loading || !url.trim()}>
              {loading ? "Guardando…" : "Guardar"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? "Probando…" : "Probar webhook"}
            </Button>
            {status?.configured && (
              <Button size="sm" variant="destructive" onClick={handleDelete} disabled={loading}>
                <Trash2 className="size-3.5 mr-1" />
                Eliminar
              </Button>
            )}
          </div>

          {message && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Cómo obtener la URL</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>En Slack, creá una app (o usá una existente) en api.slack.com/apps.</li>
              <li>Activá "Incoming Webhooks" y agregá uno al canal deseado.</li>
              <li>Copiá la URL generada y pegala arriba.</li>
            </ol>
            <p className="pt-1">
              El webhook se dispara cuando una factura se escala a un humano (ESCALAR), es
              rechazada (NEGADA) o se frena automáticamente por las reglas (FRENAR, incluidos los
              reenvíos duplicados). Las facturas pagadas (PAGAR) no generan aviso.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
