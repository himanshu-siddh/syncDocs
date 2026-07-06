"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { AuthActionState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AuthFormProps = {
  mode: "login" | "register";
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
};

export function AuthForm({ mode, action }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const isLogin = mode === "login";

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{isLogin ? "Welcome back" : "Create your workspace"}</CardTitle>
        <p className="text-sm text-zinc-500 dark:text-zinc-300">
          {isLogin
            ? "Sign in to open your SyncDocs documents."
            : "Create an account to sync documents across devices."}
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {!isLogin ? <Input name="name" placeholder="Name" autoComplete="name" required /> : null}
          <Input name="email" type="email" placeholder="Email" autoComplete="email" required />
          <Input
            name="password"
            type="password"
            placeholder="Password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={8}
            required
          />
          {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Please wait..." : isLogin ? "Sign in" : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-300">
          {isLogin ? "No account yet?" : "Already have an account?"}{" "}
          <Link className="font-medium text-zinc-700 dark:text-zinc-100" href={isLogin ? "/register" : "/login"}>
            {isLogin ? "Register" : "Sign in"}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
