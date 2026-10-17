# ADR 0001 — Stack TS/Node + React y contenedores dev/prod

- Fecha: 2026-10-16
- Estado: aceptada
- Alcance: decisión de negocio y técnica para el MVP de Blinka PayAgent

## Contexto

El producto es una demo de hackatón: un agente que revisa facturas y decide
PAGAR / FRENAR / ESCALAR. No mueve dinero real. El jurado necesita ver el flujo
completo funcionando y poder cambiar reglas en vivo; el equipo necesita iterar
rápido y desplegar sin depender de lo que haya instalado en cada máquina.

## Decisión

1. **Un solo lenguaje: TypeScript.** API en Node 22 (Fastify) y UI en React 19
   con Vite. El motor de reglas determinista se implementa en el mismo lenguaje
   que la API, sin salto entre capas.
2. **Monorepo con npm workspaces** (`api/`, `web/`): un `npm install`, un
   typecheck, un build y una imagen por entorno.
3. **Dos imágenes**: `Dockerfile.dev` (hot reload, código montado) y
   `Dockerfile` (multi-stage, UI compilada servida por la API, usuario no
   root). La configuración se compone con `compose.yml` + overlay.
4. **`just` como interfaz única**: build, logs, tests, lint y arranque se
   ejecutan con recetas; nadie necesita recordar comandos de Compose.

## Por qué es una decisión de negocio

- Reduce el tiempo hasta una demo funcional: un stack, un toolchain, un
  `just up`.
- El entorno es reproducible en cualquier laptop y en el servidor de demo, lo
  que evita el riesgo de "en mi máquina anda" frente al jurado.
- Mantener el motor de reglas en el mismo lenguaje que la API facilita
  auditarlo y explicarlo, que es el argumento central del producto.
- No agrega servicios que el alcance no pide (sin OCR propio, sin pagos reales,
  sin login, sin multiempresa).

## Consecuencias

- Dev y prod comparten versiones de Node y dependencias fijadas por
  `package-lock.json`.
- En dev el código se monta; si cambian dependencias hay que correr
  `just install` o `just rebuild`.
- La imagen de producción sirve la UI estática desde Fastify; si más adelante
  se necesita CDN o proxy dedicado, se cambia solo esa capa.
- El contenedor de desarrollo incluye git, curl y bash para depurar; la imagen
  de producción no.

## Alternativas descartadas

- **Frontend y backend en repos separados**: duplica toolchain y coordinación
  para un MVP de un día.
- **Servir la UI con Nginx**: agrega un proceso y configuración sin beneficio
  para el alcance actual.
- **Una sola imagen para dev y prod**: obliga a llevar dependencias de
  desarrollo y hot reload a producción.
