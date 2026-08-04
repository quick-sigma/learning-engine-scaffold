# UI.md — Reglas de diseño deterministas del Cognitive Learning Engine

> Este archivo es **normativo**. Todo CSS, template, widget y slide del sistema
> DEBE cumplir estas reglas. Si una decisión de diseño contradice este archivo,
> el archivo gana. Si falta un token, se crea PRIMERO el token y después se
> usa (prohibido el valor hardcodeado). Última revisión: 2026-08-03.

---

## 1. Fuente de verdad: tokens

**Regla dura**: ningún valor de color, tamaño de fuente, radio, sombra,
espaciado o duración puede escribirse en bruto fuera del archivo de tokens.
Los tokens viven en `:root` (y sus variantes de tema) de `app/static/css/style.css`.

| Familia | Tokens | Ejemplos |
| --- | --- | --- |
| Color (marca/estado) | `--bg`, `--surface`, `--text`, `--muted`, `--border`, `--accent`, `--accent-2`, `--grad-accent`, `--ok`, `--ko`, `--warn` (+ `-soft` de cada estado) | `background: var(--surface)` |
| Color (gamificación, SKILL.md §15.7) | `--acc-seed`, `--acc-sprout`, `--acc-growing`, `--acc-flowering`, `--acc-thirsty`, `--acc-xp`, `--acc-streak` | `color: var(--acc-streak)` |
| Deck (siempre oscuro) | `--deck-bg`, `--deck-bg-grad`, `--deck-surface`, `--deck-border`, `--deck-border-strong`, `--deck-text`, `--deck-muted` | `background: var(--deck-surface)` |
| Tipografía | `--font-sans`, `--font-mono`, `--text-xs…--text-3xl` | `font-size: var(--text-lg)` |
| Espaciado | `--sp-1 … --sp-7` (escala 4px) | `padding: var(--sp-4)` |
| Radio | `--radius-sm/md/lg/xl/pill` | `border-radius: var(--radius-md)` |
| Sombra | `--shadow-sm/md/lg`, `--glow-accent` | `box-shadow: var(--shadow-md)` |
| Movimiento | `--dur-1/2/3`, `--ease-out`, `--ease-spring` | `transition: transform var(--dur-1) var(--ease-out)` |
| Campos (forms.css) | `--field-*` | `border-color: var(--field-border)` |

**Cómo pedir un valor nuevo**: crear el token con nombre descriptivo en las
tres variantes (`:root`, `[data-theme="dark"]`, y el bloque
`@media (prefers-color-scheme: dark) [data-theme="auto"]`), documentarlo en
la tabla de su familia y luego usarlo.

---

## 2. Tipografía

- Fuente UI y de lectura: **Atkinson Hyperlegible** (vendored, `--font-sans`).
  Diseñada para máxima legibilidad en baja visión — es el pilar de
  accesibilidad del sistema.
- Fuente mono (código, fórmulas, ids, tablas de verdad): **JetBrains Mono**
  (`--font-mono`).
- Escala estricta (solo estos 8 tamaños):

| Token | Tamaño | Uso |
| --- | --- | --- |
| `--text-xs` | 0.75rem | badges, roles, etiquetas, meta corto |
| `--text-sm` | 0.8rem | meta, hints, chips, reproductor compacto |
| `--text-md` | 0.925rem | cuerpo secundario, botones, opciones |
| `--text-lg` | 1.05rem | cuerpo principal, títulos h3 |
| `--text-xl` | 1.3rem | h2 |
| `--text-2xl` | 1.65rem | h1 |
| `--text-3xl` | 2.1rem | solo widgets de palabra (saturación) |

- Line-height: cuerpo 1.6, títulos 1.22. Letter-spacing de títulos:
  `-0.01em` (h2) y `-0.015em` (h1).
- Prohibido `font-weight` no definido: 400 y 700 únicamente (la fuente vendored
  solo tiene esos dos). Los pesos 500/600 deben simularse con `700` cuando el
  contexto lo pida, o dejar `400` y usar color/contraste para jerarquizar.

---

## 3. Tema (claro / oscuro / auto)

