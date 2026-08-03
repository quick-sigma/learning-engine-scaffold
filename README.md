# Cognitive Learning Engine — Scaffold (FastAPI + HTMX)

Base de aplicación del **Cognitive Learning Engine**: un sistema de estudio
interactivo en Python donde el aprendizaje ocurre por **descubrimiento**, no
por lectura pasiva. La app es un **flujo híbrido SO ↔ app**: opencode escribe
el contenido (lecciones, glosario, audio) y la app FastAPI sirve el contenido y
recolecta la telemetría del estudiante que realimenta la siguiente lección.

## Stack

| Capa | Tecnología |
| --- | --- |
| Backend | FastAPI (Python) + Uvicorn |
| Plantillas | Jinja2 (SSR) |
| Interactividad | HTMX (vendored, sin CDN) |
| Lecciones | reveal.js (vendored, sin CDN) |
| TTS | Kokoro (kokoro-onnx) + ffmpeg |
| Entorno | uv |

## Puesta en marcha

```bash
cd app
uv sync                # crea .venv e instala dependencias
uv run uvicorn main:app --reload --port 3000
```

Abre `http://localhost:3000` → índice con 3 pestañas (Lecciones, Glosario,
Notas).

## Estructura

```
learning/
    config.json              # estado de sesión (leer PRIMERO, actualizar ÚLTIMO)
    app/
        main.py              # app FastAPI: static, templates, routers
        routes/              # index, lessons, glossary, notes, api
        templates/           # Jinja2 (base, index, lesson, partials/)
        static/              # css, js (htmx, deck, audio), vendor/reveal
        lib/fs.py            # TODAS las lecturas/escrituras de datos
        lib/types.py         # modelos pydantic (telemetría, quiz, …)
        tmp/                 # temporales (WAV, logs) — SOLO aquí, nunca fuera
    lessons/lesson-001/      # content.md, slides.json, audio/
    glossary/glossary.json   # pilar Glosario
    notes/                   # notas del estudiante por lección
    responses/               # telemetría cruda (jsonl)
    accuracy/                # métricas agregadas (mastery, quiz, …)
    misconceptions/          # errores recurrentes
    profiles/                # perfil exportado por lección
    media/                   # assets extraídos de la fuente
    widgets/                 # estado persistente de widgets (lienzo, tabla,
                             # debate) por lección — escribe la app, lee opencode
    concepts/                # una nota markdown por concepto (plantilla
                             # _template.md) — el grafo crece con la VOZ del
                             # usuario: cada conceptos/<slug>.md tiene una
                             # sección "## Voz del usuario" con fragmentos
                             # literales de sus notas
    sessions.md              # diario de aprendizaje
    research/                # marcos de enseñanza por concepto (opencode busca
                             # en arXiv/WebFetch ANTES de escribir cada lección)
    generate_audio.py        # Kokoro TTS → WAV (ffmpeg a MP3)
```

## Árbol de conocimiento con la voz del usuario

Las notas del estudiante no son texto muerto: **se usan para conectar y
propagar el conocimiento hacia adelante**. Cada lección, opencode:

1. Lee `notes/*.md` (texto literal del usuario) antes de diseñar la lección.
2. Tiende puentes desde las frases del usuario hacia el concepto nuevo
   (la siguiente lección parte de lo que el usuario ya dijo).
3. Guarda los fragmentos conectados en `concepts/<slug>.md` → `## Voz del
   usuario`, citando su `notes/<lesson>.md` de origen.
4. Si una nota revela un error conceptual, pasa a `misconceptions/` y se
   convierte en el Challenge de la siguiente lección.

Así el árbol de conocimiento se arma de abajo hacia arriba con las palabras del
usuario, no solo con el texto de la fuente.

## Formato de una lección

`lessons/lesson-001/slides.json`:

```json
{
  "audio_ready": false,
  "slides": [
    {
      "id": "challenge",
      "stage": "Challenge",
      "title": "El problema",
      "text": "…",
      "audio": "slide-01.mp3"
    },
    {
      "id": "quiz",
      "stage": "Quiz",
      "title": "Pon a prueba",
      "text": "…",
      "quiz": { "question": "¿Cuál?", "options": ["A", "B", "C"], "correct": 1 }
    }
  ]
}
```

Etapas del bucle de descubrimiento: Challenge → Prediction → Experiment →
Observation → Reflection → Explanation → Generalization → Application → Quiz
→ Mastery.

