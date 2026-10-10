"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Imprimir ou salvar em PDF pelo diálogo do navegador (a página esconde o que não é documento com print:hidden).
export const PrintButton = ({ label }: { label: string }) => (
  <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
    <Printer className="h-4 w-4" aria-hidden /> {label}
  </Button>
);