- El `<html>` lleva `data-theme="auto" | "light" | "dark"` (persistido en
  `localStorage['theme']`).
- `auto` = seguir `prefers-color-scheme` del SO. **Regla de sincronización
  obligatoria**: cualquier token oscuro que se edite en `[data-theme="dark"]`
  debe copiarse en el bloque `@media (prefers-color-scheme: dark)
  [data-theme="auto"]` de forma idéntica. (Los selectores CSS no permiten
  compartir variables entre ambos sin duplicar.)
- El deck reveal.js es **siempre oscuro** en ambos temas (`--deck-*`): los
  slides son una superficie de foco, separada de la app.
- El contraste mínimo es AA (4.5:1 texto normal, 3:1 texto grande). El color
  NUNCA es la única señal (ver §9).

---

## 4. Espaciado y layout

- Escala de espaciado estricta de 4px: `--sp-1` (0.25) · `--sp-2` (0.5) ·
  `--sp-3` (0.75) · `--sp-4` (1) · `--sp-5` (1.5) · `--sp-6` (2) · `--sp-7` (3).
  No usar `margin`/`padding` con valores libres.
- Contenedor principal: `max-width: 920px`, centrado, padding `var(--sp-6)
  var(--sp-5)`.
- Deck: columna de contenido `max-width: 46rem`, centrada; slides con padding
  `5vh 6vw 8vh` y scroll vertical propio.
- Objetivo táctil mínimo: 32px de alto para controles (check/radio tienen
  `min-height: 32px`); botones principales `>= 40px`.
- Rows de cards (`lesson-list`, `glossary-list`): gap `var(--sp-3)`. Grid de
  notas: `repeat(auto-fill, minmax(340px, 1fr))` con gap `var(--sp-4)`.

---

## 5. Movimiento

### Duraciones y easings (solo estos)

| Token | Valor | Uso |
| --- | --- | --- |
| `--dur-1` | 120ms | micro-interacciones: hover, foco, active, color |
| `--dur-2` | 220ms | transiciones de estado: tab, cards, sombras |
| `--dur-3` | 360ms | entrada/entrada de contenido, pop-in, crecimiento |
| `--ease-out` | `cubic-bezier(0.22,1,0.36,1)` | easing por defecto (todo) |
| `--ease-spring` | `cubic-bezier(0.34,1.4,0.64,1)` | pop-in, check, radio, thumbs, toasts |

### Reglas
1. **Animar SOLO por competencia o feedback** (SKILL.md §15): entrada de
   paneles, pop de resultados de quiz/predicción, mastery bar creciendo,
   ecualizador al reproducir audio, pulse de "generando audio". Prohibido
   animar elementos decorativos sin función.
2. **Nada más rápido que 120ms ni más lento que 400ms** salvo loops
   deliberados (brand-morph, pulse-dot, eq-bounce, hef-pulse).
3. **`prefers-reduced-motion: reduce`**: el bloque global de style.css (§10)
   apaga TODAS las animaciones y transiciones (duración 0.01ms). No añadir
   nunca una animación fuera del alcance de ese bloque.
4. El `ease-spring` es para entradas de feedback; el `ease-out` para todo lo
   demás. No inventar cubic-bezier nuevos.
5. Transformaciones sobre `transform`/`opacity` para animar (barato y sin
   reflow); no animar `width`/`height`/`margin` a gran escala (la mastery-bar
   anima `width` por ser un 6px de altura, excepción aceptada).

---

## 6. Reglas estrictas de diseño de slides (deck reveal.js)

Cada slide del bucle de descubrimiento (§7 SKILL.md) debe cumplir:

0. **Slide 0 = portada de origen (obligatoria)**: la primera slide del deck
   muestra el **título del capítulo original** y el **rango de páginas** en el
   que se basó la lección (ej. "Capítulo 3 · Refracción — págs. 58–62").
   `stage: "Contexto"` (usa el color de etapa por defecto), id `source`,
   campos `source_chapter`/`source_pages` a nivel de lección, audio
   `slide-00.mp3`. Nunca una lección sin portada de origen (§4.2 SKILL.md).
