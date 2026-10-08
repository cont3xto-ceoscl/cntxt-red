import datetime

from django.core.management.base import BaseCommand
from django.db import connection, transaction

from okr.models import ActionItem, CheckIn, Cycle, KeyResult, Kpi, Line, LineCyclePlan, Objective

LINES = [
    dict(code="neo", name="N.E.O.", full_name="Visión, Identidad y Estrategia", color_hex="#C9A24B", order=1),
    dict(code="idi", name="I.D.I.", full_name="Innovación y Experiencia", color_hex="#A67C52", order=2),
    dict(code="red", name="R.E.D.", full_name="Relacionamiento, Expansión y Diseño", color_hex="#C9645A", order=3),
    dict(code="cash", name="C.A.S.H.", full_name="Sistema financiero / comercial", color_hex="#7C9463", order=4),
    dict(code="cor", name="C.O.R.", full_name="Calidad, Orden y Resultado", color_hex="#B5998B", order=5),
    dict(code="bons", name="B.O.N.S.", full_name="Operación Administrativa y Jurídica", color_hex="#6E8FA6", order=6),
]

# Cada objetivo: code, title, description, is_backlog(opcional), krs: [...]
# Cada KR: tag_label, text, evolution_tag(opcional), status_note(opcional),
#          extra_note(opcional), kpis: [(name, current, target, unit)], actions: [str,...]

