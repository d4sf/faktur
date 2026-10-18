/**
 * @file Datos.tsx
 * @description Administración del dataset de demostración: muestra el conteo de filas
 * por tabla, permite elegir un perfil de siembra (`reference` / `demo`) y reiniciar la
 * base pidiendo confirmación explícita. Consume `GET /api/admin/db` y
 * `POST /api/admin/db/reset`.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Database, RotateCcw, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { BentoCard, BentoGrid } from "@/components/layout/BentoGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { DbStatus, ResetResult, SeedProfile } from "@/types/admin";

/** Clave de `sessionStorage` donde se guarda el token de administración. */
const TOKEN_STORAGE_KEY = "faktur.admin_token";

/** Palabra exacta que habilita el botón de confirmación del reset. */
const CONFIRM_WORD = "REINICIAR";

const CATALOG_TABLES = ["categories", "vendors", "policies", "policy_category_budgets", "fx_rates"];

const MOVEMENT_TABLES = [
  "invoices",
  "ingest_attempts",
  "line_items",
  "decisions",
  "approvals",
  "ledger_entries",
  "notifications",
];

const VERDICT_ORDER = ["PAGAR", "FRENAR", "ESCALAR"] as const;

const PROFILE_OPTIONS: Array<{
  profile: SeedProfile;
  title: string;
  description: string;
}> = [
  {
    profile: "reference",
    title: "Base de referencia",
    description: "Base como recién instalada",
  },
  {
    profile: "demo",
    title: "Base demo",
    description: "Base con los 12 casos demo",
  },
];

interface ErrorBody {
  error?: string;
}

async function fetchDbStatus(): Promise<DbStatus> {
  const res = await fetch("/api/admin/db");
  if (!res.ok) throw new Error(`db_status_${res.status}`);
  return (await res.json()) as DbStatus;
}

function resetFailureMessage(code: string | undefined): string {
  switch (code) {
    case "db_reset_disabled":
      return "El reset está deshabilitado en el servidor: falta ALLOW_DB_RESET=true.";
    case "db_reset_token_missing":
      return "El servidor no tiene ADMIN_TOKEN configurado y no permite el reset.";
    default:
      return "Error inesperado al reiniciar la base. Revisá los logs del servidor.";
  }
}

/** Cuenta los veredictos por valor (PAGAR / FRENAR / ESCALAR). */
function countVerdicts(verdicts: Record<string, string>): Record<string, number> {
  const counts: Record<string, number> = { PAGAR: 0, FRENAR: 0, ESCALAR: 0 };
  for (const verdict of Object.values(verdicts)) {
    counts[verdict] = (counts[verdict] ?? 0) + 1;
  }
  return counts;
}

function readStoredToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function TableCountCard({ table, value }: { table: string; value: number }) {
  return (
    <BentoCard>
      <Card className="h-full gap-2 rounded-xl border border-border/80 bg-card py-4 shadow-xs">
        <CardContent className="space-y-1 px-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {table}
          </p>
          <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        </CardContent>
      </Card>
    </BentoCard>
  );
}

function CountsSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((group) => (
        <div key={group} className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <BentoGrid>
            {Array.from({ length: group === 0 ? 5 : 7 }).map((_, index) => (
              <BentoCard key={index}>
                <Skeleton className="h-20 w-full rounded-xl" />
              </BentoCard>
            ))}
          </BentoGrid>
        </div>
      ))}
    </div>
  );
}

