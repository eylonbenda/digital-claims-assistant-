// Shell shared by the auth pages — same card as /login.
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm border border-zinc-200">
        <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

export const authInputClass =
  "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-blue-500";

export const authButtonClass =
  "w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50";
