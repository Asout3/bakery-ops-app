import { createContext, useContext, useMemo, useState } from 'react';

const LanguageContext = createContext(null);

const translations = {
  en: {
    appTitle: 'Bakery Operations System',
    signIn: 'Sign In',
    signingIn: 'Signing in...',
    username: 'Username',
    password: 'Password',
    demo: 'Demo credentials:',
    branch: 'Branch',
    dashboard: 'Dashboard',
    products: 'Products Management',
    addProduct: 'Add Product',
    newSale: 'New Sale',
    cartEmpty: 'Cart is empty',
    completeSale: 'Complete Sale',
    queueSaleOffline: 'Queue Sale (Offline)',
    processing: 'Processing...',
  },
  am: {
    appTitle: 'የቤከሪ ኦፕሬሽን ሲስተም',
    signIn: 'ግባ',
    signingIn: 'በመግባት ላይ...',
    username: 'የተጠቃሚ ስም',
    password: 'የይለፍ ቃል',
    demo: 'የሙከራ መረጃ:',
    branch: 'ቅርንጫፍ',
    dashboard: 'ዳሽቦርድ',
    products: 'የምርት አስተዳደር',
    addProduct: 'ምርት ጨምር',
    newSale: 'አዲስ ሽያጭ',
    cartEmpty: 'ጋሪው ባዶ ነው',
    completeSale: 'ሽያጭ አጠናቅቅ',
    queueSaleOffline: 'ከመስመር ውጭ ሽያጭ አስቀምጥ',
    processing: 'በሂደት ላይ...',
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