1. **Un concepto por slide**. Si una slide tiene dos ideas, se parte en dos.
2. **Etiqueta de etapa obligatoria y con color determinista**:
   `data-stage="{stage|lower}"` sobre `.stage-tag`. Mapeo de color
   (NO cambiar):
   | Etapa | Token de color |
   | --- | --- |
   | contexto (portada) | `#94a3b8` (slate) |
   | challenge | `#fb923c` (naranja) |
   | prediction | `#a78bfa` (violeta) |
   | experiment | `#22d3ee` (cian) |
   | observation | `#38bdf8` (azul) |
   | reflection | `#f472b6` (rosa) |
   | explanation | `#34d399` (esmeralda) |
   | generalization | `#2dd4bf` (teal) |
   | application | `#fbbf24` (ámbar) |
   | quiz | `#818cf8` (índigo) |
   | mastery | `#fbbf24` (ámbar) |
3. **Jerarquía visual**: stage-tag → título (h2, centrado, con subrayado
   gradiente) → contenido. Máximo 46rem de ancho.
4. **Un solo formulario interactivo por slide** (quiz O predicción O
   experimento O reflexión O widget, no dos).
5. **Todo bloque narrable tiene su reproductor** (§11 SKILL.md): el audio
   player se coloca inmediatamente después del bloque al que narra.
6. **Los bloques interactivos son tarjetas de cristal**: `.quiz`,
   `.prediction`, `.experiment`, `.reflection` y `.widget` usan
   `--deck-surface` + `backdrop-filter: blur(10px)` + `--deck-border`.
7. **Las opciones de quiz/predicción** son filas clickeables con hover que
   se desplazan `translateX(4px)`; la seleccionada lleva borde + fondo de
   acento (`:has(input:checked)`).
8. **La slide de Prediction "sella" el compromiso** (§15.9 SKILL.md): tras
   emitir, el resultado aparece con pop-in y no debe poder editarse.
9. **Prohibido** en slides: más de ~250 palabras de texto, dos imágenes, tablas
   con más de 6 columnas, o scroll horizontal.
10. **Fragmentos de reveal.js**: usar para revelación escalonada (Observación
    → comparación con la predicción), nunca para ocultar contenido completo
    tras interacción innecesaria.

---

## 7. Componentes (contratos)

### 7.1 Botones `.btn`
- Variantes: `default` (gradiente de acento), `.btn-secondary` (outline
  acento), `.btn-ghost` (outline neutro), `.btn-danger` (outline rojo),
  `.btn-sm`.
- Hover: `translateY(-1px)` + sombra media. Active: `scale(0.97)`. Focus:
  `outline: none` + `box-shadow: var(--shadow-md), var(--glow-accent)`.
- Deshabilitado: `opacity 0.5`, sin transform, `not-allowed`.

### 7.2 Pestañas `.tabs`
- Contenedor: pill con fondo `--surface-2`, borde `--border`, padding
  `var(--sp-1)`.
- Activa: `--grad-accent` + `--shadow-md`. Hover: `translateY(-1px)`.
- Deben mantener `role="tablist"`, `role="tab"`, `aria-selected`.

### 7.3 Tarjetas (`.lesson-card`, `.glossary-card`, `.note-card`)
- Fondo `--surface`, borde `--border`, radio `--radius-lg`, sombra `--shadow-sm`.
- Hover: `translateY(-3px)`, sombra media, borde fuerte, + línea superior
  gradiente (opacity 0→1).
- Entrada escalonada: `enter-up` con delay por índice (60/120/180/240ms).

### 7.4 Chips de estado `.status-chip`
- `data-status="ready"` → `--ok` sobre `--ok-soft`. `data-status="pending"`
  → `--warn` sobre `--warn-soft` + punto pulsante (`pulse-dot`).

### 7.5 Mastery (chip + barra)
- Chip: `data-mastery="0"` neutro; mayor → `--ok` sobre `--ok-soft`.
- Barra `.mastery-bar`: 72×6px, relleno gradiente `--acc-growing → --ok`,
  ancho vía `--val`, anima `width` con `--dur-3`.

### 7.6 Reproductor de audio `.audio-play`
- Pill con ícono ▶; al reproducir añade clase `.playing` → muestra el
  ecualizador animado (`.eq` con 3 barras) y oculta el ▶.
