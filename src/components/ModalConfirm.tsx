"use client";

interface Props {
  titulo?: string;
  mensaje: string;
  labelConfirm?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

const BORDER_CLASSES = {
  danger: "border-red-200 bg-red-50",
  primary: "border-green-200 bg-green-50",
};

const BTN_CLASSES = {
  danger: "bg-red-500 hover:bg-red-600",
  primary: "bg-green-600 hover:bg-green-700",
};

export function ModalConfirm({
  titulo,
  mensaje,
  labelConfirm = "Eliminar",
  variant = "danger",
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className={`my-2 rounded-xl border-2 p-4 shadow-sm ${BORDER_CLASSES[variant]}`}>
      {titulo && <h3 className="text-sm font-semibold text-zinc-900">{titulo}</h3>}
      <p className={`${titulo ? "mt-1" : ""} text-xs text-zinc-600`}>{mensaje}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={onCancel}
          className="flex-1 rounded-lg border border-zinc-200 bg-white py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50">
          Cancelar
        </button>
        <button onClick={onConfirm}
          className={`flex-1 rounded-lg py-2 text-xs font-medium text-white transition-colors ${BTN_CLASSES[variant]}`}>
          {labelConfirm}
        </button>
      </div>
    </div>
  );
}
