# <Concepto>

> Plantilla de `concepts/<slug>.md`. Un archivo por concepto atómico. opencode
> crea/actualiza este archivo en cada lección (§10 de SKILL.md) y lo lee en
> el motor adaptativo para conectar y propagar el conocimiento (§8).

## Definición (fuente)

- **Término**: <nombre>
- **Definición de la fuente**: <texto de la fuente>
- **Lección de origen**: lesson-NNN
- **Glosario**: slug en `glossary/glossary.json`

## Grafo

- **Prerrequisitos**: <conceptos previos>
- **Conecta con** (conceptos posteriores): <conceptos que cuelgan de este>
- **Dificultad**: <0–1>
- **Mastery actual**: <0–100> (último dato en `accuracy/`)
- **Estado de repaso**: `last_review`, `interval`, `forgetting`

## Ejemplos

- <ejemplo 1>
- <ejemplo 2>

## Misconceptions asociadas

- <misconception> → cómo se plantea en el Challenge de la próxima lección

## Voz del usuario

> Fragmentos LITERALES de las notas del estudiante que se conectan a este
> concepto. Es la voz del usuario: no se corrigen ni parafrasean. Cada fragmento
> cita su `notes/<lesson>.md` de origen. Estos fragmentos alimentan los puentes
> hacia los conceptos posteriores (§2 árbol de conocimiento de SKILL.md).

- «<texto literal de la nota>» — de `notes/lesson-NNN.md`
- «<otro fragmento>» — de `notes/lesson-MMM.md`

## Referencias del marco (research/)

- `research/<slug>.md` — marco de enseñanza investigado (arXiv/WebFetch)