PLANS = {
    "neo": dict(
        status="definido",
        deliverable="CNTXT Visual CODE V1 (Design System)",
        intro_text="Confirmado como objetivo de N.E.O., liderado por Dirección Creativa (CCO).",
        lead_label="Dirección Creativa (CCO)",
        summary_text=(
            "El objetivo central de N.E.O. este semestre es adoptar y comunicar el núcleo "
            "estratégico organizacional de CNTXT como el sistema que orienta las decisiones de "
            "mayor impacto, incrementando la rentabilidad consciente, la selección estratégica de "
            "proyectos y una expansión internacional con propósito, mientras consolidamos una "
            "metodología integral que amplíe la línea de vida de cada proyecto y sumado a visiones "
            "multidisciplinares eleven el valor percibido por el cliente y refuercen la "
            "deseabilidad de CNTXT como una marca referente, profunda y con proyección "
            "internacional."
        ),
        objectives=[
            dict(
                code="O.T.1",
                title="Construir el Design System CNTXT en Claude Design",
                description="Objetivo Estratégico · Organizacional.",
                krs=[
                    dict(
                        tag_label="NEO_VCD",
                        text="Construyendo el Visual CODE V1 CNTXT como el Sistema de Diseño que Garantiza la Coherencia de la Marca.",
                        evolution_tag="nuevo", status_note="Ventana: Julio",
                        kpis=[("% de construcción e implementación del Visual CODE V1", 100, 100, "%")],
                        actions=[
                            "Realizar una auditoría integral de los activos gráficos actuales (físicos, digitales y web), identificando oportunidades de mejora e inconsistencias.",
                            "Definir los tokens fundacionales del sistema: paleta cromática, tipografía, espaciados, grillas, radios, sombras, iconografía y principios de motion.",
                            "Construir la librería de componentes base en Claude Design (botones, tarjetas, encabezados, badges, layouts y elementos del sistema).",
                            "Documentar el Visual CODE V1, estableciendo reglas de uso, ejemplos de aplicación (Do / Don't) y criterios de evolución para futuras versiones.",
                        ],
                    ),
                    dict(
                        tag_label="NEO_TLB",
                        text="Construyendo la Template Library CNTXT como el Sistema de Plantillas Multicanal para Escalar la Producción de Activos de Marca.",
                        evolution_tag="nuevo", status_note="Ventana: Julio",
                        kpis=[("Plantillas oficiales construidas e implementadas", 8, 20, "")],
                        actions=[
                            "Priorizar los canales de mayor impacto para la construcción de la biblioteca: Pitch Deck, presentaciones comerciales, fichas de proyecto, Instagram, propuestas comerciales y componentes web.",
                            "Diseñar la Template Library CNTXT mediante plantillas parametrizables desarrolladas en Claude Design y alineadas con el Visual CODE V1 (categorías: Pitch Decks, Presentaciones, Redes Sociales, Documentos y propuestas, Componentes web, Fichas de proyecto, Eventos y experiencias).",
                            "Implementar un repositorio central que concentre todas las plantillas oficiales, garantizando acceso, organización y control de versiones.",
                            "Versionar y clasificar cada template según su propósito, canal y unidad de negocio (CNTXT Made, CNTXT Select y Corporativo), facilitando su adopción y evolución.",
                        ],
                    ),
                    dict(
                        tag_label="NEO_VCA",
                        text="Consolidando la Adopción del Visual CODE como el Estándar Visual de Toda la Organización.",
                        evolution_tag="nuevo", status_note="Ventana: Julio – Septiembre",
                        kpis=[("% de activos de marca desarrollados con el Visual CODE", 0, 80, "%")],
                        actions=[
                            "Capacitar al equipo en el uso del Visual CODE V1 y la Template Library, asegurando una adopción consistente en todas las áreas.",
                            "Definir el modelo de gobernanza del sistema, estableciendo responsables de aprobación, criterios de versionado y una cadencia de actualización.",
                            "Implementar auditorías quincenales para medir el porcentaje de activos de marca alineados con el Visual CODE e identificar oportunidades de mejora.",
                            "Ejecutar un ciclo continuo de evolución del sistema, incorporando aprendizajes, retroalimentación del equipo y nuevas necesidades de la organización.",
                        ],
                    ),
                ],
            ),
        ],
    ),
    "idi": dict(
        status="definido",
        intro_text=(
            "“Si Q1 fue construcción y Q2 fue descubrimiento, este semestre (Q3-Q4) es "
            "consolidación.” Todos los KR arrancan en 0% — semestre recién iniciado "
            "(01-jul-2026), con horizonte a diciembre de 2026. Dirección: Juan Esteban."
        ),
        lead_label="Juan Esteban",
        summary_text=(
            "El objetivo central de I.D.I. este semestre es convertir a Central en el sistema "
            "operativo real de CNTXT — el lugar donde vive la gestión de proyectos, el flujo "
            "comercial (Briefs y Proposal Creator) y el seguimiento de OKRs de toda la oficina — "
            "mientras se abre su primera fase de cara al cliente y se consolida la infraestructura "
            "digital de la firma en un VPS propio, cerrando la fragmentación entre plataformas "
            "(Wix, Hostgator, Vercel). En paralelo, se sientan las bases para revisar y mejorar los "
            "servicios existentes y para que, por primera vez, CNTXT tome decisiones a partir de "
            "datos reales de sus activos digitales."
        ),
        closing_quote_label="Intención del semestre — I.D.I.",
        closing_quote=(
            "Si Q1 fue construcción y Q2 fue descubrimiento, este semestre (Q3-Q4) es "
            "consolidación. Tenemos los productos, la infraestructura empezando, y el equipo casi "
            "adentro. Estos seis meses se tratan de cerrar los ciclos abiertos, convertir "
            "herramientas en hábitos, y empezar a escuchar los datos."
        ),
        objectives=[
            dict(
                code="O1",
                title="Convertir Central en la herramienta principal de gestión de proyectos de CNTXT",
                description=(
                    "Que la operación diaria de CNTXT — equipo, proyectos activos, flujo comercial "
                    "(Briefs y Proposal Creator) y seguimiento de OKRs por línea — viva dentro de "
                    "Central, no repartida entre WhatsApp, Excel y documentos sueltos."
                ),
                krs=[
                    dict(
                        tag_label="KR 1 · Adopción COR",
                        text="Lograr la adopción de Central por parte del equipo operativo (COR).",
                        status_note="Por iniciar",
                        kpis=[("Roles operativos capacitados (Líderes, Supports y Juniors)", 0, 6, "")],
                        actions=[
                            "Diseñar el plan de capacitación.", "Capacitar a Líderes.", "Capacitar a Supports.",
                            "Capacitar a Juniors.", "Crear material de apoyo y documentación.",
                            "Resolver dudas y realizar seguimiento a la adopción.",
                        ],
                    ),
                    dict(
                        tag_label="KR 2 · Realidad operativa",
                        text="Mantener la realidad operativa de los proyectos actualizada en Central.",
                        status_note="Por iniciar",
                        kpis=[
                            ("Proyectos activos registrados en Central", 0, 100, "%"),
                            ("Proyectos activos actualizados por el equipo COR", 0, 100, "%"),
                        ],
                        actions=[
                            "Definir el estándar de actualización de proyectos.", "Migrar los proyectos activos a Central.",
                            "Establecer responsables de actualización.", "Implementar revisiones periódicas de la información.",
                            "Crear alertas para proyectos desactualizados.",
                        ],
                    ),
                    dict(
                        tag_label="KR 3 · Flujo comercial",
                        text="Integrar el flujo comercial de Briefs y Proposal Creator en Central.",
                        status_note="Base creada en Q2",
                        extra_note=(
                            "Briefs y Proposal Creator ya existen como apps independientes "
                            "(ProjectBriefs y Creador de Propuestas, con formatos Casa de Diseño y "
                            "Partners). Este semestre los integra dentro de Central y los pone en "
                            "uso real por el equipo comercial."
                        ),
                        kpis=[
                            ("Porcentaje de integración en central", 0, 100, "%"),
                            ("Briefs completados que generan Proposal compartida desde Central", 0, 100, "%"),
                            ("Diseño y creación de módulo", 0, 100, "%"),
                        ],
                        actions=[
                            "Diseñar el módulo Briefs.", "Desarrollar el módulo Briefs.", "Integrar Briefs con Services.",
                            "Diseñar el módulo Proposal Creator.", "Desarrollar el módulo Proposal Creator.",
                            "Automatizar la generación de propuestas.", "Capacitar al equipo comercial en el nuevo flujo.",
                        ],
                    ),
                    dict(
                        tag_label="KR 4 · OKRs por línea",
                        text="Implementar el módulo de seguimiento de OKRs por línea.",
                        status_note="Por construir",
                        extra_note=(
                            "Este mismo reporte trimestral es el antecedente directo — el módulo lo "
                            "convierte en una herramienta viva dentro de Central, no en un documento "
                            "aparte."
                        ),
                        kpis=[
                            ("Líneas con sus OKRs registrados en Central", 0, 100, "%"),
                            ("OKRs actualizados durante el semestre", 0, 100, "%"),
                            ("Diseño y creación de módulo", 0, 100, "%"),
                        ],
                        actions=[
                            "Diseñar la estructura de seguimiento de OKRs.", "Desarrollar el módulo de OKRs.",
                            "Integrar el módulo con los sistemas existentes.", "Capacitar a los líderes de línea.",
                            "Establecer una rutina de actualización y seguimiento.",
                        ],
                    ),
                ],
            ),
            dict(
                code="O2",
                title="Crear la primera fase del portal de cliente en Central CNTXT",
                description=(
                    "Abrir un espacio dentro de Central pensado para el cliente: login propio, y "
                    "acceso directo a los archivos de su proyecto — planos, renders, videos y demás "
                    "material — sin depender de enviarlo todo por WhatsApp o correo."
                ),
                krs=[
                    dict(
                        tag_label="KR 1 · Login, perfil y proyectos",
                        text="Crear e integrar a Central un módulo de cliente con su login, perfil y lista de proyectos.",
                        status_note="Por construir",
                        kpis=[
                            ("Clientes activos con login", 0, 100, "%"),
                            ("Diseño y creación de módulo", 0, 100, "%"),
                            ("Porcentaje de implementación en central", 0, 100, "%"),
                        ],
                        actions=[
                            "Definir la estructura del perfil de cliente (datos, permisos y accesos).",
                            "Diseñar la experiencia de inicio de sesión y recuperación de contraseña.",
                            "Desarrollar el sistema de autenticación y gestión de usuarios.",
                            "Crear el módulo de perfil de cliente dentro de Central.",
                            "Desarrollar la vista inicial con el listado de proyectos asignados.",
                            "Implementar la relación automática entre clientes y proyectos.",
                            "Realizar pruebas de acceso y seguridad con clientes piloto.",
                            "Capacitar al equipo comercial y de soporte sobre el uso del portal.",
                        ],
                    ),
                    dict(
                        tag_label="KR 2 · Vista de estado de proyectos",
                        text="Crear e integrar al módulo de cliente la vista de proyectos para entregar la información relevante del estado de cada proyecto.",
                        status_note="Depende de KR1",
                        extra_note="La base de proyectos ya existe desde Q1 — este KR construye la capa de visualización pensada para el cliente.",
                        kpis=[
                            ("Proyectos activos con portal externo disponible para el cliente", 0, 100, "%"),
                            ("Diseño y creación de módulo", 0, 100, "%"),
                        ],
                        actions=[
                            "Definir la información visible para el cliente (estado, responsables, fechas, entregables y próximos hitos).",
                            "Diseñar la interfaz de seguimiento de proyectos.",
                            "Integrar la información de los proyectos desde Central al portal del cliente.",
                            "Crear un sistema de actualización automática del estado del proyecto.",
                            "Implementar la visualización de entregables y archivos compartidos.",
                            "Incorporar una línea de tiempo con los hitos del proyecto.",
                            "Validar la experiencia con clientes piloto y recopilar retroalimentación.",
                            "Ajustar el módulo según los resultados de las pruebas antes del despliegue general.",
                        ],
                    ),
                ],
            ),
            dict(
                code="O3",
                title="Consolidar la vitrina virtual de CNTXT migrando toda la infraestructura digital centralizable al VPS propio",
                description=(
                    "Eliminando la fragmentación entre plataformas (Wix, Hostgator, Vercel) y "
                    "garantizando continuidad operativa, sin pérdida de contenido ni tiempo de "
                    "inactividad comercial."
                ),
                krs=[
                    dict(
                        tag_label="KR 1 · Página web",
                        text="Diseñar y migrar la página web principal de CNTXT al VPS interno.",
                        status_note="Por iniciar",
                        kpis=[
                            ("KPI 1 · Módulo Estructuración y Diseño", 0, 100, "%"),
                            ("KPI 2 · Módulo Visualización Arquitectónica", 0, 100, "%"),
                            ("KPI 3 · Módulo Tecnología para Ventas", 0, 100, "%"),
                            ("KPI 4 · Módulo Inteligencia Financiera", 0, 100, "%"),
                        ],
                        actions=[
                            "Auditar el contenido y la estructura del sitio web actual.",
                            "Definir la arquitectura de navegación y la experiencia de usuario del nuevo portal.",
                            "Diseñar la identidad visual y componentes reutilizables del sitio.",
                            "Desarrollar las cuatro landing pages de las líneas de negocio.",
                            "Optimizar el sitio para dispositivos móviles y rendimiento.",
                            "Implementar buenas prácticas de SEO y analítica.",
                            "Configurar el entorno del VPS para alojar la página web.",
                            "Realizar pruebas funcionales antes de la migración.",
                            "Ejecutar la migración sin afectar la disponibilidad comercial.",
                            "Validar el correcto funcionamiento de formularios, enlaces e integraciones.",
                        ],
                    ),
                    dict(
                        tag_label="KR 2 · Central en el VPS",
                        text="Migrar Central CNTXT al VPS interno con dominio propio.",
                        status_note="Por iniciar",
                        kpis=[("Central operando en el VPS interno con dominio configurado", 0, 100, "%")],
                        actions=[
                            "Preparar la infraestructura del VPS para el despliegue de Central.",
                            "Configurar dominio, DNS y certificados SSL.",
                            "Migrar la base de datos y archivos de la aplicación.",
                            "Configurar variables de entorno y servicios necesarios.",
                            "Implementar un pipeline de despliegue y actualización.",
                            "Validar la integridad de la información y el funcionamiento de todos los módulos.",
                            "Ejecutar pruebas de rendimiento, seguridad y respaldo.",
                            "Configurar monitoreo, copias de seguridad automáticas y recuperación ante fallos.",
                        ],
                    ),
                ],
            ),
            dict(
                code="O4",
                title="Analizar, reestructurar y mejorar los servicios existentes",
                description=(
                    "Revisar el catálogo de servicios que ya construyó la oficina para reducir "
                    "tiempos de entrega y elevar el estándar de calidad de lo que ya existe — no "
                    "crear más, sino que lo que hay funcione mejor y más rápido."
                ),
                is_backlog=True,
                krs=[
                    dict(
                        tag_label="KR 1 · Diagnóstico de tiempos y calidad",
                        text=(
                            "Diagnóstico de tiempos de entrega y estándares de calidad completado "
                            "para el 100% de los servicios existentes (Masterplan, Select, Web3D, "
                            "Cotizador), con línea base documentada."
                        ),
                        status_note="Por iniciar",
                        kpis=[("Por definir", 0, 100, "%")],
                        actions=["Por definir"],
                    ),
                    dict(
                        tag_label="KR 2 · Reducción de tiempos",
                        text=(
                            "Reducción de 20% en el tiempo de producción/entrega de al menos 2 "
                            "servicios existentes, frente a la línea base diagnosticada en KR1."
                        ),
                        status_note="Depende de KR1",
                        kpis=[("Por definir", 0, 100, "%")],
                        actions=["Por definir"],
                    ),
                    dict(
                        tag_label="KR 3 · Calidad y nuevas tecnologías",
                        text=(
                            "Al menos 2 oportunidades concretas de mejora identificadas y "
                            "documentadas, evaluando qué tecnologías o métodos nuevos podrían "
                            "elevar la calidad de los servicios existentes."
                        ),
                        status_note="Depende de KR1",
                        extra_note="No es aplicar todo de una vez — es mapear qué es posible con las herramientas y métodos que hoy tenemos al alcance.",
                        kpis=[("Por definir", 0, 100, "%")],
                        actions=["Por definir"],
                    ),
                ],
            ),
            dict(
                code="O5",
                title="Inteligencia de datos desde los activos digitales",
                description=(
                    "Por primera vez, CNTXT sabrá cómo se comporta la gente en sus productos. "
                    "Analytics en todo, un lugar donde leerlo, y una decisión tomada con base en "
                    "esos datos antes de que cierre el Q."
                ),
                is_backlog=True,
                krs=[
                    dict(
                        tag_label="KR 1",
                        text="Analytics implementado en el 100% de los productos digitales activos: web, Select, masterplans, Web3D.",
                        status_note="4 productos a cubrir",
                        kpis=[("Por definir", 0, 100, "%")], actions=["Por definir"],
                    ),
                    dict(
                        tag_label="KR 2",
                        text=(
                            "Dashboard centralizado operativo, con métricas clave (tráfico, "
                            "engagement, puntos de abandono) de los 4 productos activos, "
                            "actualizado semanalmente."
                        ),
                        status_note="Por construir",
                        kpis=[("Por definir", 0, 100, "%")], actions=["Por definir"],
                    ),
                    dict(
                        tag_label="KR 3",
                        text="Primera lectura documentada con al menos 3 hallazgos concretos de comportamiento de usuarios.",
                        status_note="Depende de KR1",
                        kpis=[("Por definir", 0, 100, "%")], actions=["Por definir"],
                    ),
                    dict(
                        tag_label="KR 4",
                        text="Al menos 1 decisión de producto o servicio tomada con base en datos reales antes del cierre del Q.",
                        status_note="Resultado final",
                        extra_note="Este es el KR más importante del objetivo — no basta con instalar analytics, debe cambiar algo.",
                        kpis=[("Por definir", 0, 100, "%")], actions=["Por definir"],
                    ),
                ],
            ),
        ],
    ),
    "red": dict(
        status="definido",
        deliverable="CNTXT Experience CODE V1 (Manual de Experiencia del Cliente)",
        summary_text=(
            "El objetivo central de R.E.D. este semestre es activar y estructurar el sistema "
            "relacional de CNTXT como una plataforma estratégica de crecimiento, consolidando a "
            "nuestros clientes actuales y aliados como embajadores de marca. Consolidar un flujo "
            "constante de oportunidades calificadas en una comunidad digital CNTXT, elevando la "
            "deseabilidad de CNTXT hacia un posicionamiento nacional e internacional con "
            "propósito."
        ),
        objectives=[
            dict(
                code="O.T.1",
                title="Consolidar la Red de Embajadores y Activar la Comunidad CNTXT",
                description="Objetivo Relacional · Transversal.",
                krs=[
                    dict(
                        tag_label="RED_ECA",
                        text="Activando 3 Embajadores CNTXT desde Clientes y Aliados Estratégicos.",
                        evolution_tag="evoluciona", status_note="Ventana: Julio – Septiembre",
                        kpis=[("Embajadores activos + kits entregados", 1, 3, "")],
                        actions=[
                            "Activar los candidatos al 80% (M. Vásquez, V. Monsalve, Andrés Padrón) replicando el patrón de referido calificado de William Zuluaga.",
                            "Diseñar el “Ambassador Kit CNTXT”: piezas gráficas, testimonios y experiencias compartibles.",
                            "Diseñar 1 experiencia / encuentro para embajadores como activación relacional.",
                            "Ampliar la cantera más allá de los 6 candidatos actuales.",
                        ],
                    ),
                    dict(
                        tag_label="RED_CDF",
                        text="Fortaleciendo la Comunidad Digital CNTXT mediante Narrativas Audiovisuales Estratégicas.",
                        evolution_tag="nuevo", status_note="Ventana: Julio – Septiembre",
                        kpis=[("Videos estratégicos publicados + % crecimiento de comunidad + engagement", 2, 9, "")],
                        actions=[
                            "Definir la línea editorial audiovisual basada en los cinco lenguajes del PlayBook (Showtime, Artificación del Producto, Experiencias Memorables, Comunicación para Atraer, Atributos & Performance) y los conceptos maestros de marca.",
                            "Producir y publicar 9 videos estratégicos de alta calidad (3 por mes), priorizando fotografía y video real sobre renders e IA.",
                            "Activar formatos de comunidad mediante series de contenido, colaboraciones y dinámicas de interacción.",
                            "Medir mensualmente el desempeño por lenguaje, formato y métricas de comunidad para optimizar la estrategia audiovisual.",
                        ],
                    ),
                ],
            ),
            dict(
                code="O.T.2",
                title="Consolidar el Experience CODE V1 CNTXT como Diferencial de Marca en la Operación de los Proyectos",
                description="Objetivo de Marca · Transversal.",
                krs=[
                    dict(
                        tag_label="RED_EXP",
                        text="Construyendo el Experience CODE V1 CNTXT en la Operación de los Proyectos.",
                        evolution_tag="nuevo", status_note="Ventana: Julio – Septiembre",
                        kpis=[("% de construcción y activación del Experience CODE V1", 43, 100, "%")],
                        actions=[
                            "Diseñar el Journey del Cliente CNTXT, identificando los momentos clave desde el onboarding hasta la postventa.",
                            "Definir los estándares de experiencia y los Momentos Memorables que diferenciarán cada etapa del proyecto.",
                            "Documentar el Experience CODE CNTXT V1, consolidando protocolos, guías operativas, entregables sensoriales y herramientas de seguimiento.",
                            "Implementar y validar el Experience CODE V1 en 2 proyectos piloto, documentando aprendizajes y oportunidades de evolución para la versión 2.",
                        ],
                    ),
                    dict(
                        tag_label="RED_AEC",
                        text="Activando el CNTXT Experience Space como Atractor y Fidelizador de Clientes.",
                        evolution_tag="evoluciona", status_note="Ventana: Julio – Septiembre",
                        kpis=[("% de activación del CNTXT Experience Space", 20, 100, "%")],
                        actions=[
                            "Diseñar y ejecutar la adecuación del Showroom Inmobiliario CNTXT, alineado con el posicionamiento de la marca.",
                            "Diseñar e implementar la nueva fachada CNTXT como elemento de visibilidad y atracción urbana.",
                            "Integrar el Experience CODE V1 dentro del espacio mediante recorridos, elementos sensoriales, materiales, señalética y puntos de interacción.",
                            "Activar el CNTXT Experience Space mediante reuniones comerciales, experiencias de marca, eventos y recorridos guiados con clientes y aliados estratégicos.",
                        ],
                    ),
                    dict(
                        tag_label="RED_CEF",
                        text="Consolidando la Colaboración Estratégica CNTXT × Innovacron mediante el Desarrollo de la Primera Colección de Calados Arquitectónicos CNTXT.",
                        evolution_tag="evoluciona", status_note="Ventana: Julio – Septiembre",
                        kpis=[("% de colaboración estratégica formalizada + prototipo implementado", 21, 100, "%")],
                        actions=[
                            "Completar la co-creación de la colección de calados CNTXT con Innovacron, evolucionando el desarrollo del 85% al 100%.",
                            "Desarrollar el prototipado, fabricación y validación técnica de la primera pieza de la colección.",
                            "Realizar la presentación de la muestra física y la activación pública de la alianza CNTXT × Innovacron como hito de posicionamiento de marca.",
                            "Implementar el primer prototipo dentro de la fachada del CNTXT Experience Space, consolidándolo como un elemento icónico de identidad y experiencia para la marca.",
                        ],
                    ),
                    dict(
                        tag_label="RED_POP",
                        text="Realizando la Publicación Oficial del Nuevo Posicionamiento de CNTXT mediante la Nueva Fachada del CNTXT Experience Space.",
                        evolution_tag="evoluciona", status_note="Ventana: Julio – Septiembre",
                        kpis=[("% de publicación oficial instalada y activada", 25, 100, "%")],
                        actions=[
                            "Diseñar el concepto gráfico y arquitectónico de la publicación oficial del nuevo posicionamiento de CNTXT.",
                            "Desarrollar la producción e instalación de la identidad visual en la fachada del CNTXT Experience Space.",
                            "Documentar fotográfica y audiovisualmente la intervención para su difusión en los canales de comunicación de la firma.",
                            "Realizar el lanzamiento oficial del nuevo posicionamiento de CNTXT mediante una activación de marca y su publicación en medios propios y redes sociales.",
                        ],
                    ),
                ],
            ),
            dict(
                code="O.Q.1",
                title="Activar un Flujo Constante de Oportunidades Comerciales que Expandan la Comunidad CNTXT",
                description="Objetivo Comercial · Evolutivo.",
                krs=[
                    dict(
                        tag_label="RED_VRM",
                        text="Consolidando la Validación y Recurrencia de Marca mediante Contenido Estratégico Potenciado con Claude Design.",
                        evolution_tag="evoluciona", status_note="Ventana: Julio – Septiembre",
                        extra_note=(
                            "Cada publicación se piensa como un activo de marca, no solo como "
                            "contenido: para contar dentro de la meta debe responder al menos una "
                            "de estas preguntas — ¿valida la autoridad de CNTXT? ¿incrementa la "
                            "deseabilidad de la marca? ¿genera confianza? ¿atrae un nuevo "
                            "prospecto? ¿activa la comunidad?"
                        ),
                        kpis=[("Activos de marca publicados + recurrencia + engagement", 17, 50, "")],
                        actions=[
                            "Planificar el calendario editorial trimestral alineado con los cinco lenguajes del PlayBook.",
                            "Diseñar y publicar 50 activos de marca (contenido estratégico) durante el trimestre, a un ritmo aproximado de 4 publicaciones por semana, priorizando formatos de alto impacto para validación de marca.",
                            "Integrar Claude Design como copiloto creativo para acelerar la producción de guiones, copies, piezas gráficas y dirección creativa.",
                            "Medir mensualmente el desempeño del contenido mediante indicadores de alcance, interacción, recurrencia y oportunidades comerciales generadas.",
                        ],
                    ),
                    dict(
                        tag_label="RED_PCA",
                        text="Activando 12 Proyectos Inmobiliarios de Alto Impacto y 4 Viviendas CNTXT Select Mensuales para Fortalecer la Rentabilidad de la Firma.",
                        evolution_tag="nuevo", status_note="Ventana: Julio – Septiembre",
                        kpis=[
                            ("Proyectos inmobiliarios de alto impacto contratados", 1, 12, ""),
                            ("Viviendas CNTXT Select comercializadas (4 mensuales)", 1, 12, ""),
                            ("Facturación mensual objetivo (COP)", 6600000, 60000000, ""),
                        ],
                        actions=[
                            "Convertir 12 proyectos inmobiliarios de alto impacto durante el trimestre, alineados con la estrategia comercial de CNTXT.",
                            "Comercializar 4 viviendas CNTXT Select por mes para consolidar una base de ingresos recurrentes y escalables.",
                            "Distribuir la carga de trabajo entre los equipos de producción para mantener una ocupación equilibrada y maximizar la eficiencia operativa.",
                            "Monitorear semanalmente el pipeline comercial, la capacidad instalada y los indicadores de rentabilidad para garantizar el cumplimiento de la meta financiera.",
                        ],
                    ),
                    dict(
                        tag_label="RED_SCV",
                        text="Consolidando el Sales CODE CNTXT V1 mediante la Estandarización de los Ciclos de Venta.",
                        evolution_tag="evoluciona", status_note="Ventana: Julio – Septiembre",
                        kpis=[("% de construcción e implementación del Sales CODE V1 (4/4 ciclos estandarizados)", 25, 100, "%")],
                        actions=[
                            "Tomar el ciclo comercial CNTXT Select B2C como referencia para estructurar el Sales CODE V1.",
                            "Documentar y estandarizar los cuatro ciclos de venta: CNTXT Select B2C, CNTXT Select B2B, CNTXT Made B2C y CNTXT Made B2B.",
                            "Integrar el Experience CODE V1, el CRM y herramientas de IA dentro del flujo comercial para automatizar tareas y mejorar la experiencia del cliente.",
                            "Implementar el Sales CODE V1 mediante pruebas reales y capacitar al equipo comercial para asegurar su adopción y mejora continua.",
                        ],
                    ),
                ],
            ),
        ],
    ),
    "cash": dict(
        status="pendiente",
        intro_text=(
            "No se encontró contenido de C.A.S.H. en ninguno de los archivos revisados "
            "(IDI.html, RED.html, RED2.html, COR.pptx). Espacio reservado para cuando se "
            "definan sus objetivos del semestre."
        ),
        objectives=[],
    ),
    "cor": dict(
        status="definido",
        deliverable="CNTXT Quality CODE V1 (Manual de Operaciones / BPM)",
        intro_text=(
            "Método de altísima calidad potenciado con IA (Claude) que institucionaliza una "
            "medición hoy en 0% pese a que la ejecución real promedia 86%."
        ),
        summary_text=(
            "El objetivo central de C.O.R. este semestre es consolidar un sistema operativo "
            "basado en data confiable que permita decisiones oportunas, mejore la rentabilidad "
            "consciente y eleve la experiencia del cliente, elevando el ADN CNTXT y generando un "
            "Control de Calidad Integral. Desarrollar el CNTXT Quality CODE: un método de "
            "altísima calidad, potenciado con IA (Claude), que eleve y garantice el estándar de "
            "cada proyecto e institucionalice una medición que hoy no existe (0%) pese a que la "
            "ejecución real promedia 86%."
        ),
        objectives=[
            dict(
                code="O.T.1",
                title="Diseñar e Implementar el CNTXT Quality CODE V1 con Claude como Copiloto de Calidad",
                description="Método + rúbrica + medición formal + asistente IA por etapa de proyecto.",
                krs=[
                    dict(
                        tag_label="COR_QCD",
                        text="Construyendo el Quality CODE V1 CNTXT como el Método de Calidad Integral para Todos los Proyectos.",
                        evolution_tag="nuevo", status_note="Ventana: Julio",
                        kpis=[("% de construcción e implementación del Quality CODE V1", 18, 100, "%")],
                        actions=[
                            "Formalizar la Rúbrica de Calidad CNTXT (CNTXT Quality Matrix) con sus seis ejes: Coherencia Conceptual, Desarrollo Técnico, Personalización, Integración Contextual, Identidad CNTXT y Valor Emocional.",
                            "Definir los puntos de control del Quality CODE, estableciendo evaluaciones en las etapas de diseño conceptual, desarrollo técnico, ejecución y postventa.",
                            "Documentar el Quality CODE V1 dentro del CNTXT BPM (Business Process Manual), incluyendo protocolos, responsables, criterios de evaluación y formatos de seguimiento.",
                            "Definir la escala de evaluación y los umbrales mínimos de aprobación (≥90% por eje) para institucionalizar el estándar de calidad de CNTXT.",
                        ],
                    ),
                    dict(
                        tag_label="COR_MED",
                        text="Institucionalizando la Medición del Quality CODE para Transformar el Estándar CNTXT en un Indicador Visible y Gestionable.",
                        evolution_tag="nuevo", status_note="Ventana: Julio – Septiembre",
                        kpis=[("% de proyectos evaluados con el Quality CODE (AQS + EVS)", 0, 90, "%")],
                        actions=[
                            "Implementar la medición oficial del CNTXT Quality Score en el portafolio de proyectos activos: AQS (Arquitectural Quality Score) y EVS (Emotional Value Score).",
                            "Consolidar y visualizar los resultados mediante un tablero de control que permita el seguimiento por proyecto y la toma de decisiones basada en datos.",
                            "Incorporar los resultados del Quality Score como argumento de valor dentro de las propuestas comerciales, el portafolio y la comunicación de marca.",
                            "Integrar la medición del Quality CODE como requisito obligatorio dentro del proceso de aprobación creativa y cierre de cada etapa del proyecto.",
                        ],
                    ),
                    dict(
                        tag_label="COR_QAI",
                        text="Implementando el Quality Copilot CNTXT como el Asistente de IA para el Control de Calidad en Cada Etapa del Proyecto.",
                        evolution_tag="nuevo", status_note="Ventana: Agosto – Septiembre",
                        kpis=[("Proyectos evaluados mediante el Quality Copilot", 0, 100, "%")],
                        actions=[
                            "Diseñar los prompts especializados y los checklists de evaluación para cada etapa del ciclo de vida del proyecto, alineados con el Quality CODE V1.",
                            "Implementar el Quality Copilot en todos los proyectos activos como paso previo a la aprobación creativa.",
                            "Documentar automáticamente observaciones, aprendizajes y oportunidades de mejora dentro del Ecosistema CNTXT, fortaleciendo la base de conocimiento organizacional.",
                            "Estandarizar el flujo Revisión → Retroalimentación → Ajustes → Aprobación, integrando la IA como apoyo permanente para garantizar consistencia, trazabilidad y mejora continua.",
                        ],
                    ),
                ],
            ),
        ],
    ),
    "bons": dict(
        status="pendiente",
        intro_text="Objetivos del semestre de B.O.N.S. pendientes de definir.",
        objectives=[],
    ),
}


