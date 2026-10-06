import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Fijamos explícitamente la raíz del proyecto para Turbopack. Evita que, si
// aparece otro lockfile en un directorio superior (p. ej. ~/package-lock.json
// por un `npm` lanzado por error), Next infiera mal la raíz del workspace.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
