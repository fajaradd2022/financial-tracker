"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconMail, IconWhatsApp } from "@/components/icons";
import { Button, Card, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const { error: signInError } = await authClient.signIn.email({
      email: email.trim(),
      password,
    });

    if (signInError) {
      // Pesan dari server sengaja tidak membedakan "email tidak ada" vs
      // "password salah" — itu membocorkan email mana yang terdaftar.
      setError("Email atau password salah.");
      setPending(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-indigo-600 text-sm font-bold text-white">
            FT
          </span>
          <h1 className="text-xl font-semibold tracking-tight">
            Financial Tracker
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Catat keuangan otomatis dari email bank & e-wallet.
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>

            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
              >
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              disabled={pending}
              className="h-11 w-full"
            >
              {pending ? "Memproses…" : "Masuk"}
            </Button>
          </form>

          <p className="mt-3 text-center text-[11px] text-muted">
            Tidak ada pendaftaran mandiri — akun dibuat oleh admin.
          </p>

          <div className="mt-6 space-y-2.5 border-t border-line pt-5">
            <Feature
              icon={<IconMail className="size-4" />}
              text="Transaksi ditarik otomatis dari inbox khusus tiap ~12 menit"
            />
            <Feature
              icon={<IconWhatsApp className="size-4" />}
              text="Catat pengeluaran tunai lewat WhatsApp, tanpa buka aplikasi"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2.5 text-xs text-muted">
      <span className="mt-px text-indigo-500">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