class Command(BaseCommand):
    help = "Siembra el ciclo 'Q3 2026' con el contenido de Q3_2026_Consolidado.html."

    def handle(self, *args, **options):
        if Cycle.objects.filter(name="Q3 2026").exists():
            self.stdout.write(self.style.WARNING("El ciclo 'Q3 2026' ya existe — no se vuelve a sembrar."))
            return

        legacy_values = self._read_legacy_kpi_progress()

        with transaction.atomic():
            cycle = Cycle.objects.create(
                name="Q3 2026", starts_on=datetime.date(2026, 7, 1),
                ends_on=datetime.date(2026, 12, 31), is_active=True,
            )

            lines_by_code = {}
            for line_data in LINES:
                lines_by_code[line_data["code"]] = Line.objects.create(**line_data)

            for code, plan_data in PLANS.items():
                objectives = plan_data.pop("objectives", [])
                plan = LineCyclePlan.objects.create(
                    line=lines_by_code[code], cycle=cycle, **plan_data
                )
                for obj_index, obj_data in enumerate(objectives):
                    krs = obj_data.pop("krs", [])
                    objective = Objective.objects.create(
                        line_cycle_plan=plan, order=obj_index, **obj_data
                    )
                    for kr_index, kr_data in enumerate(krs):
                        kpis = kr_data.pop("kpis", [])
                        actions = kr_data.pop("actions", [])
                        kr = KeyResult.objects.create(
                            objective=objective, order=kr_index, **kr_data
                        )
                        for kpi_index, (name, current, target, unit) in enumerate(kpis):
                            kpi = Kpi.objects.create(
                                key_result=kr, name=name, target=target, unit=unit, order=kpi_index
                            )
                            CheckIn.objects.create(kpi=kpi, value=current, note="Valor inicial (migrado de Q3_2026_Consolidado.html)")
                        for action_index, text in enumerate(actions):
                            ActionItem.objects.create(key_result=kr, text=text, order=action_index)

        self.stdout.write(self.style.SUCCESS("Ciclo 'Q3 2026' sembrado correctamente."))
        if legacy_values:
            self.stdout.write(self.style.WARNING(
                f"Nota: la tabla portal_kpiprogress de 'hub' tiene {len(legacy_values)} valor(es) "
                "guardados en producción que no se migraron automáticamente (el kpi_id del HTML no "
                "corresponde 1:1 a un KPI nuevo). Revísalos a mano en /admin/ si alguno es más "
                "reciente que el valor transcrito del HTML:"
            ))
            for kpi_id, value in legacy_values.items():
                self.stdout.write(f"  {kpi_id} = {value}")

    @staticmethod
    def _read_legacy_kpi_progress():
        """Best-effort: si esta app corre contra la Postgres compartida y la
        tabla portal_kpiprogress de 'hub' existe, se leen sus valores para
        reportarlos (no se migran automáticamente — el kpi_id del HTML no
        mapea 1:1 a un Kpi nuevo). En SQLite local, o si la tabla no existe,
        simplemente no aplica nada."""
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT kpi_id, current FROM portal_kpiprogress")
                return dict(cursor.fetchall())
        except Exception:
            return {}
