import { LoginScreen, type LoginSearchParams } from "./login-screen";

export default function LoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  return <LoginScreen searchParams={searchParams} />;
}
