# DentiHub: contexto para Claude

## Qué es
Plataforma web de trabajo colaborativo para equipos de oficina y de terreno. Reemplaza WhatsApp, Word, Excel y Drive: archivos, planillas, tareas con foto de evidencia, documentos, chats por área, aprobaciones, wiki, reportes, auditoría y modo sin conexión. Cada rol (Administrador, Gestor, Técnico) ve solo lo suyo. La organización visual se inspira en suites como Lark; no se copian su marca ni sus textos.

Roadmap de 8 fases: `C:\Users\berna\Downloads\Roadmap DentiHub.xlsx` (todo en 0%).

## Estado actual
- Existe una **demo navegable** en `DentiHub-Modelo-Visual.html`: un solo archivo, con datos de ejemplo, sin base de datos ni autenticación real. Todos los módulos se pueden abrir y usar; nada se guarda al recargar.
- `DentiHub Modelo Visual.html` es una versión antigua, solo como histórico.
- `Prompts-Lovable-Prototipo-DentiHub.md` tiene el prompt maestro y los prompts por módulo para construir el prototipo en Lovable, sin backend.
- No hay backend, ni repositorio remoto definitivo, ni proyecto de Supabase. El usuario creará el Git nuevo.

## Decisiones tomadas
- Primero un **prototipo navegable sin base de datos** para socializar con el equipo; el backend solo después de aprobarlo.
- Backend recomendado para producción: **Supabase Pro** (roles con permisos por fila, auditoría, archivos en el mismo proveedor). Pendiente de decidir tras el prototipo.
- La edición simultánea en tiempo real y el modo sin conexión son lo más riesgoso; en el prototipo solo se simulan.
- Diseñar permisos y auditoría desde la fase 1, no al final.

## Cómo trabajar (instrucción del usuario)
Actuar como ingeniero senior, sin adivinar:
- **Depuración:** entender qué hace el código, hallar la causa raíz, explicar el fallo, revisar casos límite y proponer el arreglo más robusto, con código listo para producción.
- **Código desconocido:** reconstruir la arquitectura y el flujo de datos; detectar malas decisiones, lógica duplicada, cuellos de botella y riesgos de escalabilidad; refactorizar **sin cambiar la funcionalidad**.
- Si no hay código que analizar, decirlo en vez de inventar un análisis.

## Reglas
- Responder en español.
- No crear cuentas, proyectos de Supabase ni subir a Git sin confirmación explícita del usuario.
- No pedir ni escribir contraseñas, tokens o claves. Las claves van solo en `.env`, que nunca se sube a Git.
- No borrar archivos ni repositorios sin confirmación.

## Pendientes
1. Ajustes de la demo (el usuario aún no los especificó).
2. Pegar los prompts en Lovable y revisar el resultado con el equipo.
3. Crear el Git nuevo y subir esta carpeta.
4. **Dentiventario** (inventario `image-inv-wiz`, con un problema de aislamiento en la sucursal de testeo) es **otro proyecto**, que no está en esta carpeta.
