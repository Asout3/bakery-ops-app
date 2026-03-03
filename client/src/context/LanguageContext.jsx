import { createContext, useContext, useMemo, useState } from 'react';

const LanguageContext = createContext(null);

const translations = {
  en: {
    appTitle: 'Sina Sweet',
    signIn: 'Sign In',
    signingIn: 'Signing in...',
    username: 'Username',
    password: 'Password',
    branch: 'Location',
    dashboard: 'Dashboard',
    products: 'Products Management',
    addProduct: 'Add Product',
    newSale: 'New Sale',
    cartEmpty: 'Cart is empty',
    completeSale: 'Complete Sale',
    queueSaleOffline: 'Queue Sale (Offline)',
    processing: 'Processing...',
    inventory: 'Inventory',
    sales: 'Sales',
    expenses: 'Expenses',
    staffPayments: 'Staff Payments',
    reports: 'Reports',
    notifications: 'Notifications',
    syncQueue: 'Sync Queue',
    staffManagement: 'Staff Management',
    historyLifecycle: 'History Lifecycle',
    batches: 'Batches',
    logout: 'Logout',
    language: 'Language',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
  },
  am: {
    appTitle: 'ሲና ስዊት',
    signIn: 'ግባ',
    signingIn: 'በመግባት ላይ...',
    username: 'የተጠቃሚ ስም',
    password: 'የይለፍ ቃል',
    branch: 'ቦታ',
    dashboard: 'ዳሽቦርድ',
    products: 'የምርት አስተዳደር',
    addProduct: 'ምርት ጨምር',
    newSale: 'አዲስ ሽያጭ',
    cartEmpty: 'ጋሪው ባዶ ነው',
    completeSale: 'ሽያጭ አጠናቅቅ',
    queueSaleOffline: 'ከመስመር ውጭ ሽያጭ አስቀምጥ',
    processing: 'በሂደት ላይ...',
    inventory: 'ኢንቨንተሪ',
    sales: 'ሽያጭ',
    expenses: 'ወጪዎች',
    staffPayments: 'የሰራተኛ ክፍያ',
    reports: 'ሪፖርቶች',
    notifications: 'ማሳወቂያዎች',
    syncQueue: 'ሲንክ ዝርዝር',
    staffManagement: 'የሰራተኛ አስተዳደር',
    historyLifecycle: 'ታሪክ ላይፍሳይክል',
    batches: 'ባች',
    logout: 'ውጣ',
    language: 'ቋንቋ',
    theme: 'ገጽታ',
    light: 'ብርሃን',
    dark: 'ጨለማ',
  },
};

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(localStorage.getItem('lang') || 'en');

  const setLang = (lang) => {
    setLanguage(lang);
    localStorage.setItem('lang', lang);
  };

  const t = (key) => translations[language]?.[key] || translations.en[key] || key;

  const value = useMemo(() => ({ language, setLang, t }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