- Dentro del deck: fondo `rgba(129,140,248,.1)`, borde `rgba(129,140,248,.38)`.
- Compacto `.audio-play-sm`: solo dentro de opciones de quiz/predicción.

### 7.7 Formularios (forms.css)
- Inputs: fondo `--field-bg`, borde `--field-border`, radio `--field-radius`,
  foco = borde acento + ring de 4px `--field-focus-ring`.
- Check/radio custom: caja 20px, animación `--ease-spring` al marcar.
- Slider: thumb 22px, gradiente de relleno `--range-fill`.

### 7.8 Vacíos `.empty`
- Borde discontinuo `--border-strong` 2px, radio `--radius-lg`, fondo
  translúcido, padding `var(--sp-7) var(--sp-6)`, centrado.

---

## 8. Widgets (contratos)

- Todos los widgets viven en el deck oscuro → solo tokens `--deck-*` y los
  estados semánticos.
- **Shell `.widget`**: idéntico a las tarjetas de cristal de las slides
  (§6.6), con `--deck-border` en el toolbar separador.
- **Lienzo `.canvas`**: nodos con `drop-shadow` de acento en hover/selección,
  menú contextual `--deck-surface` con blur y `--shadow-lg`. Los labels usan
  `--font-sans` 13px 600.
- **Tabla de verdad**: fórmula en `--font-mono` bold `#a5b4fc`; celdas
  `--deck-border`; toggles con hover `scale(1.08)`; correcto → glow verde
  `pop-in`, incorrecto → `shake` rojo.
- **Debate**: mensajes con `enter-up`; agente a la izquierda (índigo), alumno
  a la derecha (esmeralda); roles en mayúsculas `--text-xs` con letter-spacing.
- **Hefferline**: pulso rojo (`hef-pulse`) que se apaga al silenciar;
  transición de fondo `--dur-3`.
- **Sonda / Saturación**: canvas/foco con borde que se ilumina al hover;
  estados `--ok`/`--warn`/`--ko`.
- **Editor de código (`.code-editor`)**: textarea transparente sobre un `<pre>`
  con resaltado Python (misma celda de grid, scroll sincronizado). Fondo
  `#0d1117`; tokens de sintaxis SOLO con la paleta del deck: keywords `#c4b5fd`,
  strings `#6ee7b7`, comentarios `#6b7280`, números `#fbbf24`, funciones
  `#93c5fd`. Toolbar con `.btn` (Ejecutar/Comprobar/Pista/Guardar/Reiniciar).
  Salida en `.code-output` (stdout `--deck-text`, stderr `--ko` sobre
  `rgba(248,113,113,.06)`). `aria-live="polite"` en salida y feedback;
  `:focus-visible` = ring `#a5b4fc`.
- **Timeline (`.timeline-*`)**: línea de hitos con predicción del tipo de cada
  hito antes de revelarlo (afirmación/demostración/engaño). Nodos en `ol` con
  botones `.timeline-dot` (`aria-label` por estado), tarjeta del nodo activo,
  opciones `.timeline-opt` (picked/correct/incorrect/revealed-correct),
  feedback `aria-live` con autocorrección, pista y reinicio. Estado por texto
  en `timeline-status`, nunca solo color.
- **Niveles de realidad (`.levels-*`)**: jerarquía de niveles de un sistema
  bajo doble control (Polanyi). Pila `.levels-stack` de tarjetas
  `.levels-card` ordenables por teclado (botones ↑/↓ en `.levels-moves`;
  top = nivel más alto, marcado `.is-top`; bottom = más básico, `.is-bottom`).
  Por nivel: `.levels-q` con radio `.quiz-opt` para ley, condición de frontera
  y no-derivación; chip `.levels-status` con etiqueta de texto (pendiente /
  ✓ listo / ↻ por revisar, nunca solo color). Evaluador global
  (`.levels-actions` → «Comprobar jerarquía») que guía la autocorrección
  señalando el nivel donde falla, sin dar la respuesta; pregunta final
  `.levels-final` (`.levels-q` + «Responder») sobre el doble control. Feedback
  `aria-live`, pista y reinicio.

