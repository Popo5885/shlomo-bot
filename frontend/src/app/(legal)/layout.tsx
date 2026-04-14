import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 backdrop-blur-xl bg-white/70">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-6 py-4">
          <Link
            href="/login"
            className="text-lg font-bold bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent"
          >
            שליחת תפוצה לקבוצות
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            חזרה להתחברות
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-border/50 bg-white/80 backdrop-blur-xl shadow-sm p-8 md:p-12">
          {children}
        </div>

        {/* Footer links */}
        <nav className="mt-8 flex flex-col items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              מדיניות פרטיות
            </Link>
            <span className="text-border">|</span>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              תנאי שימוש
            </Link>
            <span className="text-border">|</span>
            <Link href="/accessibility" className="hover:text-foreground transition-colors">
              הצהרת נגישות
            </Link>
          </div>
          <p className="text-xs text-muted-foreground/70">
            &copy; 2026 שלמה פופוביץ פתרונות אוטמציה לעסקים. כל הזכויות שמורות.
          </p>
        </nav>
      </main>
    </div>
  );
}
