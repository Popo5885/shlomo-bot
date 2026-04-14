import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "הצהרת נגישות — שליחת תפוצה לקבוצות",
};

export default function AccessibilityPage() {
  return (
    <article className="prose prose-slate max-w-none text-right" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">הצהרת נגישות</h1>
      <p className="text-muted-foreground text-sm mb-8">עדכון אחרון: אפריל 2026</p>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">1. מחויבות לנגישות</h2>
        <p>
          אנו ב-&quot;שליחת תפוצה לקבוצות&quot; מחויבים להנגיש את השירות לכלל
          האוכלוסייה, כולל אנשים עם מוגבלויות, בהתאם לתקנות שוויון זכויות
          לאנשים עם מוגבלות (התאמות נגישות לשירות), תשע&quot;ג-2013.
        </p>

        <h2 className="text-lg font-semibold">2. תקן נגישות</h2>
        <p>
          האתר עומד בדרישות תקן WCAG 2.1 ברמת AA, הכולל בין השאר:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>תמיכה בניווט מקלדת מלא</li>
          <li>תאימות לקוראי מסך (Screen Readers)</li>
          <li>ניגודיות צבעים מספקת</li>
          <li>טקסט חלופי לתמונות</li>
          <li>תמיכה בשינוי גודל טקסט עד 200%</li>
          <li>תמיכה מלאה בכיוון RTL (ימין לשמאל)</li>
        </ul>

        <h2 className="text-lg font-semibold">3. התאמות שבוצעו</h2>
        <ul className="list-disc list-inside space-y-1">
          <li>מבנה כותרות היררכי וסמנטי</li>
          <li>תוויות לכל שדות הטפסים</li>
          <li>הודעות שגיאה ברורות ונגישות</li>
          <li>אנימציות מצומצמות עם תמיכה ב-prefers-reduced-motion</li>
          <li>ממשק מותאם למובייל (Responsive Design)</li>
        </ul>

        <h2 className="text-lg font-semibold">4. דפדפנים וטכנולוגיות מסייעות</h2>
        <p>האתר נבדק ותואם לעבודה עם:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Google Chrome (גרסה אחרונה)</li>
          <li>Mozilla Firefox (גרסה אחרונה)</li>
          <li>Microsoft Edge (גרסה אחרונה)</li>
          <li>Safari (גרסה אחרונה)</li>
          <li>NVDA, JAWS וקוראי מסך נפוצים</li>
        </ul>

        <h2 className="text-lg font-semibold">5. פנייה בנושא נגישות</h2>
        <p>
          אם נתקלתם בבעיית נגישות או שיש לכם הצעות לשיפור, אנא פנו אלינו:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>דוא&quot;ל: aknvpupuch@gmail.com</li>
          <li>אנו מתחייבים לטפל בכל פנייה תוך 5 ימי עסקים</li>
        </ul>
      </section>
    </article>
  );
}
