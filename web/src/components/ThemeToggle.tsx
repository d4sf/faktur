import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label="Cambiar tema">
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className="ml-2">{theme === "dark" ? "Claro" : "Oscuro"}</span>
    </Button>
  );
}
