import { Input } from "@/components/ui/input";

interface CategoryBudgetTableProps {
  budgets: Record<string, number>;
  onChange: (category: string, value: number) => void;
  disabled?: boolean;
}

const CATEGORIES = ["Infraestructura", "Diseno", "Marketing", "Legal", "Software", "Retail"];

export function CategoryBudgetTable({
  budgets,
  onChange,
  disabled = false,
}: CategoryBudgetTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border bg-muted/30 text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
              Categoría
            </th>
            <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">
              Presupuesto (USD)
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {CATEGORIES.map((cat) => (
            <tr key={cat} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3 font-medium text-foreground">{cat}</td>
              <td className="px-4 py-3">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={budgets[cat] ?? 0}
                  onChange={(e) => onChange(cat, Number(e.target.value))}
                  disabled={disabled}
                  className="h-8 w-24 text-xs"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
