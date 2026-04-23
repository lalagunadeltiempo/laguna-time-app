"use client";

const DAY_INITIAL = ["L", "M", "X", "J", "V", "S", "D"];

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  weekDates: Date[];
  selectedKeys: string[];
  onToggle: (dateKey: string) => void;
  size?: "sm" | "md";
}

export function WeekDayChips({ weekDates, selectedKeys, onToggle, size = "sm" }: Props) {
  const selected = new Set(selectedKeys);
  const dim = size === "md" ? "h-7 w-7 text-xs" : "h-5 w-5 text-[10px]";
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {weekDates.map((d, i) => {
        const k = toDateKey(d);
        const isSel = selected.has(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => onToggle(k)}
            className={`${dim} rounded font-bold transition-colors ${isSel ? "bg-accent text-white" : "bg-surface text-muted hover:bg-border"}`}
            title={d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })}
          >
            {DAY_INITIAL[i]}
          </button>
        );
      })}
    </div>
  );
}
