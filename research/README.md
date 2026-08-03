# research/ — Investigación de marcos por concepto

Esta carpeta es **parte del flujo de creación de lecciones**. Antes de escribir
`content.md`, opencode investiga el mejor marco de enseñanza **para el concepto
concreto de ese momento** y guarda el resultado aquí. Así el modelo (opencode)
es parte del sistema: lo que investiga se escribe de vuelta en disco y
realimenta las lecciones futuras.

## Regla de oro

**Nunca diseñar una lección sin pasar por aquí.** El "medio de enseñanza"
genérico de `EVIDENCE.md` (tabla C) da la dirección por campo; esta carpeta
refina esa dirección **para el concepto específico** que se va a enseñar.

## Protocolo (3 pasos, en orden)

1. **Encuadrar**: extraer el concepto atómico (§5.3) y su tipo (definición,
   proceso, matemática, física, programación, redes, BD, algoritmos, química,
   biología, filosofía, historia, economía, ML, procedimiento, relación).
   Anotar el marco base de `EVIDENCE.md` tabla C para ese campo.

2. **Buscar el marco del concepto**: buscar en este orden hasta encontrar
   evidencia útil y reproducible:
   - **arXiv** (búsqueda semántica por título/abstract del concepto + términos
     de pedagogía: `"worked examples"`, `"interactive simulation"`,
     `"conceptual change"`, `"misconception"`, `"visualization"`,
     `"tutoring"`, etc.). Categorías útiles: `cs.CY`, `cs.HC`, `physics.ed-ph`,
     `math.HO`, `cs.AI`.
   - **WebFetch** a fuentes de investigación en educación (p. ej. resúmenes de
     artículos, guías de práctica de PER/CER/ER).
   - Solo si lo anterior falla, motor de búsqueda general.

3. **Guardar el resultado** en `research/<concepto-slug>.md` usando la plantilla
   `_template.md`. Copiar el texto útil (abstract/guía) al archivo para que
   persista como memoria del sistema; las URLs y IDs arXiv deben quedar
   registrados.

## Lo que debe decidir la búsqueda (y quedar escrito)

| Decisión | Dónde se usa |
| --- | --- |
| ¿Simulación, worked example (Buggy/Guided), experimento mental, timeline, critique…? | Slide "Experiment" (§7.3) |
| ¿Conocimiento previo bajo o alto? → elegir Guided vs. Buggy (EVIDENCE.md A2) | Slide "Experiment" |
| ¿Hay misconceptions conocidas para este concepto? | Slide "Challenge" (§7.1) |
| ¿Existe un concepto inventory / prueba diagnóstica publicada? | Slide "Quiz" / pre-post (§7.9) |
| ¿Qué representación visual es la más eficaz (diagrama, simulación, línea de tiempo)? | Slides |
| ¿Qué conceptos prerrequisito exige? | grafo de conceptos / Generalization |

## Convenciones

- Nombre de archivo: `research/<slug-del-concepto>.md` (slug del concepto
  atómico, no de la lección).
- Un archivo por concepto. Si el mismo concepto aparece en otra lección,
  **releer su archivo** y solo actualizar si hay evidencia nueva (no duplicar).
- El archivo debe ser legible por el agente en el paso 1 del flujo (§5.1):
  estructura fija, resultados al principio.
- No borrar archivos: son memoria del sistema y alimentan el motor adaptativo.
