import { createContext, useContext, useEffect, useState } from 'react';
import { dirFor, translate } from '../i18n';

const LangContext = createContext(null);
export const useLang = () => useContext(LangContext);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lc_lang') || 'he');

  useEffect(() => {
    localStorage.setItem('lc_lang', lang);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', dirFor(lang));
  }, [lang]);

  const t = (key) => translate(lang, key);
  return <LangContext.Provider value={{ lang, setLang, dir: dirFor(lang), t }}>{children}</LangContext.Provider>;
}
