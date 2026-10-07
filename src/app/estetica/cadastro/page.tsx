import type { Metadata } from "next";
import { SignupScreen } from "@/app/(auth)/signup/signup-screen";

export const metadata: Metadata = { title: "Salutti Estética" };

export default function EsteticaSignupPage() {
  return <SignupScreen area="estetica" />;
}
