/**
 * @file ThemeToggle.tsx
 * @description Componente de control para alternar entre modo claro y modo oscuro.
 * Sincronizado con el hook useTheme y la clase 'dark' en el elemento raíz del DOM.
 */

import { Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/hooks/useTheme";

/**
 * Renderiza el switch con íconos de Sol y Luna y etiqueta de modo.
 */
export function ThemeToggle({ showLabel = true }: { showLabel?: boolean }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 transition-colors">
      <div className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground">
        {isDark ? (
          <Moon className="size-4 text-primary" />
        ) : (
          <Sun className="size-4 text-amber-500" />
        )}
        {showLabel && <span>{isDark ? "Modo oscuro" : "Modo claro"}</span>}
      </div>
      <Switch checked={isDark} onCheckedChange={toggle} aria-label="Alternar modo claro y oscuro" />
    </div>
  );
}
