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
  },
  am: {
    appTitle: 'የቤከሪ ኦፕሬሽን ሲስተም',
    signIn: 'ግባ',
    signingIn: 'በመግባት ላይ...',
    username: 'የተጠቃሚ ስም',
    password: 'የይለፍ ቃል',
    demo: 'የሙከራ መረጃ:',
    branch: 'ቅርንጫፍ',
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
