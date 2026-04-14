"use client";

import { useAppDispatch } from "@/lib/context";
import { useUsuario } from "@/lib/usuario";
import { generateId } from "@/lib/store";
import type { Area } from "@/lib/types";
import HierarchyPicker from "./HierarchyPicker";

interface Props {
  plantillaId: string;
  plantillaNombre: string;
  area: Area;
  responsable: string;
  dateKey: string;
  onClose: () => void;
}

export default function SOPLaunchDialog({ plantillaId, plantillaNombre, area, responsable, dateKey, onClose }: Props) {
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();

  return (
    <HierarchyPicker
      depth="resultado"
      initialArea={area}
      title={`Destino para "${plantillaNombre}"`}
      onSelect={(sel) => {
        dispatch({
          type: "MATERIALIZE_SOP",
          plantillaId,
          area: sel.areaId ?? area,
          responsable: responsable || currentUser,
          currentUser,
          dateKey,
          ids: { resultado: generateId(), entregable: generateId(), paso: generateId(), proyecto: generateId() },
          proyectoId: sel.proyectoId,
          resultadoId: sel.resultadoId,
          autoStart: false,
        });
        onClose();
      }}
      onCancel={onClose}
    />
  );
}