export default function Datos() {
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profile, setProfile] = useState<SeedProfile>("demo");
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [confirmText, setConfirmText] = useState<string>("");
  const [token, setToken] = useState<string>(() => readStoredToken());
  const [tokenRequired, setTokenRequired] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetBlocked, setResetBlocked] = useState<boolean>(false);
  const [result, setResult] = useState<ResetResult | null>(null);

  const loadStatus = async () => {
    try {
      const data = await fetchDbStatus();
      setStatus(data);
      setLoadError(null);
    } catch {
      setLoadError(
        "No se pudo cargar el estado de la base. Verificá que la API esté disponible y volvé a intentar.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const resetEnabled = status?.enabled === true;
  const selectedProfile = PROFILE_OPTIONS.find((option) => option.profile === profile);

  const openDialog = () => {
    setConfirmText("");
    setResetError(null);
    setResetBlocked(false);
    setTokenRequired(false);
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (resetting) return;
    setDialogOpen(open);
    if (!open) {
      setConfirmText("");
      setResetError(null);
      setResetBlocked(false);
      setTokenRequired(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setResetError(null);

    const trimmedToken = token.trim();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (trimmedToken !== "") {
      headers["x-admin-token"] = trimmedToken;
      try {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, trimmedToken);
      } catch {
        // sessionStorage puede no estar disponible; el reset sigue funcionando.
      }
    }

    try {
      const res = await fetch("/api/admin/db/reset", {
        method: "POST",
        headers,
        body: JSON.stringify({ profile, confirm: CONFIRM_WORD }),
      });

      if (res.ok) {
        const data = (await res.json()) as ResetResult;
        setTokenRequired(false);
        setDialogOpen(false);
        setConfirmText("");
        setResult(data);
        await loadStatus();
        return;
      }

      const body = (await res.json().catch(() => ({}))) as ErrorBody;

      if (res.status === 401) {
        setTokenRequired(true);
        setResetError(
          "El token de administración no es válido. Ingresalo de nuevo y reintentá sin cerrar esta ventana.",
        );
      } else if (res.status === 403) {
        setResetBlocked(true);
        setResetError(resetFailureMessage(body.error));
      } else {
        setResetError(resetFailureMessage(body.error));
      }
    } catch {
      setResetError("No se pudo contactar al servidor. Revisá la conexión y reintentá.");
    } finally {
      setResetting(false);
    }
  };

  const verdictCounts = result ? countVerdicts(result.verdicts) : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl font-logo">
              Datos de demo
            </h2>
            {status && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Database className="size-3" />
                <span>policy {status.policy_version}</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Estado del dataset y reinicio completo de la base SQLite con un perfil de siembra.
          </p>
        </div>

        <Button
          variant="destructive"
          onClick={openDialog}
          disabled={!resetEnabled || loading}
          className="h-9 gap-1.5 text-xs font-semibold shadow-xs"
        >
          <RotateCcw className="size-3.5" />
          <span>Reiniciar base</span>
        </Button>
      </div>

      {status && !resetEnabled && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs font-medium text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {status.reason === "missing_token"
              ? "Falta configurar ADMIN_TOKEN."
              : "Falta ALLOW_DB_RESET=true."}
          </span>
        </div>
      )}

      {loadError && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs font-medium text-rose-800 dark:text-rose-300">
          <span className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{loadError}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              loadStatus();
            }}
            className="h-7 shrink-0 text-[11px]"
          >
            Reintentar
          </Button>
        </div>
      )}

      {loading ? (
        <CountsSkeleton />
      ) : status ? (
        <div className="space-y-7">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Catálogo
            </h3>
            <BentoGrid>
              {CATALOG_TABLES.map((table) => (
                <TableCountCard key={table} table={table} value={status.counts[table] ?? 0} />
              ))}
            </BentoGrid>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Movimiento
            </h3>
            <BentoGrid>
              {MOVEMENT_TABLES.map((table) => (
                <TableCountCard key={table} table={table} value={status.counts[table] ?? 0} />
              ))}
            </BentoGrid>
          </section>
        </div>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Perfil de siembra
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PROFILE_OPTIONS.map((option) => {
            const isSelected = option.profile === profile;
            return (
              <Card
                key={option.profile}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => setProfile(option.profile)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setProfile(option.profile);
                  }
                }}
                className={`cursor-pointer gap-1 rounded-xl border py-4 shadow-xs transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border/80 bg-card hover:border-foreground/20"
                }`}
              >
                <CardContent className="flex items-start justify-between gap-3 px-4">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-bold text-foreground">
                      {option.title}
                    </CardTitle>
                    <CardDescription className="text-xs">{option.description}</CardDescription>
                  </div>
                  <span
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-transparent text-transparent"
                    }`}
                  >
                    <Check className="size-3" />
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {result && verdictCounts && (
        <Card className="gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 py-5 shadow-xs">
          <CardHeader className="px-5">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                <Check className="size-3.5" />
              </span>
              <CardTitle className="text-sm font-bold text-foreground">
                Base reiniciada con el perfil {result.profile}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {result.counts["invoices"] ?? 0} facturas · {result.cleared_uploads} archivos de
              uploads borrados · {result.duration_ms} ms
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {VERDICT_ORDER.map((verdict) => (
                <div
                  key={verdict}
                  className="rounded-lg border border-border/80 bg-card p-3 text-center"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {verdict}
                  </p>
                  <p className="text-xl font-bold tabular-nums text-foreground">
                    {verdictCounts[verdict]}
                  </p>
                </div>
              ))}
              <div className="rounded-lg border border-border/80 bg-card p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pendientes
                </p>
                <p className="text-xl font-bold tabular-nums text-foreground">
                  {result.approvals_pending}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
              <Link to="/bandeja" className="text-primary underline-offset-4 hover:underline">
                Ver bandeja de revisión
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link to="/" className="text-primary underline-offset-4 hover:underline">
                Volver al tablero
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-destructive" />
              <span>Reiniciar la base de datos</span>
            </DialogTitle>
            <DialogDescription>
              Esta acción es destructiva y no se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="font-semibold text-destructive">Se borra</p>
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                <li>El archivo SQLite completo (con sus logs WAL/SHM).</li>
                <li>Todo el contenido del directorio uploads/.</li>
              </ul>
            </div>

            <div className="space-y-1.5 rounded-lg border border-border/80 bg-muted/20 p-3">
              <p className="font-semibold text-foreground">Se siembra</p>
              <p className="text-muted-foreground">
                Perfil <span className="font-mono font-semibold">{profile}</span>
                {selectedProfile ? ` — ${selectedProfile.description}` : ""}.
              </p>
            </div>

            {tokenRequired && (
              <div className="space-y-1.5">
                <label htmlFor="admin-token" className="block font-semibold text-foreground">
                  Token de administración
                </label>
                <Input
                  id="admin-token"
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="ADMIN_TOKEN"
                  autoComplete="off"
                  aria-invalid={resetError !== null}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="reset-confirm" className="block font-semibold text-foreground">
                Escribí {CONFIRM_WORD} para confirmar
              </label>
              <Input
                id="reset-confirm"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={CONFIRM_WORD}
                autoComplete="off"
              />
            </div>

            {resetError && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 font-medium text-rose-800 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{resetError}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={resetting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={resetting || resetBlocked || confirmText !== CONFIRM_WORD}
            >
              {resetting ? "Reiniciando..." : "Confirmar reinicio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
