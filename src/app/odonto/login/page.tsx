import type { Metadata } from "next";
import { LoginScreen, type LoginSearchParams } from "@/app/(auth)/login/login-screen";

export const metadata: Metadata = { title: "Salutti Odonto" };

export default function OdontoLoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  return <LoginScreen area="odonto" searchParams={searchParams} />;
}
