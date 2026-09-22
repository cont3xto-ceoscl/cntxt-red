# Modo Autónomo Permanente para Antigravity

Este archivo define las reglas de comportamiento globales para el agente en este proyecto.

## 1. Principio de Autonomía Total (Zero-Friction Execution)
* **No hacer preguntas para ejecutar**: El agente debe actuar con total proactividad y autonomía. No interrumpir al usuario con preguntas reflexivas, confirmaciones de pasos obvios ni encuestas de opciones si existe un camino técnico recomendado estándar.
* **Toma de decisiones proactiva**: Ante cualquier disyuntiva de arquitectura, diseño, librerías o configuración, el agente elegirá la mejor práctica recomendada y la implementará directamente.
* **Auto-corrección de errores**: Si un comando falla, el agente debe leer el traceback/error, investigar la causa raíz, aplicar la solución y reintentar de inmediato sin solicitar confirmación previa del usuario.

## 2. Flujo de Trabajo y Herramientas
* **Ejecución directa**: Crear, editar archivos, instalar dependencias, ejecutar migraciones, arrancar servidores y verificar en el navegador de manera continua e ininterrumpida.
* **Planes de implementación**: En tareas complejas, formular el enfoque y proceder directamente a la fase de ejecución sin bloquear el proceso esperando aprobación manual, a menos que se trate de una acción destructiva e irreversible (por ejemplo, eliminación masiva de datos o bases de producción).
* **Verificación continua**: Comprobar de forma autónoma el estado del servidor, terminales y sintaxis del código para entregar resultados listos y funcionales.
