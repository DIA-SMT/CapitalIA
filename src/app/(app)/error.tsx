"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/states";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Registro para diagnóstico (se integrará con observabilidad más adelante).
    console.error(error);
  }, [error]);

  return (
    <div className="py-10">
      <ErrorState
        description="No pudimos cargar esta sección. Podés reintentar."
        action={
          <Button onClick={reset} variant="outline">
            <RotateCcw className="h-4 w-4" aria-hidden />
            Reintentar
          </Button>
        }
      />
    </div>
  );
}