### 8.1 Narración obligatoria de widgets (regla dura, SKILL.md §6.3/§6.5)

**Todo bloque de texto de todo widget tiene su reproductor de audio**, incluido
el debate socrático:
- Bloques narrables: `task`, `hint`, `instructions`, `formula` (logic_truth),
  en debate la `thesis`, el `opening`, cada `turn.agent` y cada
  `turn.options[M]`, y en el **editor de código** `task`, `instructions`,
  `hint`, `feedback_ok`/`feedback_ko`, y si hay pregunta `prompt` y cada
  `prompt_options[M]`. En **levels_reality**: `task`, `instr`, `hint`, por
  nivel `name` (nombre + texto), `law_prompt` + `law_options[M]`,
  `boundary_prompt` + `boundary_options[M]`, `derivable_prompt`,
  `feedback_ok`/`feedback_ko`, las opciones compartidas `derivable_options[2]`
  (Sí/No) y la pregunta final `prompt` + `options[M]` + `feedback_ok`/`ko`.
- El widget declara su audio en el mapa `audio` de su configuración
  (`slides.json`), con nombres `w-<slideid>-*`.
- El reproductor `.audio-play` se renderiza **junto a cada bloque**; en el
  debate, el JS lo inyecta dinámicamente por turno y opción leyendo el mapa
  `audio` (`audio.turns[N]`, `audio.turns_options[N][M]`).
- Un widget **sin audio no es publicable** (`lesson_audio_status` lo valida).
  Todo widget nuevo debe nacer narrable desde su diseño.
- Prohibido: widgets con scroll horizontal, controles sin `:focus-visible`,
  colores hardcodeados fuera de `--deck-*`, o bloques de texto sin su MP3.

---

## 9. Accesibilidad (invariantes)

1. **Contraste AA mínimo**; el deck mantiene texto `--deck-text` sobre
   `--deck-bg` (ratio > 12:1) y opciones sobre `--deck-surface`.
2. **Color nunca es la única señal**: cada estado semántico lleva icono o
   etiqueta de texto además del color (chips tienen texto, nodos del árbol
   tienen `aria-label` + texto).
3. **`:focus-visible` visible** en todos los controles (global en style.css,
   ring específico en forms.css/widgets.css).
4. **ARIA**: `role="tablist"/"tab"/"tabpanel"`, `aria-live="polite"` en
   resultados de quiz/predicción/nota, `aria-label` en botones de audio y
   controles de icono, HTML semántico.
5. **Reduced motion** (§5.3): nada anima sin la regla global.
6. **Tamaño de fuente**: nunca fijar con px en componentes (solo tokens rem).
7. Reproducibilidad: el estado de cada widget se guarda en disco (no depende
   del DOM), y los partials se re-renderizan por HTMX.

---

## 10. Do / Don't

**DO**
- Usar tokens; crear el token antes que el valor.
- Animar feedback de competencia y entrada de contenido.
- Mantener el deck oscuro siempre, la app con los 3 temas.
- Hover + active + focus visible en todo control.
- Stagger suave al insertar listas (HTMX re-dispara las animaciones).

**DON'T**
- Hardcodear colores/px/radios/durancias fuera de tokens.
- Añadir fuentes de terceros sin venderlas (prohibido CDN en runtime).
- Animaciones decorativas infinitas, parallax, o efectos que compitan con el
  contenido.
- Rombos de color sin texto/icono acompañante.
- Slides con más de un formulario o más de una idea.
- Cambiar un token en solo una de las tres variantes de tema (§3).

---

## 11. Cómo añadir un componente nuevo

1. Escribir el partial HTMX (`templates/partials/…`) con HTML semántico.
2. Definir el contrato CSS usando SOLO tokens, bajo un prefijo de clase único.
3. Si hace falta un token nuevo, crear el token (las 3 variantes, §3) y
   registrarlo en la tabla de §1.
4. Verificar: contraste AA, `:focus-visible`, `prefers-reduced-motion`,
   `aria-live` si hay feedback, y objetivo táctil ≥ 32px.
5. Documentar aquí (componente en §7 o §8 según sea app o widget).
