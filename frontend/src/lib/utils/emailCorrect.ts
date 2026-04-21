// Common email domain typo corrections
const DOMAIN_FIXES: [RegExp, string][] = [
  // Gmail variants
  [/@gmail\.co\.il$/i, "@gmail.com"],
  [/@gmail\.co$/i, "@gmail.com"],
  [/@gmail\.con$/i, "@gmail.com"],
  [/@gamil\.com$/i, "@gmail.com"],
  [/@gmial\.com$/i, "@gmail.com"],
  [/@gmal\.com$/i, "@gmail.com"],
  [/@gmali\.com$/i, "@gmail.com"],
  [/@gimail\.com$/i, "@gmail.com"],
  [/@gmaill\.com$/i, "@gmail.com"],
  [/@gmail\.vom$/i, "@gmail.com"],
  [/@gmail\.cpm$/i, "@gmail.com"],
  [/@gmail\.xom$/i, "@gmail.com"],
  // Hotmail variants
  [/@hotmail\.co\.il$/i, "@hotmail.com"],
  [/@hotmail\.co$/i, "@hotmail.com"],
  [/@hotmail\.con$/i, "@hotmail.com"],
  [/@hotmai\.com$/i, "@hotmail.com"],
  [/@hotmial\.com$/i, "@hotmail.com"],
  // Yahoo variants
  [/@yahoo\.co\.il$/i, "@yahoo.com"],
  [/@yahoo\.co$/i, "@yahoo.com"],
  [/@yahoo\.con$/i, "@yahoo.com"],
  [/@yaho\.com$/i, "@yahoo.com"],
  // Walla
  [/@walla\.co\.i$/i, "@walla.co.il"],
  [/@walla\.com$/i, "@walla.co.il"],
  // iCloud
  [/@icloud\.co$/i, "@icloud.com"],
  [/@iclod\.com$/i, "@icloud.com"],
];

export interface EmailCorrection {
  original: string;
  corrected: string;
  changed: boolean;
}

export function correctEmail(raw: string): EmailCorrection {
  // Trim whitespace, lowercase
  let corrected = raw.trim().toLowerCase();

  // Remove spaces anywhere in the email
  corrected = corrected.replace(/\s+/g, "");

  // Apply domain fixes
  for (const [pattern, replacement] of DOMAIN_FIXES) {
    if (pattern.test(corrected)) {
      corrected = corrected.replace(pattern, replacement);
      break;
    }
  }

  return {
    original: raw,
    corrected,
    changed: corrected !== raw.trim().toLowerCase().replace(/\s+/g, ""),
  };
}
