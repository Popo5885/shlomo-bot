import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "מדיניות פרטיות — שליחת תפוצה לקבוצות",
};

export default function PrivacyPage() {
  return (
    <article className="prose prose-slate max-w-none text-right" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">מדיניות פרטיות</h1>
      <p className="text-muted-foreground text-sm mb-8">עדכון אחרון: אפריל 2026</p>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">1. כללי</h2>
        <p>
          אנו ב-&quot;שליחת תפוצה לקבוצות&quot; (להלן: &quot;השירות&quot;) מחויבים לשמירת
          פרטיותך. מדיניות זו מסבירה אילו נתונים אנו אוספים, כיצד אנו משתמשים בהם
          ומהן זכויותיך.
        </p>

        <h2 className="text-lg font-semibold">2. מידע שאנו אוספים</h2>
        <ul className="list-disc list-inside space-y-1">
          <li>פרטי חשבון: כתובת דוא&quot;ל, שם מלא ומספר טלפון</li>
          <li>נתוני שימוש: הודעות שנשלחו, קבוצות יעד, לוגים טכניים</li>
          <li>מידע טכני: כתובת IP, סוג דפדפן, חותמות זמן</li>
          <li>קבצי עוגיות (Cookies) לצורך אימות וניהול הפגישה</li>
        </ul>

        <h2 className="text-lg font-semibold">3. שימוש במידע</h2>
        <p>אנו משתמשים במידע שנאסף כדי:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>לספק ולתפעל את השירות</li>
          <li>לשפר את חוויית המשתמש</li>
          <li>לשלוח התראות מערכת ועדכונים טכניים</li>
          <li>למנוע שימוש לרעה ולאבטח את המערכת</li>
        </ul>

        <h2 className="text-lg font-semibold">4. שיתוף מידע עם צדדים שלישיים</h2>
        <p>
          אנו לא מוכרים ולא משתפים את המידע האישי שלך עם צדדים שלישיים, למעט
          במקרים הבאים:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>כנדרש על פי חוק או צו בית משפט</li>
          <li>ספקי שירות הכרחיים לתפעול המערכת (אחסון ענן, שליחת הודעות)</li>
        </ul>

        <h2 className="text-lg font-semibold">5. אבטחת מידע</h2>
        <p>
          אנו נוקטים באמצעי אבטחה מתקדמים כולל הצפנת AES-256-GCM לנתונים רגישים,
          חיבורי HTTPS מוצפנים ובקרת גישה מבוססת תפקידים.
        </p>

        <h2 className="text-lg font-semibold">6. שמירת נתונים</h2>
        <p>
          נתוני החשבון נשמרים כל עוד החשבון פעיל. לוגים טכניים נשמרים עד 90 יום.
          באפשרותך לבקש מחיקת חשבון בכל עת.
        </p>

        <h2 className="text-lg font-semibold">7. זכויותיך</h2>
        <p>בהתאם לחוק הגנת הפרטיות, עומדות לך הזכויות הבאות:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>עיון במידע האישי שנאסף אודותיך</li>
          <li>בקשה לתיקון או מחיקת מידע</li>
          <li>התנגדות לעיבוד מידע לצרכים שיווקיים</li>
        </ul>

        <h2 className="text-lg font-semibold">8. יצירת קשר</h2>
        <p>
          לכל שאלה בנושא פרטיות, ניתן לפנות אלינו בדוא&quot;ל:
          aknvpupuch@gmail.com
        </p>
      </section>
    </article>
  );
}
