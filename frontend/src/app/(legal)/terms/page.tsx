import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "תנאי שימוש — שליחת תפוצה לקבוצות",
};

export default function TermsPage() {
  return (
    <article className="prose prose-slate max-w-none text-right" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">תנאי שימוש</h1>
      <p className="text-muted-foreground text-sm mb-8">עדכון אחרון: אפריל 2026</p>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">1. הגדרות</h2>
        <p>
          &quot;השירות&quot; — פלטפורמת &quot;שליחת תפוצה לקבוצות&quot; על כל
          רכיביה, כולל ממשק ניהול, API ושירותי רקע.
          &quot;משתמש&quot; — כל אדם או ישות שנרשמו לשירות ומשתמשים בו.
        </p>

        <h2 className="text-lg font-semibold">2. קבלת התנאים</h2>
        <p>
          השימוש בשירות מהווה הסכמה לתנאים אלו. אם אינך מסכים לתנאים — אל תשתמש
          בשירות.
        </p>

        <h2 className="text-lg font-semibold">3. תיאור השירות</h2>
        <p>
          השירות מאפשר שליחת הודעות לקבוצות WhatsApp ו-Telegram באמצעות חשבונות
          מחוברים. השירות כולל כלים לניהול כללי הפצה, אישורים, ותובנות.
        </p>

        <h2 className="text-lg font-semibold">4. שימוש מותר</h2>
        <p>המשתמש מתחייב:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>לא לשלוח ספאם או הודעות בלתי רצויות</li>
          <li>לא להפר את תנאי השימוש של WhatsApp ו-Telegram</li>
          <li>לא להשתמש בשירות לפעילות בלתי חוקית</li>
          <li>לשמור על סודיות פרטי ההתחברות</li>
        </ul>

        <h2 className="text-lg font-semibold">5. הגבלת אחריות</h2>
        <p>
          השירות ניתן &quot;כפי שהוא&quot; (AS IS). אנו לא אחראים לחסימת חשבונות
          על ידי WhatsApp או Telegram, לאובדן הודעות, או לכל נזק ישיר
          או עקיף הנובע מהשימוש בשירות.
        </p>

        <h2 className="text-lg font-semibold">6. חסימת חשבון</h2>
        <p>
          אנו שומרים את הזכות לחסום או להשעות חשבון משתמש שמפר את תנאי השימוש
          ללא הודעה מוקדמת.
        </p>

        <h2 className="text-lg font-semibold">7. קניין רוחני</h2>
        <p>
          כל הזכויות בשירות, כולל קוד המקור, עיצוב וממשק המשתמש, שמורות לבעלי
          השירות. אין להעתיק, לשכפל או לבצע הנדסה לאחור.
        </p>

        <h2 className="text-lg font-semibold">8. שינויים בתנאים</h2>
        <p>
          אנו רשאים לעדכן תנאים אלו מעת לעת. המשך השימוש לאחר עדכון מהווה
          הסכמה לתנאים המעודכנים.
        </p>

        <h2 className="text-lg font-semibold">9. דין חל וסמכות שיפוט</h2>
        <p>
          על תנאים אלו יחולו דיני מדינת ישראל. סמכות השיפוט הבלעדית נתונה
          לבתי המשפט המוסמכים בישראל.
        </p>
      </section>
    </article>
  );
}
