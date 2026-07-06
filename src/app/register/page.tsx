import { registerAction } from "@/actions/auth";
import { AuthForm } from "@/components/auth/auth-form";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-700">
      <AuthForm mode="register" action={registerAction} />
    </main>
  );
}
