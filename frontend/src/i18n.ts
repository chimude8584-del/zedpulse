// Lightweight i18n for ZedPulse. English strings are the keys; missing
// translations fall back to English. Nyanja / Bemba / Tonga are AI-drafted
// and should be reviewed by native speakers.

import { useEffect, useState } from "react";

import { storage } from "@/src/utils/storage";

export type Lang = "en" | "ny" | "bem" | "toi";

export const LANGS: { code: Lang; name: string }[] = [
  { code: "en", name: "English" },
  { code: "ny", name: "Nyanja" },
  { code: "bem", name: "Bemba" },
  { code: "toi", name: "Tonga" },
];

const LANG_KEY = "zedpulse.lang";
let currentLang: Lang = "en";
const listeners = new Set<() => void>();

type Dict = Record<string, string>;

const ny: Dict = {
  Home: "Kunyumba",
  Log: "Lembani",
  History: "Mbiri",
  Advisor: "Uphungu",
  Hello: "Muli bwanji",
  "Welcome back": "Takulandiraninso",
  "Today's tip · Zambia 🇿🇲": "Malangizo a lero · Zambia 🇿🇲",
  "Blood Glucose": "Shuga m'magazi",
  "Blood Pressure": "BP (Kuthamanga kwa magazi)",
  "Log reading": "Lembani muyeso",
  "Share report": "Gawani lipoti",
  Reminders: "Zokumbutsa",
  Medications: "Mankhwala",
  "Food scan": "Onani chakudya",
  Clinics: "Zipatala",
  "Weekly insights": "Zochitika za sabata",
  "Pharmacy prices (ZMW)": "Mitengo ya mankhwala (ZMW)",
  "Family & caregivers": "Banja ndi osamalira",
  "Share this week on WhatsApp": "Gawani sabata ino pa WhatsApp",
  "Emergency SOS": "Thandizo mwachangu (SOS)",
  "No glucose readings yet. Tap “Log” to add one.": "Palibe muyeso wa shuga. Dinani “Lembani” kuti muwonjezere.",
  "No BP readings yet. Tap “Log” to add one.": "Palibe muyeso wa BP. Dinani “Lembani” kuti muwonjezere.",
  "30-day avg": "Pakati pa masiku 30",
  "% in range (last 30)": "% ili bwino (30 yomaliza)",
  "d streak": " masiku motsatana",
  "Set up family alerts →": "Konzani zidziwitso za banja →",
  Settings: "Zokonda",
  Language: "Chiyankhulo",
  "Sign out": "Tulukani",
  "Food scanner": "Onani chakudya",
  "Nearby clinics": "Zipatala zapafupi",
  "Pharmacy watch": "Mitengo ya mankhwala",
  "Family alerts": "Zidziwitso za banja",
  "Doctor share link": "Ulalo wa dokotala",
  "Export doctor report": "Tumizani lipoti kwa dokotala",
  Appearance: "Maonekedwe",
  "Delete account": "Chotsani akaunti",
  "AI-drafted translation — please help us improve it.": "Kumasulira kwa AI — tithandizeni kukonza.",
  // Status labels
  "Severe Low": "Shuga watsika kwambiri",
  Low: "Shuga watsika",
  "In Range": "Ili bwino",
  High: "Wakwera",
  "Very High": "Wakwera kwambiri",
  "Critical High": "Wakwera moopsa",
  "Hypertensive Crisis": "BP yakwera moopsa",
  "Low (Hypotension)": "BP yatsika",
  "Stage 2 High": "Yakwera (gawo 2)",
  "Stage 1 High": "Yakwera (gawo 1)",
  Elevated: "Yakwera pang'ono",
  Normal: "Ili bwino",
};

const bem: Dict = {
  Home: "Ku ng'anda",
  Log: "Lemba",
  History: "Ifyapitapo",
  Advisor: "Ukufunda",
  Hello: "Mwapoleni",
  "Welcome back": "Mwabwela",
  "Today's tip · Zambia 🇿🇲": "Ukufunda kwa lelo · Zambia 🇿🇲",
  "Blood Glucose": "Shuga mu mulopa",
  "Blood Pressure": "BP (Ubukose bwa mulopa)",
  "Log reading": "Lemba icipimo",
  "Share report": "Tumina lipoti",
  Reminders: "Ifyakwibukisha",
  Medications: "Imiti",
  "Food scan": "Pima ifyakulya",
  Clinics: "Ifipatala",
  "Weekly insights": "Ifya mulungu",
  "Pharmacy prices (ZMW)": "Imitengo ya miti (ZMW)",
  "Family & caregivers": "Ulupwa na abasunga",
  "Share this week on WhatsApp": "Tumina umulungu uyu pa WhatsApp",
  "Emergency SOS": "Ubwafwilisho bwa bwangu (SOS)",
  "No glucose readings yet. Tap “Log” to add one.": "Tapali icipimo ca shuga. Kanya “Lemba” ukulundapo.",
  "No BP readings yet. Tap “Log” to add one.": "Tapali icipimo ca BP. Kanya “Lemba” ukulundapo.",
  "30-day avg": "Pakati ka nshiku 30",
  "% in range (last 30)": "% fili bwino (30 ishalekelesha)",
  "d streak": " inshiku ukukonkana",
  "Set up family alerts →": "Pekanya ukulondolwela ulupwa →",
  Settings: "Ifyakulonganya",
  Language: "Ululimi",
  "Sign out": "Fumamo",
  "Food scanner": "Pima ifyakulya",
  "Nearby clinics": "Ifipatala fyapepi",
  "Pharmacy watch": "Imitengo ya miti",
  "Family alerts": "Ukulondolwela ulupwa",
  "Doctor share link": "Ilinki ya kwa dokota",
  "Export doctor report": "Tumina dokota lipoti",
  Appearance: "Ukumoneka",
  "Delete account": "Fumya akaunti",
  "AI-drafted translation — please help us improve it.": "Ukupilibula kwa AI — twafweni ukuwamya.",
  "Severe Low": "Shuga yacepa sana",
  Low: "Shuga yacepa",
  "In Range": "Fili bwino",
  High: "Yanina",
  "Very High": "Yanina sana",
  "Critical High": "Yanina ku kusakamika",
  "Hypertensive Crisis": "BP yanina sana",
  "Low (Hypotension)": "BP yacepa",
  "Stage 2 High": "Yanina (step 2)",
  "Stage 1 High": "Yanina (step 1)",
  Elevated: "Yanina panono",
  Normal: "Fili bwino",
};

