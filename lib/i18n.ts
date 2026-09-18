// Lightweight i18n for phase 0. English is the default; Arabic and Kurdish
// (Sorani) are right-to-left. The dictionaries cover the onboarding and login
// screens; more keys are added as screens land.

export const locales = ['en', 'ar', 'ckb'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export function dir(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'en' ? 'ltr' : 'rtl';
}

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
  ckb: 'کوردی',
};

type Dict = {
  appName: string;
  tagline: string;
  // auth
  signIn: string;
  signInWithEmail: string;
  signInWithPhone: string;
  email: string;
  phone: string;
  password: string;
  sendCode: string;
  verifyCode: string;
  code: string;
  createAccount: string;
  or: string;
  // onboarding
  onboardingTitle: string;
  businessName: string;
  city: string;
  baseCurrency: string;
  usdRate: string;
  usdRateHint: string;
  finish: string;
  // scan
  scanTitle: string;
  chooseImage: string;
  scan: string;
  scanning: string;
  result: string;
  signOut: string;
  loading: string;
};

const en: Dict = {
  appName: 'Qaydli',
  tagline: 'Snap a receipt. Keep your books.',
  signIn: 'Sign in',
  signInWithEmail: 'Email',
  signInWithPhone: 'Phone',
  email: 'Email address',
  phone: 'Phone number',
  password: 'Password',
  sendCode: 'Send code',
  verifyCode: 'Verify',
  code: 'Verification code',
  createAccount: 'Create account',
  or: 'or',
  onboardingTitle: 'Set up your business',
  businessName: 'Business name',
  city: 'City',
  baseCurrency: 'Base currency',
  usdRate: 'USD → IQD rate',
  usdRateHint: 'How many dinars to one US dollar today.',
  finish: 'Finish',
  scanTitle: 'Scan a receipt',
  chooseImage: 'Choose a photo',
  scan: 'Scan',
  scanning: 'Scanning…',
  result: 'Result',
  signOut: 'Sign out',
  loading: 'Loading…',
};

const ar: Dict = {
  appName: 'قيدلي',
  tagline: 'صوّر الإيصال. نحفظ دفاترك.',
  signIn: 'تسجيل الدخول',
  signInWithEmail: 'البريد الإلكتروني',
  signInWithPhone: 'الهاتف',
  email: 'البريد الإلكتروني',
  phone: 'رقم الهاتف',
  password: 'كلمة المرور',
  sendCode: 'إرسال الرمز',
  verifyCode: 'تأكيد',
  code: 'رمز التحقق',
  createAccount: 'إنشاء حساب',
  or: 'أو',
  onboardingTitle: 'إعداد نشاطك التجاري',
  businessName: 'اسم النشاط',
  city: 'المدينة',
  baseCurrency: 'العملة الأساسية',
  usdRate: 'سعر الدولار مقابل الدينار',
  usdRateHint: 'عدد الدنانير مقابل دولار أمريكي واحد اليوم.',
  finish: 'إنهاء',
  scanTitle: 'مسح إيصال',
  chooseImage: 'اختر صورة',
  scan: 'مسح',
  scanning: 'جارٍ المسح…',
  result: 'النتيجة',
  signOut: 'تسجيل الخروج',
  loading: 'جارٍ التحميل…',
};

const ckb: Dict = {
  appName: 'قەیدلی',
  tagline: 'وێنەی پسووڵە بگرە. دەفتەرەکانت پارێزراون.',
  signIn: 'چوونەژوورەوە',
  signInWithEmail: 'ئیمەیڵ',
  signInWithPhone: 'مۆبایل',
  email: 'ناونیشانی ئیمەیڵ',
  phone: 'ژمارەی مۆبایل',
  password: 'وشەی نهێنی',
  sendCode: 'ناردنی کۆد',
  verifyCode: 'پشتڕاستکردنەوە',
  code: 'کۆدی پشتڕاستکردنەوە',
  createAccount: 'دروستکردنی هەژمار',
  or: 'یان',
  onboardingTitle: 'ڕێکخستنی بازرگانییەکەت',
  businessName: 'ناوی بازرگانی',
  city: 'شار',
  baseCurrency: 'دراوی بنەڕەتی',
  usdRate: 'ڕێژەی دۆلار بۆ دینار',
  usdRateHint: 'چەند دیناری بۆ یەک دۆلاری ئەمریکی ئەمڕۆ.',
  finish: 'تەواوکردن',
  scanTitle: 'سکانی پسووڵە',
  chooseImage: 'وێنەیەک هەڵبژێرە',
  scan: 'سکان',
  scanning: 'سکان دەکرێت…',
  result: 'ئەنجام',
  signOut: 'چوونەدەرەوە',
  loading: 'بارکردن…',
};

export const dictionaries: Record<Locale, Dict> = { en, ar, ckb };

export type TranslationKey = keyof Dict;

export function t(locale: Locale, key: TranslationKey): string {
  return dictionaries[locale][key] ?? dictionaries[defaultLocale][key];
}
