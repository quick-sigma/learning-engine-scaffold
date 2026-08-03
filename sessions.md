# Diario de aprendizaje

> Registro cronológico del estudio. opencode añade una entrada por lección
> con la fecha, la fuente trabajada y el resultado del motor adaptativo.

## 2026-08-03 — Inicialización del sistema

- **Fuente**: «La dimensión tácita», Michael Polanyi (trad. Álvaro Vergara N.,
  Ediciones Deusto, 2023). PDF, 110 páginas, texto extraíble (pdftotext).
- **Estructura mapeada**: p2 Índice · p4 Sinopsis · p7–15 Prólogo ·
  p16–18 Introducción · p19–41 Cap. 1 *Conocimiento tácito* · p42–64 Cap. 2
  *Emergencia* · p65–101 Cap. 3 *Sociedad de exploradores* · p102+ Notas.
- **Stack verificado**: scaffold clonado (FastAPI+HTMX+reveal.js), `uv sync`
  OK, Kokoro `~/.kokoro/` OK (modelo int8 + voces), ffmpeg OK. MP3 de prueba
  generado y borrado.
- **config.json** inicializado: fuente, `total_pages=110`, `current_page=7`
  (Prólogo), 4 objetivos de aprendizaje (conocimiento tácito, filosofía de la
  ciencia, Menón/emergencia, sociedad de exploradores).
- **Pendiente**: lección 1 desde el Prólogo (p7). Lección de muestra del
  scaffold (prisma de luz) eliminada para dejar `lesson-001` libre.

## 2026-08-03 — Lección 1: «Sabemos más de lo que podemos decir»

- **Fuente**: Prólogo (pág. 7–15). Marco investigado en
  `research/conocimiento-tacito.md` y `research/paradoja-de-menon.md`
  (arXiv 2201.03582 transmisión del conocimiento tácito; 2011.08059 y
  1806.09958 experimentos mentales; EVIDENCE.md C filosofía).
- **Deck**: 11 slides (Challenge → Prediction → Experiment guiado →
  Observation → Reflection/self-explanation → Explanation → Generalization
  (Menón) → Application + Quiz → 2 quizzes → Mastery). Dificultad 0.4.
- **Audio**: 18 MP3 de lección + 4 MP3 de glosario (Kokoro `es`, `ef_dora`,
  ffmpeg qscale 4).
- **Mejoras de base del scaffold** (a replicar en el repo):
  - `lesson.html`: reproductor de audio por bloque (texto, instrucciones,
    pregunta de quiz, predicción, experimento, reflexión); formularios de
    predicción, experimento y self-explanation; ids de resultado únicos por
    slide (fix de ids duplicados con varios quizzes).
  - Fix 404: rutas de reveal.js sin `/dist/` (el vendor está en
    `static/vendor/reveal/`).
  - `routes/api.py`: endpoints HTMX `/api/prediction_form/{id}`,
    `/api/experiment/{id}`, `/api/self_explain/{id}` + `_append_to_note`.
- **Config**: `current_lesson=lesson-001`, `current_concept=conocimiento-tacito`,
  `mastery_score=0` (aún sin quizzes reales).
- **Próxima lección**: Cap. 1 «Conocimiento tácito», pág. 19 (según motor
  adaptativo: primera lección, sin métricas aún).