const toi: Dict = {
  Home: "Kuŋanda",
  Log: "Lemba",
  History: "Zyakainda",
  Advisor: "Lulayo",
  Hello: "Mwapona",
  "Welcome back": "Mwaboola",
  "Today's tip · Zambia 🇿🇲": "Lulayo lwasunu · Zambia 🇿🇲",
  "Blood Glucose": "Shuga mubulowa",
  "Blood Pressure": "BP (Kweenda kwabulowa)",
  "Log reading": "Lemba cipimo",
  "Share report": "Twaanya lipooti",
  Reminders: "Zyakuyeeyezya",
  Medications: "Musamu",
  "Food scan": "Langa cakulya",
  Clinics: "Zibbadela",
  "Weekly insights": "Zyamvwiki",
  "Pharmacy prices (ZMW)": "Mitengo yamusamu (ZMW)",
  "Family & caregivers": "Mukwasyi abalanganya",
  "Share this week on WhatsApp": "Twaanya mvwiki eeyi a WhatsApp",
  "Emergency SOS": "Lugwasyo lwaciindi coonya (SOS)",
  "No glucose readings yet. Tap “Log” to add one.": "Taakuli cipimo ca shuga. Dinda “Lemba” kuyungizya.",
  "No BP readings yet. Tap “Log” to add one.": "Taakuli cipimo ca BP. Dinda “Lemba” kuyungizya.",
  "30-day avg": "Akati kamazuba 30",
  "% in range (last 30)": "% kabotu (30 zyamamanino)",
  "d streak": " mazuba kutobelana",
  "Set up family alerts →": "Bamba kuzyibya mukwasyi →",
  Settings: "Zyakubamba",
  Language: "Mwaambo",
  "Sign out": "Zwa",
  "Food scanner": "Langa cakulya",
  "Nearby clinics": "Zibbadela zyaafwaafwi",
  "Pharmacy watch": "Mitengo yamusamu",
  "Family alerts": "Kuzyibya mukwasyi",
  "Doctor share link": "Link yamudokota",
  "Export doctor report": "Tumina mudokota lipooti",
  Appearance: "Mbokulibonya",
  "Delete account": "Gusya akaunti",
  "AI-drafted translation — please help us improve it.": "Bupilusyi bwa AI — mutugwasye kububambulula.",
  "Severe Low": "Shuga yaceya kapati",
  Low: "Shuga yaceya",
  "In Range": "Kabotu",
  High: "Yaya atala",
  "Very High": "Yaya atala kapati",
  "Critical High": "Yaya atala cakuyoowa",
  "Hypertensive Crisis": "BP yaya atala kapati",
  "Low (Hypotension)": "BP yaceya",
  "Stage 2 High": "Yaya atala (2)",
  "Stage 1 High": "Yaya atala (1)",
  Elevated: "Yaya atala asyoonto",
  Normal: "Kabotu",
};

const DICTS: Record<Lang, Dict> = { en: {}, ny, bem, toi };

(async () => {
  try {
    const stored = (await storage.getItem<Lang>(LANG_KEY, "en")) as Lang;
    if (stored && stored in DICTS) {
      currentLang = stored;
      listeners.forEach((l) => l());
    }
  } catch {}
})();

export async function setLang(lang: Lang) {
  currentLang = lang;
  try { await storage.setItem(LANG_KEY, lang); } catch {}
  listeners.forEach((l) => l());
}

export function getLang(): Lang {
  return currentLang;
}

export function translate(key: string, lang: Lang = currentLang): string {
  return DICTS[lang][key] ?? key;
}

export function useT(): { t: (key: string) => string; lang: Lang } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((x) => x + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const lang = currentLang;
  return { t: (key: string) => translate(key, lang), lang };
}
