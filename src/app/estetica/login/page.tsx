import type { Metadata } from "next";
import { LoginScreen, type LoginSearchParams } from "@/app/(auth)/login/login-screen";

export const metadata: Metadata = { title: "Salutti Estética" };

export default function EsteticaLoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  return <LoginScreen area="estetica" searchParams={searchParams} />;
}
