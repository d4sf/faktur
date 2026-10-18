import type Database from "better-sqlite3";

import { getSetting, setSetting } from "../repositories/settings.js";

export const MAINTENANCE_KEY = "maintenance_mode";

export const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Flush</title>
<style>
  html,body{margin:0;height:100%;background:#040926;color:#d4d2d5;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center}
  h1{font-size:4rem;letter-spacing:.1em;margin:0;font-weight:700}
</style>
</head>
<body><h1>Flush</h1></body>
</html>`;

export function isMaintenanceMode(db: Database.Database): boolean {
  return getSetting(MAINTENANCE_KEY, db) === "true";
}

export function setMaintenanceMode(maintenance: boolean, db: Database.Database): void {
  setSetting(MAINTENANCE_KEY, maintenance ? "true" : "false", db);
}
