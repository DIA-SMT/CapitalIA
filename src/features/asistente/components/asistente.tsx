"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MessageCircleQuestion, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mensaje = { rol: "user" | "assistant"; texto: string };

const SUGERENCIAS = [
  "¿Cuántos puestos son de riesgo alto?",
  "¿Qué puestos requieren manejo de vehículos?",
  "¿En qué se diferencian Oficial Mecánico y Ayudante Mecánico?",
];

/** Para no repetir el aviso en cada carga una vez que ya lo vieron. */
const CLAVE_AVISO = "capitalia:aviso-asistente-visto";

/**
 * Si ya vieron el aviso, leído de localStorage.
 *
 * Va por useSyncExternalStore y no por un efecto: localStorage no existe en el
 * servidor, así que leerlo en el estado inicial rompe la hidratación, y leerlo
 * en un efecto dispara un render en cascada. Esta API existe justamente para
 * esto: el snapshot del servidor dice "ya visto" (no se pinta nada, no hay
 * mismatch) y el cliente lo relee después de hidratar.
 */
const noHaySuscripcion = () => () => {};
const leerCliente = () => localStorage.getItem(CLAVE_AVISO) === "1";
const leerServidor = () => true;

/**
 * Asistente de consulta sobre el nomenclador.
 *
 * Panel flotante: no ocupa una pantalla propia porque la idea es preguntarle
 * mientras se está mirando otra cosa.
 */
export function Asistente() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoCerrado, setAvisoCerrado] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  const avisoYaVisto = useSyncExternalStore(noHaySuscripcion, leerCliente, leerServidor);
  const avisoVisible = !avisoYaVisto && !avisoCerrado;

  function ocultarAviso() {
    setAvisoCerrado(true);
    localStorage.setItem(CLAVE_AVISO, "1");
  }

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, pensando]);

  async function preguntar(texto: string) {
    const pregunta = texto.trim();
    if (!pregunta || pensando) return;

    const nuevos: Mensaje[] = [...mensajes, { rol: "user", texto: pregunta }];
    setMensajes(nuevos);
    setEntrada("");
    setError(null);
    setPensando(true);

    try {
      const r = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Se manda la conversación entera: el endpoint no guarda estado.
        body: JSON.stringify({ mensajes: nuevos.slice(-10) }),
      });
      const json = await r.json();
      if (!r.ok) {
        setError(json.error ?? "No se pudo consultar.");
        return;
      }
      setMensajes([...nuevos, { rol: "assistant", texto: json.texto }]);
    } catch {
      setError("No se pudo conectar con el asistente.");
    } finally {
      setPensando(false);
    }
  }

  if (!abierto) {
    return (
      // `pointer-events-none` en el contenedor y `auto` en los hijos: si no, la
      // caja del flex —el hueco del gap y todo el ancho del aviso— se come los
      // clicks de lo que haya debajo. Se comía el botón "Crear puesto".
      <div className="pointer-events-none fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
        {avisoVisible && (
          <div className="pointer-events-auto relative max-w-56 rounded-xl rounded-br-sm border border-border bg-card px-3 py-2 pr-8 shadow-lg">
            <p className="text-xs leading-relaxed text-foreground">
              Preguntá lo que quieras sobre el nomenclador
            </p>
            <button
              type="button"
              onClick={ocultarAviso}
              className="absolute right-1 top-1 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="No mostrar este aviso"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setAbierto(true);
            ocultarAviso();
          }}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Preguntar sobre el nomenclador"
        >
          <MessageCircleQuestion className="h-6 w-6" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-40 flex h-[min(32rem,calc(100vh-3rem))] w-[min(26rem,calc(100vw-2.5rem))] flex-col rounded-xl border border-border bg-card shadow-2xl"
      role="dialog"
      aria-label="Asistente del nomenclador"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="h-4 w-4 text-brand-celeste" aria-hidden />
          <span className="text-sm font-semibold">Consultar el nomenclador</span>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {mensajes.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Preguntá sobre los 210 puestos del nomenclador. Cita siempre la ficha y
              la página de donde saca la respuesta.
            </p>
            <ul className="space-y-1.5">
              {SUGERENCIAS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => preguntar(s)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-secondary/60"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Solo sabe de puestos. No tiene datos de empleados ni legajos.
            </p>
          </div>
        )}

        {mensajes.map((m, i) => (
          <div
            key={i}
            className={
              m.rol === "user"
                ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                : "max-w-[92%] rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground"
            }
          >
            <p className="whitespace-pre-wrap leading-relaxed">{m.texto}</p>
          </div>
        ))}

        {pensando && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Revisando los 210 puestos…
          </p>
        )}
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div ref={finRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          preguntar(entrada);
        }}
        className="flex gap-2 border-t border-border p-3"
      >
        <Input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          placeholder="Preguntá algo del nomenclador…"
          disabled={pensando}
          aria-label="Tu pregunta"
          maxLength={2000}
        />
        <Button type="submit" size="sm" disabled={!entrada.trim() || pensando}>
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
