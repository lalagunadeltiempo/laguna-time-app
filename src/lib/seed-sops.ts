import { generateId } from "./store";
import type { PlantillaProceso, PasoPlantilla, Programacion, AreaEmpresa } from "./types";

function paso(nombre: string, min?: number | null, tipo?: PasoPlantilla["tipo"], prog?: Programacion): PasoPlantilla {
  return {
    id: generateId(), orden: 0, nombre, descripcion: "", herramientas: [],
    tipo: tipo ?? "accion", minutosEstimados: min ?? null,
    ...(prog ? { programacion: prog } : {}),
  };
}

function sop(
  area: AreaEmpresa,
  nombre: string,
  objetivo: string,
  responsable: string,
  disparador: string,
  programacion: Programacion | null,
  herramientas: string[],
  pasos: PasoPlantilla[],
  excepciones: string,
): PlantillaProceso {
  return {
    id: generateId(), nombre, area, objetivo, disparador, programacion,
    proyectoId: null, responsableDefault: responsable,
    pasos: pasos.map((p, i) => ({ ...p, orden: i + 1 })),
    herramientas, excepciones, dependeDeIds: [],
    creado: new Date().toISOString(),
  };
}

export function buildSeedSOPs(): PlantillaProceso[] {
  return [
    /* ================================================================
       BLOQUE 1: ADMINISTRACIÓN FINANCIERA (5 procesos originales)
       ================================================================ */

    sop(
      "financiera",
      "Facturación y Registro de Ingresos",
      "Asegurar que cada cobro diario en TKF queda correctamente facturado y registrado en Holded",
      "Beltrán",
      "Cada día laborable al cierre de caja",
      { tipo: "diario" },
      ["TKF", "Holded"],
      [
        paso("Acceder a TKF y revisar los cobros entrantes del día", 5),
        paso("Verificar que TKF ha generado automáticamente la factura o recibo para cada paciente", 5),
        paso("Entrar en Holded y registrar el ingreso creando el contacto del paciente (si es nuevo) y su factura correspondiente", 10),
        paso("Comprobar que el total facturado en Holded coincide exactamente con el total cobrado en TKF ese día", 5),
      ],
      "Si hay una discrepancia entre TKF y Holded, anotar el desfase, revisar factura por factura y corregir antes del cierre del día. Si persiste, escalar a Gabi.",
    ),

    sop(
      "financiera",
      "Conciliación Diaria y Flujo de Caja",
      "Verificar que los movimientos bancarios reales coinciden con lo registrado en Holded y conocer el saldo real disponible",
      "Beltrán",
      "Cada día laborable, a primera hora",
      { tipo: "diario" },
      ["Banco online", "Holded"],
      [
        paso("Acceder a la banca online y revisar los movimientos (ingresos y gastos) del día anterior", 5),
        paso("Entrar en el módulo de Bancos/Conciliación de Holded", 3),
        paso("Emparejar cada ingreso que ha llegado al banco desde TKF con su factura de venta ya creada en Holded", 10),
        paso("Emparejar los cargos automáticos (suministros, software, etc.) con las facturas de gasto de los proveedores en Holded", 10),
        paso("Revisar el panel de Tesorería en Holded para confirmar el saldo real disponible de la clínica", 3),
      ],
      "Si un movimiento bancario no tiene factura asociada, crear una factura provisional y marcarla para revisión. Si la diferencia supera 100€, avisar a Gabi.",
    ),

    sop(
      "financiera",
      "Ciclo de Pagos y Nóminas",
      "Garantizar que proveedores, alquiler y nóminas se pagan correctamente y a tiempo",
      "Beltrán",
      "Semanal (facturas) + Día 10 (alquiler) + Última semana (nóminas)",
      { tipo: "semanal", diaSemana: 1 },
      ["Portales proveedores", "Email", "Banco online", "Holded"],
      [
        paso("Entrar a las plataformas de proveedores habituales y descargar las facturas del periodo", 15, "accion", { tipo: "semanal", diaSemana: 1 }),
        paso("Revisar la bandeja de entrada del email para descargar facturas enviadas por proveedores", 10, "accion", { tipo: "semanal", diaSemana: 1 }),
        paso("Subir todas las facturas de gasto a Holded", 10, "accion", { tipo: "semanal", diaSemana: 1 }),
        paso("Acceder al banco y emitir la transferencia manual para el pago del alquiler del estudio", 5, "accion", { tipo: "mensual", diaMes: 10 }),
        paso("Revisar y validar con la gestoría las nóminas del equipo", 20, "accion", { tipo: "mensual", semanaMes: "ultima" }),
        paso("Programar en el banco las transferencias de las nóminas para que el equipo cobre a tiempo", 10, "accion", { tipo: "mensual", semanaMes: "ultima" }),
      ],
      "Si un proveedor no ha enviado factura, reclamarla antes de pagar. Si la gestoría no envía las nóminas a tiempo, escalar a Gabi.",
    ),

    sop(
      "financiera",
      "Cierre Fiscal y Gestoría",
      "Asegurar que la documentación fiscal del trimestre está completa para que la gestoría pueda presentar los impuestos",
      "Beltrán",
      "Primera semana del trimestre (Enero, Abril, Julio, Octubre)",
      { tipo: "trimestral", mesesTrimestre: [1, 4, 7, 10], semanaMes: "primera" },
      ["Holded", "Google Drive", "Email"],
      [
        paso("Verificar en Holded que todas las facturas de ingresos y gastos del trimestre están registradas y conciliadas", 30),
        paso("Recopilar cualquier documento extra o ticket que no esté en Holded y subirlo a la carpeta de Google Drive de la gestoría", 15),
        paso("Enviar email a la gestoría confirmando que Holded está actualizado y Drive al día para que preparen los impuestos", 5),
        paso("Revisar y dar el OK a los borradores de los impuestos (IVA, IRPF) que envíe la gestoría antes de que los carguen en el banco", 15),
      ],
      "Si la gestoría detecta errores, corregir en Holded y reconfirmar antes de la fecha límite fiscal. Fechas límite: 20 de Ene/Abr/Jul/Oct.",
    ),

    sop(
      "financiera",
      "Compras y Control de Stock",
      "Garantizar que la clínica no se quede sin material y que cada compra quede correctamente documentada",
      "Beltrán",
      "Al notar falta de material o recibir aviso del equipo clínico",
      { tipo: "demanda" },
      ["Portales de compra", "Holded"],
      [
        paso("Revisar los avisos del equipo clínico sobre falta de material o detectar visualmente qué consumibles se están agotando", 5),
        paso("Recopilar los avisos de compras excepcionales de otros miembros del equipo", 5),
        paso("Acceder a los proveedores correspondientes y realizar los pedidos necesarios", 15),
        paso("Asegurar que al hacer la compra se solicita factura a nombre de la empresa y se envía al email de administración o se sube a Holded", 3),
        paso("Al recibir los paquetes, abrir y verificar que el material entregado coincide con el pedido y el albarán", 10),
      ],
      "Si el material recibido no coincide con el pedido, contactar al proveedor inmediatamente y documentar la incidencia.",
    ),

    /* ================================================================
       BLOQUE 2: OPERACIONES Y PERSONAS (7 procesos nuevos)
       ================================================================ */

    sop(
      "operativa",
      "Control de Vacaciones y Ausencias",
      "Garantizar la cobertura mínima de la clínica y gestionar las ausencias de forma ordenada",
      "Beltrán",
      "Al recibir una solicitud de vacaciones o una ausencia",
      { tipo: "demanda" },
      ["Laguna Time App"],
      [
        paso("Revisar las nuevas solicitudes de vacaciones o ausencias registradas por el equipo", 5),
        paso("Comprobar en el calendario general que la ausencia solicitada no deja al aula y a los pacientes sin la cobertura mínima necesaria", 10),
        paso("Aprobar o denegar la solicitud para que el empleado reciba la notificación", 3),
        paso("Si es baja médica o ausencia justificada: descargar el justificante y enviarlo a la gestoría para el control de nóminas", null, "condicional"),
      ],
      "Si la ausencia deja sin cobertura, buscar una reorganización interna antes de denegar. Si es urgencia médica, aprobar y reorganizar después.",
    ),

    sop(
      "operativa",
      "Gestión Documental de Pacientes (LOPD y Consentimientos)",
      "Asegurar que todo paciente nuevo tiene firmados los documentos legales antes de su primera sesión",
      "Ester",
      "Cada vez que se da de alta un nuevo paciente",
      { tipo: "diario" },
      ["Pipe"],
      [
        paso("Revisar las altas del día para identificar a los pacientes nuevos", 5),
        paso("Generar el paquete de bienvenida digital: LOPD, Descargo de Responsabilidad y Normas de la consulta", 5),
        paso("Enviar el paquete al paciente por email o WhatsApp mediante la plataforma de firma digital", 3),
        paso("Antes de que el paciente entre a consulta, verificar en el sistema que los tres documentos constan como firmados", 3),
        paso("Descargar los PDFs firmados y adjuntarlos en la ficha del paciente dentro del CRM o Holded", 5),
      ],
      "Si el paciente no ha firmado antes de la cita, informar al terapeuta y solicitar la firma presencial antes de iniciar. No se puede atender sin LOPD firmada.",
    ),

    sop(
      "administrativa",
      "Archivo de Documentación Legal de la Empresa",
      "Mantener toda la documentación legal de la empresa digitalizada, organizada y accesible en Google Drive",
      "Gabi",
      "Cada vez que se firma un nuevo contrato o llega un documento oficial",
      { tipo: "demanda" },
      ["Escáner", "Google Drive"],
      [
        paso("Escanear el documento físico en formato PDF (si llega en papel)", 5),
        paso("Nombrar el archivo de forma clara (Ej: AÑO-MES-DIA_Contrato_NombreProveedor)", 2),
        paso("Subir el documento a la subcarpeta correspondiente dentro de DOCUMENTACIÓN LEGAL CLÍNICA en Google Drive", 3),
        paso("Destruir el documento físico original (salvo que sea obligatorio conservarlo en papel, en cuyo caso archivar en el archivador físico de administración)", 2, "advertencia"),
      ],
      "Si no se tiene claro si un documento debe conservarse en papel, consultar con la gestoría antes de destruir.",
    ),

    sop(
      "administrativa",
      "Administración de Sistemas y Software",
      "Gestionar altas, bajas y permisos de usuarios en los sistemas de la clínica de forma segura",
      "Beltrán",
      "Al recibir una solicitud de alta, baja o cambio de rol",
      { tipo: "demanda" },
      ["Holded", "Pipe", "TKF"],
      [
        paso("Recibir la solicitud de alta, baja o modificación de un usuario del equipo", 2),
        paso("Entrar al panel de configuración del software correspondiente (Holded, CRM, etc.)", 3),
        paso("Crear el usuario nuevo y asignar únicamente los permisos estrictamente necesarios según su puesto", 10),
        paso("En caso de salida: bloquear el acceso y eliminar el usuario del sistema de forma inmediata para proteger los datos", null, "advertencia"),
      ],
      "Si un empleado sale de la empresa, los accesos deben cerrarse el mismo día. No esperar. Si hay duda sobre permisos, consultar con Gabi.",
    ),

    sop(
      "operativa",
      "Soporte Técnico Interno Básico",
      "Resolver fallos informáticos del equipo lo antes posible para no interrumpir la atención a pacientes",
      "Beltrán",
      "Cuando el equipo reporta un fallo informático",
      { tipo: "demanda" },
      [],
      [
        paso("Recibir el aviso del equipo sobre un fallo informático (ordenador, impresora, internet o caída del programa)", 2),
        paso("Realizar la comprobación de nivel 1: reiniciar el equipo, comprobar cables de red/corriente y verificar conexión a internet", 10),
        paso("Si el fallo no se soluciona en 10 minutos, contactar con el soporte técnico oficial del programa o proveedor de hardware", null, "condicional"),
        paso("Hacer seguimiento de la incidencia y mantener informado al equipo afectado hasta que se resuelva", null),
      ],
      "Si el fallo afecta a la atención de pacientes, priorizar la solución o buscar un equipo alternativo inmediatamente.",
    ),

    sop(
      "operativa",
      "Creación y Actualización de Procesos (SOPs)",
      "Estandarizar todas las tareas operativas para que cualquier miembro del equipo pueda ejecutarlas sin depender de una sola persona",
      "Gabi",
      "Al detectar un cuello de botella, un error recurrente o una nueva tarea",
      { tipo: "demanda" },
      ["Laguna Time App"],
      [
        paso("Identificar la tarea operativa que necesita ser estandarizada", 10),
        paso("Revisar con la persona que ejecuta actualmente la tarea para conocer el paso a paso real", 30),
        paso("Redactar el procedimiento en formato de checklist simple y directo", 20),
        paso("Guardar el documento en Procesos de Laguna Time App", 5),
        paso("Comunicar al equipo la existencia del nuevo proceso y asegurar que se empieza a aplicar", 10),
      ],
      "Si el proceso es crítico (afecta a pacientes o dinero), hacer una prueba piloto de 1 semana antes de darlo por definitivo.",
    ),

    sop(
      "comercial",
      "Lanzamiento de Nuevos Servicios",
      "Coordinar todas las áreas necesarias para que un nuevo servicio se lance de forma organizada y sin cabos sueltos",
      "Gabi",
      "Al iniciar la planificación de un nuevo servicio o producto",
      { tipo: "demanda" },
      ["Laguna Time App", "Notion"],
      [
        paso("Crear un tablero de proyecto específico para el nuevo servicio", 15),
        paso("Dividir el lanzamiento en resultados (Contenido, Webinar, Campaña de Marketing)", 20),
        paso("Asignar cada tarea a su responsable correspondiente con una fecha de entrega límite", 15),
        paso("Hacer una reunión de seguimiento semanal para revisar el estado de las tareas", null, "nota"),
        paso("Validar que todas las áreas están listas (operativa, legal y comercial) antes de dar luz verde al lanzamiento oficial", 30),
      ],
      "Si un área no está lista en la fecha prevista, no lanzar. Reprogramar con al menos 1 semana de margen.",
    ),

    /* ================================================================
       BLOQUE 3: ÁREA COMERCIAL (6 procesos)
       ================================================================ */

    sop(
      "comercial",
      "Estrategia Comercial y Diseño de Ofertas",
      "Crear ofertas comerciales atractivas con estrategia de upselling y cross-selling para maximizar ingresos por paciente",
      "Gabi",
      "Cada vez que se lanza o actualiza un servicio",
      { tipo: "demanda" },
      ["TKF", "Notion", "Pipe", "Web"],
      [
        paso("Analizar los servicios actuales de la clínica para detectar oportunidades de nuevos paquetes o mejoras", 30),
        paso("Diseñar la oferta comercial definiendo nombre, precio, beneficios y condiciones del tratamiento", 45),
        paso("Diseñar la estrategia de upselling (servicio superior) y cross-selling (servicios complementarios) para la nueva oferta", 30),
        paso("Volcar toda la información en el sistema para que esté lista para su venta automatizada", 15),
      ],
      "Si la oferta no tiene un margen mínimo viable, no publicar. Revisarla con datos de coste real antes de lanzar.",
    ),

    sop(
      "comercial",
      "Cierre de Ventas y Automatizaciones por Email",
      "Nutrir leads con secuencias automáticas de email y cerrar ventas de forma sistemática",
      "Gabi",
      "Semanal (revisión) y al crear nuevas campañas",
      { tipo: "semanal", diaSemana: 1 },
      ["Pipe"],
      [
        paso("Configurar las secuencias de correos automáticos para nutrir a los nuevos leads", 30),
        paso("Redactar y programar los emails diseñados para el cierre de ventas directo", 45),
        paso("Configurar los correos automáticos de upselling y cross-selling post-compra", 30),
        paso("Revisar semanalmente que todas las automatizaciones están activas y sin errores", 15),
        paso("Dar respuesta manual por email a interesados con dudas específicas que la automatización no resuelve", 20),
      ],
      "Si una automatización tiene tasa de rebote superior al 5%, desactivarla y revisar la lista de contactos antes de reenviar.",
    ),

    sop(
      "comercial",
      "Respuesta a Interesados por WhatsApp",
      "Atender a todo interesado que escriba por WhatsApp de forma rápida, profesional y estandarizada",
      "Helen",
      "Revisión constante durante horario laboral",
      { tipo: "diario" },
      ["WhatsApp"],
      [
        paso("Abrir WhatsApp Business y revisar todos los mensajes entrantes sin leer", 5),
        paso("Identificar si quien escribe es un paciente actual (duda operativa) o un lead (nuevo interesado)", 3),
        paso("Responder a los interesados utilizando las respuestas rápidas guardadas (precios, links de TKF, ubicación, horarios)", 10),
        paso("Si el interesado no compra directamente, crear su ficha con nombre y teléfono en WhatsApp", 5),
      ],
      "Si un interesado solicita información clínica especializada, derivar al profesional correspondiente antes de responder.",
    ),

    sop(
      "comercial",
      "Respuesta a Interesados por Llamada Telefónica",
      "Convertir llamadas entrantes en reservas o registros de leads para seguimiento comercial",
      "Beltrán",
      "Cada vez que hay un mensaje en el buzón de voz",
      { tipo: "demanda" },
      ["WhatsApp"],
      [
        paso("Configurar el buzón de voz con mensaje profesional", 5),
        paso("Escuchar la necesidad del potencial paciente y explicar los servicios correspondientes vía WhatsApp", 10),
        paso("Derivar a la persona al proceso de compra o cerrar la compra por WhatsApp", 10),
        paso("Si no finaliza la compra, registrar sus datos y agregarle a una secuencia en PIPE o como trata", 5),
      ],
      "Si la consulta es urgente o clínica, derivar directamente al profesional sanitario sin intentar cerrar venta.",
    ),

    sop(
      "comercial",
      "Gestión de CRM y Seguimiento de No Convertidos",
      "Mantener el embudo de ventas limpio y activo, asegurando que ningún lead interesado se pierde por falta de seguimiento",
      "Gabi",
      "Todos los lunes",
      { tipo: "semanal", diaSemana: 1 },
      ["Pipe"],
      [
        paso("Entrar a PIPE y revisar la columna de Nuevos Leads introducidos por el equipo", 10),
        paso("Mover las tarjetas de pacientes no convertidos a la etapa del embudo según la última interacción", 15),
        paso("Programar tareas de seguimiento para reconectar con leads indecisos (secuencia de email específica)", 15),
        paso("Descartar (marcar como Perdido) leads que lleven más de X tiempo sin responder, indicando el motivo", 10),
      ],
      "Si un lead marcado como perdido reaparece, reactivarlo inmediatamente y priorizar su atención.",
    ),

    sop(
      "comercial",
      "Medición de Ratios de Conversión",
      "Conocer exactamente cuántos interesados se convierten en clientes y la salud de las automatizaciones de email",
      "Gabi",
      "Primeros días de cada mes",
      { tipo: "mensual", diaMes: 1 },
      ["Pipe"],
      [
        paso("Extraer el informe de rendimiento mensual desde los paneles de PIPE", 10),
        paso("Contabilizar el número total de leads nuevos que entraron en el mes", 10),
        paso("Contabilizar cuántos de esos leads terminaron comprando (clientes ganados)", 10),
        paso("Calcular el ratio de conversión: (Clientes Ganados / Leads Totales) × 100", 5),
        paso("Extraer las métricas de apertura y clics de las automatizaciones de email", 10),
        paso("Registrar todos los datos en el documento de analítica mensual para la toma de decisiones", 15),
      ],
      "Si el ratio de conversión cae por debajo del objetivo, convocar reunión extraordinaria para revisar el embudo completo.",
    ),

    // ── Marketing y Publicidad ──

    sop(
      "comercial",
      "Creación de Páginas Web, Landings y Embudos",
      "Diseñar y publicar páginas de captación o venta que estén perfectamente conectadas con el embudo de marketing",
      "Gabi",
      "Cada vez que se lanza un nuevo servicio, infoproducto o captación de leads",
      { tipo: "demanda" },
      ["Web", "Pipe"],
      [
        paso("Recibir o definir la oferta comercial y el objetivo de la página (captar emails, vender consulta, etc.)", 15),
        paso("Diseñar y montar la landing page asegurando que el diseño es responsive (se ve bien en móvil)", 60),
        paso("Crear e integrar los formularios de captación en la web", 20),
        paso("Conectar el formulario con la plataforma de email marketing para que los leads entren directamente en la base de datos", 15),
        paso("Hacer una prueba real (rellenar el formulario uno mismo) para comprobar que la página funciona, el lead se registra y salta la automatización correspondiente", 10),
      ],
      "Si el formulario no conecta correctamente con la plataforma de email, revisar la integración antes de publicar. No lanzar nunca una landing sin haberla probado.",
    ),

    sop(
      "comercial",
      "Estrategia de Contenido y Marca Personal",
      "Planificar mensualmente los temas, formatos y calendario editorial alineados a los objetivos comerciales",
      "Gabi",
      "Primer lunes de cada mes",
      { tipo: "mensual", diaMes: 1 },
      ["Notion", "Calendar"],
      [
        paso("Definir los objetivos de marketing del mes (ej. potenciar un tratamiento específico o ganar autoridad en un tema)", 20),
        paso("Diseñar la estrategia de contenido alineada a esos objetivos (qué temas se van a tratar)", 30),
        paso("Redactar o supervisar los guiones de los vídeos que grabará Goosen con Beltrán para edición con Marcos", 40),
        paso("Crear el calendario editorial del mes asignando fechas y temáticas, y compartirlo con Patri para que pueda empezar a producir", 20),
      ],
      "Si no hay objetivos comerciales claros para el mes, reunirse con el equipo para definirlos antes de crear contenido sin dirección.",
    ),

    sop(
      "comercial",
      "Creación y Gestión de Redes Sociales",
      "Producir y publicar contenido semanal en redes, y gestionar diariamente la interacción con la comunidad",
      "Patri",
      "Semanal (creación) y diario (gestión de comunidad)",
      { tipo: "semanal", diaSemana: 1 },
      ["Canva", "Metricool", "YouTube"],
      [
        paso("Revisar el calendario editorial mensual definido por Gabi", 10),
        paso("Diseñar las creatividades gráficas (imágenes, carruseles, portadas de Reels) para las redes sociales", 60),
        paso("Redactar el copy que acompañará a cada publicación, incluyendo CTAs y hashtags relevantes", 30),
        paso("Dejar el contenido programado en la herramienta de gestión de redes sociales para toda la semana", 15),
        paso("Revisar diariamente las redes para interactuar con la comunidad (likes, responder dudas rápidas)", 10),
      ],
      "Si no hay calendario editorial disponible, contactar a Gabi para obtenerlo antes de producir contenido sin dirección estratégica.",
    ),

    sop(
      "comercial",
      "Captación de Pacientes vía Ads",
      "Gestionar campañas de publicidad digital para atraer nuevos pacientes de forma rentable",
      "Gabi",
      "Cuando se decida activar inversión publicitaria",
      { tipo: "demanda" },
      ["Meta Ads Manager", "Google Ads", "Excel"],
      [
        paso("[FUTURO] Definir el presupuesto mensual a invertir en publicidad", 15),
        paso("[FUTURO] Crear las campañas en Meta Ads o Google Ads utilizando el contenido de Patri y los vídeos de Marcos", 60),
        paso("[FUTURO] Dirigir el tráfico de los anuncios hacia las landings creadas por Gabi", 15),
        paso("[FUTURO] Revisar métricas semanalmente (CPL, ROI) y optimizar o apagar los anuncios no rentables", 20),
      ],
      "Si el CPL supera el umbral definido, pausar la campaña y analizar antes de seguir invirtiendo.",
    ),

    /* ================================================================
       BLOQUE 4: CLÍNICA OPERATIVA (8 procesos)
       ================================================================ */

    sop(
      "operativa",
      "Estudio Médico y Resolución de Casos",
      "Aportar el criterio médico y definir los tratamientos según los datos del paciente",
      "Goosen",
      "Cuando revisa los mapas generados por el motor clínico",
      { tipo: "demanda" },
      ["Motor Clínico"],
      [
        paso("Revisión de los formularios (Diagnóstico, Bioquímico, Microbiológico, Antiestrés, Detox o SANA)", 15),
        paso("Revisión de los mapas (Diagnóstico, Bioquímico, Microbiológico, Antiestrés, Detox o SANA)", 15),
        paso("Revisión de la clínica del paciente y del motor clínico", 10),
        paso("Dictaminar si el tratamiento o la pauta a seguir es correcto o si es necesario crear alguno", 15),
        paso("Registrar las conclusiones médicas en el sistema y notificar a Gabi de que el estudio está listo", 5),
      ],
      "Si hay dudas clínicas graves, no dictaminar solo: convocar sesión clínica con Gabi antes de notificar.",
    ),

    sop(
      "operativa",
      "Creación de Protocolos Médicos",
      "Documentar el estándar científico de la clínica",
      "Goosen",
      "Al incorporar un nuevo tratamiento, suplemento o avance médico",
      { tipo: "demanda" },
      ["Motor Clínico"],
      [
        paso("Redactar el documento detallando posologías, contraindicaciones y uso del tratamiento", 30),
        paso("Guardar el protocolo en la base de datos oficial", 5),
        paso("Notificar a Gabi (para Motor Clínico) y a Beltrán (para Bots de Telegram) de que hay un nuevo protocolo a implementar", 5),
      ],
      "Si el protocolo afecta a tratamientos ya en curso, avisar también a Ester para que coordine la transición con los pacientes activos.",
    ),

    sop(
      "operativa",
      "Preparación de Sesión Clínica Grupal",
      "Crear el contenido médico para el directo semanal",
      "Gabi",
      "Semanal (48h antes del directo)",
      { tipo: "semanal", diaSemana: 3 },
      ["Aula TKF"],
      [
        paso("Seleccionar la temática o caso de estudio para la semana", 15),
        paso("Preparar el material de apoyo (diapositivas o guiones)", 45),
        paso("Enviar la documentación al equipo de soporte/audiovisual para que la suban al Aula (TKF) antes del directo", 5),
      ],
      "Si no hay caso de estudio disponible, preparar una sesión temática de repaso o Q&A con preguntas de pacientes.",
    ),

    sop(
      "operativa",
      "Desarrollo de Mapa Cero (Inicio)",
      "Procesar la entrada de los nuevos pacientes",
      "Patri",
      "Cuando un paciente nuevo (Semana 1) completa el Formulario de Alta",
      { tipo: "demanda" },
      ["Motor Clínico"],
      [
        paso("Recibir el aviso de nuevo Formulario de Alta completado", 2),
        paso("Introducir las variables en el Motor Clínico", 15),
        paso("Generar la estructura del Mapa Cero", 10),
        paso("Marcar el Mapa Cero como 'Listo para Revisión' para que pase a la bandeja de Claudia", 2),
      ],
      "Si faltan datos en el formulario de alta, contactar al paciente antes de generar el mapa. No generar mapas con datos incompletos.",
    ),

    sop(
      "operativa",
      "Desarrollo de Mapas Clínicos Avanzados",
      "Enviar sus Mapas clínicos al paciente",
      "Patri",
      "Cuando llegan los formularios",
      { tipo: "demanda" },
      ["Motor Clínico"],
      [
        paso("Leer y revisar los mapas", 10),
        paso("Corregir errores en el Motor Clínico", 10),
        paso("Generar el mapa correspondiente (Diagnóstico, Bioquímico, Microbiológico, Antiestrés, Detox, Sintomático o SANA)", 15),
        paso("Marcar el Mapa como 'Listo para Revisión' para que pase a la bandeja de Claudia", 2),
      ],
      "Si se detectan incoherencias graves en los datos del paciente, escalar a Goosen antes de generar el mapa.",
    ),

    sop(
      "operativa",
      "Coordinación de Tiempos Clínicos",
      "Evitar cuellos de botella en la cadena de montaje",
      "Ester",
      "Diario (15 minutos al empezar la jornada)",
      { tipo: "diario" },
      ["Motor Clínico"],
      [
        paso("Revisar el panel del Motor clínico", 5),
        paso("Verificar que no hay pacientes atascados en la Semana 1 o Semana 10", 5),
        paso("Identificar si el tapón está en el paciente (no envió la analítica), en Goosen (estudio pendiente) o en Claudia (envío pendiente) y enviar un recordatorio al responsable", 5),
      ],
      "Si un paciente lleva más de 5 días atascado, escalar directamente a Gabi para decidir acción.",
    ),

    sop(
      "operativa",
      "Control de Calidad y Envío al Paciente",
      "Ser el filtro final de excelencia antes de que el paciente reciba algo",
      "Claudia",
      "Cuando se marca un Mapa como 'Listo para Revisión'",
      { tipo: "demanda" },
      ["Motor Clínico", "Pipe"],
      [
        paso("Abrir el Mapa generado en el Motor Clínico", 2),
        paso("Revisar la coherencia de los textos, que el formato sea correcto y que no falte ningún adjunto", 10),
        paso("Enviar al paciente por Pipe con plantilla", 5),
        paso("Cambiar el estado del paciente en PIPE a 'Mapa Entregado'", 2),
      ],
      "Si se detecta un error en el mapa, devolver a Patri con nota específica del error. No enviar nunca un mapa con errores al paciente.",
    ),

    sop(
      "operativa",
      "Protocolo de Seguridad del Paciente",
      "Garantizar que los datos médicos no sufren brechas",
      "Claudia",
      "Mensual",
      { tipo: "mensual", diaMes: 1 },
      ["Motor Clínico", "Pipe"],
      [
        paso("Auditar aleatoriamente 5 historias clínicas recientes en PIPE y Motor Clínico", 15),
        paso("Comprobar que no hay analíticas ni datos sensibles circulando por WhatsApp personal o correos no encriptados", 10),
        paso("Revisar que los accesos al Motor Clínico son solo de personal autorizado (altas/bajas recientes)", 5),
        paso("Registrar la revisión mensual en el documento de cumplimiento normativo (LOPD)", 5),
      ],
      "Si se detecta una brecha de seguridad, notificar inmediatamente a Gabi y documentar el incidente para cumplimiento LOPD.",
    ),

    /* ================================================================
       BLOQUE 5: DISEÑO DE SERVICIOS E INFOPRODUCTOS (4 procesos)
       ================================================================ */

    sop(
      "comercial",
      "Diseño y Conceptualización de Servicios Clínicos",
      "Definir qué se va a vender, a quién y cómo se empaqueta antes de que el médico cree la pauta",
      "Gabi",
      "Decisión estratégica de crear un nuevo tratamiento o mejorar uno existente",
      { tipo: "demanda" },
      ["Notion"],
      [
        paso("Definir el objetivo comercial del nuevo servicio y el perfil del paciente ideal al que va dirigido", 20),
        paso("Estructurar el 'paquete' del servicio: qué incluye (analíticas, mapas, seguimiento) y su duración estimada", 30),
        paso("Establecer el precio de venta y las condiciones comerciales", 15),
        paso("Redactar el documento de 'Ficha de Producto' con toda esta información", 20),
        paso("Enviar la Ficha de Producto a Goosen para que inicie la creación del protocolo médico correspondiente", 5),
      ],
      "No lanzar ningún servicio sin Ficha de Producto validada. Si no hay protocolo médico de Goosen, no se puede vender.",
    ),

    sop(
      "comercial",
      "Conceptualización de Infoproductos",
      "Diseñar el esqueleto y la estrategia del nuevo curso o programa digital",
      "Gabi",
      "Aprobación de la idea de un nuevo curso o programa digital",
      { tipo: "demanda" },
      ["Notion"],
      [
        paso("Definir la promesa de valor del curso (qué transformación o aprendizaje logrará el alumno)", 20),
        paso("Crear el índice detallado del programa: módulos, lecciones y orden lógico del aprendizaje", 45),
        paso("Definir el formato de cada lección (Vídeo, Texto, PDF descargable, Test)", 15),
        paso("Guardar la estructura en una carpeta de proyecto compartida", 5),
        paso("Notificar a Patri y entregarle el índice para que comience a rellenar el contenido", 5),
      ],
      "No empezar a producir contenido sin un índice validado por Gabi. Si la promesa de valor no está clara, redefinir antes de avanzar.",
    ),

    sop(
      "comercial",
      "Creación y Desarrollo de Contenido de Infoproductos",
      "Transformar el índice en material didáctico real y atractivo",
      "Patri",
      "Recepción del índice estructurado por Gabi",
      { tipo: "demanda" },
      ["Canva", "Google Drive"],
      [
        paso("Revisar el índice del curso entregado por Gabi", 10),
        paso("Investigar, recopilar la información y redactar el texto, guion o temario de cada lección individual", 120),
        paso("Diseñar el material de apoyo visual necesario (material, guiones de audios, hojas de ejercicios)", 60),
        paso("Si requiere grabación de vídeo: entregar guiones a Beltrán", null, "condicional"),
        paso("Recopilar todos los archivos finales y organizarlos por carpetas (Módulo 1, Módulo 2, etc.)", 15),
        paso("Notificar a Beltrán de que el material está finalizado y listo para subir", 5),
      ],
      "Si hay dudas sobre el enfoque de una lección, consultar con Gabi antes de producir para no rehacer trabajo.",
    ),

    sop(
      "comercial",
      "Configuración y Publicación en TKF",
      "Montar el curso en la plataforma para que esté listo para la venta y el consumo",
      "Beltrán",
      "Notificación de Patri con la carpeta de contenidos finales",
      { tipo: "demanda" },
      ["TKF"],
      [
        paso("Iniciar sesión como administrador en Thinkific (TKF)", 2),
        paso("Crear el esqueleto del nuevo curso (Módulos y Lecciones vacías según el índice)", 15),
        paso("Subir los archivos correspondientes a cada lección (vídeos, textos, PDFs)", 30),
        paso("Configurar los ajustes del curso: nombre, descripción, portada y precio/vinculación de pago", 10),
        paso("Realizar una prueba de usuario (entrar como alumno) para verificar que funciona correctamente", 10),
        paso("Publicar el curso y notificar a Gabi de que el enlace de venta ya está operativo", 5),
      ],
      "No publicar nunca un curso sin hacer la prueba de usuario completa. Si hay errores, corregir antes de publicar.",
    ),

    /* ================================================================
       BLOQUE 6: TECNOLOGÍA Y MEJORA CONTINUA (3 procesos)
       ================================================================ */

    sop(
      "operativa",
      "Desarrollo y Mantenimiento Tecnológico (Motor Clínico)",
      "Evolucionar la herramienta principal y asegurar que todas las plataformas se integran de forma automática",
      "Gabi",
      "Detección de una necesidad operativa o reporte de un fallo complejo",
      { tipo: "demanda" },
      ["Motor Clínico"],
      [
        paso("Identificar la necesidad de una nueva función o integración entre herramientas", 15),
        paso("Diseñar la arquitectura lógica de la nueva función o integración", 30),
        paso("Programar y desarrollar la mejora en un entorno de pruebas aislado", null),
        paso("Realizar pruebas de usuario (testear con datos falsos) para validar que funciona al 100%", 15),
        paso("Desplegar la actualización en el entorno real de trabajo", 10),
        paso("Notificar al equipo implicado sobre el cambio y cómo usar la nueva función", 10),
      ],
      "Nunca desplegar en producción sin probar en entorno aislado. Si algo falla tras desplegar, revertir inmediatamente.",
    ),

    sop(
      "operativa",
      "Optimización de Procesos Internos (Mejora Continua)",
      "Auditar la operativa para que funcione más rápido y con menos errores",
      "Gabi",
      "Revisión trimestral o cuando un proceso empieza a fallar constantemente",
      { tipo: "trimestral", mesesTrimestre: [1, 4, 7, 10], semanaMes: "primera" },
      ["Laguna Time App"],
      [
        paso("Analizar el flujo de trabajo de las distintas áreas buscando fugas de tiempo", 30),
        paso("Identificar si el problema es humano (falta de formación) o tecnológico (falta una automatización)", 15),
        paso("Si es tecnológico, diseñar la solución para eliminar la tarea manual repetitiva", 30, "condicional"),
        paso("Implementar el cambio operativo en la clínica", null),
        paso("Actualizar el SOP correspondiente y reentrenar a la persona afectada", 15),
      ],
      "Si el cambio afecta a más de 2 personas, hacer sesión de formación grupal en vez de individual.",
    ),

    sop(
      "comercial",
      "Testeo de Nuevas Líneas de Negocio",
      "Probar ideas nuevas gastando el mínimo tiempo y dinero antes de hacerlas oficiales",
      "Gabi",
      "Idea estratégica de Dirección aprobada para experimentar",
      { tipo: "demanda" },
      ["Web", "Pipe"],
      [
        paso("Definir el Producto Mínimo Viable (MVP) de la nueva idea", 30),
        paso("Montar el circuito tecnológico básico de prueba (landing, link de pago, formulario)", 60),
        paso("Lanzar el servicio Beta a un segmento pequeño de pacientes actuales", 15),
        paso("Recopilar datos de ventas, carga de trabajo y feedback de los pacientes Beta", 30),
        paso("Presentar resultados a Dirección para decidir si se descarta, mejora o lanza oficialmente", 20),
      ],
      "No invertir más de 2 semanas ni presupuesto significativo en un MVP. Si los datos no son prometedores, descartar rápido.",
    ),

    /* ================================================================
       BLOQUE 7: AUDIOVISUAL (3 procesos)
       ================================================================ */

    sop(
      "comercial",
      "Grabación de Contenido (Bruto)",
      "Capturar el vídeo y el audio con la máxima calidad y asegurar que el material llega a edición",
      "Beltrán",
      "Día y hora fijados en el calendario para sesión de grabación",
      { tipo: "demanda" },
      ["Cámara", "Google Drive"],
      [
        paso("Preparar el set de grabación: encuadrar cámara, ajustar iluminación y comprobar micrófonos", 15),
        paso("Hacer una prueba de grabación de 10 segundos y revisarla antes de empezar", 3),
        paso("Grabar las tomas necesarias siguiendo el guion preparado por Gabi", null),
        paso("Extraer las tarjetas de memoria y descargar los archivos originales en el ordenador", 10),
        paso("Subir los archivos originales a la subcarpeta '1_BRUTO_POR_EDITAR' en Google Drive de Audiovisuales", 10),
        paso("Enviar mensaje a Marcos confirmando que el material bruto está subido y listo", 2),
      ],
      "Si la prueba de grabación muestra problemas de audio o imagen, no empezar a grabar hasta resolverlo.",
    ),

    sop(
      "comercial",
      "Edición y Postproducción",
      "Transformar las tomas en bruto en piezas dinámicas listas para publicar",
      "Marcos",
      "Notificación de Beltrán de que hay material nuevo en '1_BRUTO_POR_EDITAR'",
      { tipo: "demanda" },
      ["Premiere", "Google Drive"],
      [
        paso("Descargar los archivos de vídeo y audio de la carpeta correspondiente en Google Drive", 10),
        paso("Editar el vídeo según las indicaciones o formato requerido (vertical para Reels, horizontal para YouTube/Cursos)", null),
        paso("Añadir subtítulos, grafismos, logotipos y corrección de color según la identidad visual", null),
        paso("Exportar los archivos finales en alta calidad", 10),
        paso("Subir los vídeos terminados a '2_EDITADOS_FINALES' en Google Drive", 10),
        paso("Enviar mensaje a Patri avisando de que los vídeos están listos para distribución", 2),
      ],
      "Si las indicaciones de formato no están claras, consultar con Gabi antes de editar para no rehacer trabajo.",
    ),

    sop(
      "comercial",
      "Distribución y Organización de Archivo Audiovisual",
      "Hacer que el contenido llegue a la audiencia y mantener el Drive ordenado",
      "Patri",
      "Notificación de Marcos de que hay vídeos nuevos en '2_EDITADOS_FINALES'",
      { tipo: "demanda" },
      ["Google Drive", "Metricool"],
      [
        paso("Descargar los vídeos finales editados por Marcos desde Google Drive", 5),
        paso("Revisar el calendario editorial para saber qué copy y hashtags acompañan al vídeo", 5),
        paso("Subir y programar la publicación en las redes sociales correspondientes", 15),
        paso("Mover el archivo de vídeo de '2_EDITADOS_FINALES' a '3_ARCHIVO_PUBLICADOS' en Google Drive", 3),
        paso("Opcional: borrar el material bruto original si han pasado más de 30 días y el vídeo final está publicado", 5, "nota"),
      ],
      "No publicar sin revisar el calendario editorial. Si no hay copy asignado, contactar a Gabi antes de publicar.",
    ),
  ];
}
