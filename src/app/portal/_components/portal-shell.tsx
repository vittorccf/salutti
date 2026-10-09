import { BrandLogo } from "@/components/brand/brand-logo";

// Moldura das telas públicas do portal (entrar e convite): centrada, pensada para o celular.
export function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="ds2-glow flex min-h-screen flex-col items-center px-4 py-10">
      <BrandLogo height={28} />
      <div className="mt-8 w-full max-w-md">{children}</div>
    </main>
  );
}
