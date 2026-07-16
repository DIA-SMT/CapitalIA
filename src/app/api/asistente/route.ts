import { NextResponse } from "next/server";
import { z } from "zod";

import { construirContextoNomenclador } from "@/features/asistente/data/contexto";
import { getSessionUser } from "@/lib/supabase/server";

/**
 * Asistente de consulta sobre el nomenclador.
 *
 * Le pasa el nomenclador COMPLETO al modelo (~61k tokens) en el mensaje de
 * sistema. No usa embeddings ni base vectorial a propósito: esa maquinaria
 * existe para documentos que no entran en contexto, y este entra. Pasarlo entero
 * es más simple y más exacto — no hay chunk que se pierda.
 *
 * El nomenclador se marca con `cache_control` para que se cachee: sin eso, cada
 * pregunta paga los 61k tokens de entrada. Con caché son ~30x más baratos.
 */

const cuerpoSchema = z.object({
  mensajes: z
    .array(
      z.object({
        rol: z.enum(["user", "assistant"]),
        texto: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});

const INSTRUCCIONES = `Sos un asistente del Nomenclador de Puestos de la Municipalidad de San Miguel de Tucumán. Respondés preguntas del personal de Capital Humano sobre los puestos de trabajo municipales.

Tenés el nomenclador completo más abajo: los 210 puestos con sus descripciones, requisitos, competencias, riesgos y responsabilidades.

REGLAS:
- Respondé SOLO con lo que dice el nomenclador. Si algo no figura, decilo: "el nomenclador no lo especifica". No completes con conocimiento general sobre el puesto.
- Citá SIEMPRE los puestos por su nombre y su página del nomenclador impreso. Ej: "Oficial Mecánico (pág. 54)". Sin la cita la respuesta no sirve para verificar.
- Si la pregunta implica contar o listar, sé exhaustivo: revisá los 210 puestos, no des una muestra.
- El nomenclador es de 2016 y puede estar desactualizado. Si la pregunta sugiere que el puesto pudo haber cambiado, aclaralo.
- Las fichas conservan las erratas del documento original (por ejemplo "TRANSPOTES" o "Strees"). No las corrijas al citarlas ni las menciones salvo que sean parte de la pregunta.
- Este sistema es solo de puestos. No tenés datos de empleados, legajos, salarios ni licencias. Si te preguntan por personas, aclaralo.
- No des recomendaciones sobre contratación, despido ni evaluación de personas. Describís puestos, no decidís sobre gente.
- Escribí en español rioplatense, directo y breve. Sin preámbulos.`;

export async function POST(request: Request) {
  // Misma puerta que el resto de la app: sin sesión no se responde.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "El asistente no está configurado. Falta OPENROUTER_API_KEY." },
      { status: 503 },
    );
  }

  let cuerpo: z.infer<typeof cuerpoSchema>;
  try {
    cuerpo = cuerpoSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Consulta inválida." }, { status: 400 });
  }

  const nomenclador = await construirContextoNomenclador();
  if (!nomenclador) {
    return NextResponse.json(
      { error: "No se pudo leer el nomenclador." },
      { status: 503 },
    );
  }

  try {
    const respuesta = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter los usa para atribuir el uso; no son obligatorios.
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-Title": "Capital humanIA",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-5",
        messages: [
          {
            role: "system",
            content: [
              { type: "text", text: INSTRUCCIONES },
              {
                type: "text",
                text: nomenclador,
                // Marca el nomenclador como cacheable. Es lo que hace que cada
                // pregunta cueste centavos y no ~$0.18. Si el proveedor no
                // soporta caché, lo ignora y sigue funcionando (más caro).
                cache_control: { type: "ephemeral" },
              },
            ],
          },
          ...cuerpo.mensajes.map((m) => ({ role: m.rol, content: m.texto })),
        ],
        // Holgado a propósito: preguntas como "listame todos los puestos de
        // riesgo alto" son legítimas y largas. Con 1500 se truncaban, y cuando
        // OpenRouter trunca devuelve content: null — no el texto parcial.
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      console.error("[asistente] openrouter:", respuesta.status, detalle.slice(0, 400));
      return NextResponse.json(
        {
          error:
            respuesta.status === 401
              ? "La clave de OpenRouter es inválida."
              : respuesta.status === 402
                ? "Sin saldo en OpenRouter."
                : "El asistente no pudo responder. Intentá de nuevo.",
        },
        { status: 502 },
      );
    }

    const json = await respuesta.json();
    const eleccion = json.choices?.[0];
    const texto = eleccion?.message?.content;

    if (!texto) {
      // Cuando el modelo se pasa de max_tokens, OpenRouter devuelve content en
      // null en vez del texto parcial. Se distingue del resto para poder decirle
      // al usuario qué hacer.
      if (eleccion?.finish_reason === "length") {
        return NextResponse.json(
          { error: "La respuesta era demasiado larga. Probá acotar la pregunta." },
          { status: 502 },
        );
      }
      console.error("[asistente] respuesta sin contenido:", JSON.stringify(json).slice(0, 400));
      return NextResponse.json({ error: "El asistente no devolvió respuesta." }, { status: 502 });
    }

    // Se devuelve el uso para poder verificar que el caché esté funcionando:
    // si `cacheados` queda en 0 pregunta tras pregunta, no está cacheando y cada
    // consulta cuesta ~30x más.
    return NextResponse.json({
      texto,
      uso: {
        entrada: json.usage?.prompt_tokens ?? null,
        salida: json.usage?.completion_tokens ?? null,
        cacheados: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      },
    });
  } catch (e) {
    console.error("[asistente]", e);
    return NextResponse.json(
      { error: "El asistente tardó demasiado o no está disponible." },
      { status: 504 },
    );
  }
}
