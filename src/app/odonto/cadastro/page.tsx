import type { Metadata } from "next";
import { SignupScreen } from "@/app/(auth)/signup/signup-screen";

export const metadata: Metadata = { title: "Salutti Odonto" };

export default function OdontoSignupPage() {
  return <SignupScreen area="odonto" />;
}