### Publicación retardada (los slides NO se ven antes que el audio)

Una lección **no es visible hasta que el 100% de su audio está generado**.
`slides.json` lleva la marca `"audio_ready": false` al crearse; solo pasa a
`true` cuando todos los MP3 referenciados (`audio`, `alt_audio`,
`instr_audio`, `quiz_audio`) existen en `lessons/<id>/audio/`. Mientras tanto:

- El índice muestra la lección con estado **"generando audio (N pendiente)"**.
- `GET /lessons/{id}` devuelve `409` + plantilla `lesson_pending.html`
  (nunca slides sin su narración).
- La verificación es en tiempo real (`lib/fs.py → lesson_audio_status`):
  si una sesión se corta a mitad del audio, la lección queda oculta y se
  retoma desde el audio pendiente.

Si una sesión se corta a mitad del audio, la lección permanece oculta y la
siguiente invocación la retoma desde el audio pendiente (no desde cero).

## Audio (Kokoro)

```bash
# setup único (en ~/.kokoro, NUNCA en otra parte)
uv venv ~/.kokoro/.venv
uv pip install --python ~/.kokoro/.venv/bin/python kokoro-onnx soundfile
# modelos en ~/.kokoro/models/kokoro-v1.0.onnx y voices-v1.0.bin

# generar + comprimir
~/.kokoro/.venv/bin/python generate_audio.py "<texto>" --out app/tmp/tmp-slide
ffmpeg -y -i app/tmp/tmp-slide.wav -codec:a libmp3lame -qscale:a 4 \
    lessons/lesson-001/audio/slide-02.mp3
rm -f app/tmp/tmp-slide.wav
```

## API

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/` | Índice 3 pestañas (`?tab=lessons\|glossary\|notes`) |
| GET | `/partials/{tab}` | Partial HTMX de una pestaña |
| GET | `/lessons/{id}` | Deck reveal.js de la lección |
| GET | `/lessons/{id}/audio/{file}` | MP3 de narración |
| GET | `/media/{path}` | Assets de `media/` |
| GET | `/glossary/audio/{file}` | MP3 de definición |
| POST | `/api/telemetry` | Evento de telemetría (JSON) → `responses/*.jsonl` |
| POST | `/api/notes/{id}` | Guardar nota (form HTMX) → `notes/*.md` |
| POST | `/api/quiz/{id}` | Respuesta de quiz (form HTMX) → `accuracy/*.json` |
| POST | `/api/prediction/{id}` | Predicción del estudiante (JSON) |
| POST | `/api/widget/{lesson}/{widget}` | Guardar estado de un widget (JSON) → `widgets/*.json` + telemetría |

## Widgets interactivos (formas varias de explicar)

Además de preguntas/quiz/reflexión, cada slide puede incluir un **widget**
interactivo añadiendo `"widget": { "type": … }`:

```json
{
  "id": "canvas",
  "stage": "Experiment",
  "widget": {
    "type": "canvas",
    "task": "Conecta los conceptos",
    "concepts": ["Utilitarismo", "Deontología", "Consecuencias"],
    "relations": ["implica", "contradice", "presupone", "objeta", "apoya"]
  }
}
```

| Tipo | Descripción |
| --- | --- |
| `canvas` | Lienzo libre de conceptos: nodos arrastrables + aristas tipadas (argument mapping, grafo de conceptos). |
| `logic_truth` | Tabla de verdad interactiva con evaluador proposicional integrado (`formula`, `variables`). |
| `debate` | Debate socrático por turnos contra el agente (`thesis`, `opening`, `turns[]`). |

El scaffold **no es un límite**: el agente está autorizado a crear widgets
nuevos (partial `widget_<tipo>.html` + JS en `lesson-widgets.js` + CSS en
`widgets.css` + endpoint de guardado si aplica) y a devolverlos a este repo con
push, siguiendo el patrón de los existentes.

## Reglas no negociables

1. Archivos temporales SOLO en `app/tmp/` (nada de `/tmp` del sistema).
2. Todo acceso a disco pasa por `lib/fs.py` — nunca rutas en plantillas.
3. `config.json` se lee primero y se actualiza último.
4. Narración siempre con Kokoro → MP3 (la Web Speech API falla en CachyOS).
5. Audio: `lang="es"`, voces `ef_dora`/`em_alex`/`em_santa`.
