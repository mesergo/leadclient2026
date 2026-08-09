import { createContext, useContext, useEffect, useState } from 'react';
import { dirFor, translate } from '../i18n';
import { API_ORIGIN } from '../api';

const LangContext = createContext(null);
export const useLang = () => useContext(LangContext);

// The bundled dictionary only has he/en; every other language falls back to
// English and is filled in via DB translation overrides.
const baseOf = (l) => (String(l).startsWith('he') ? 'he' : 'en');
const dbSlug = (l) => (l === 'he' ? 'he_IL' : l);

const DEFAULT_LANGS = [
  { slug: 'he_IL', language: 'עברית', is_rtl: 1 },
  { slug: 'en', language: 'English', is_rtl: 0 },
];

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const s = localStorage.getItem('lc_lang');
    return s === 'he' ? 'he_IL' : (s || 'he_IL');
  });
  const [langs, setLangs] = useState(DEFAULT_LANGS);
  const [overrides, setOverrides] = useState({});

  // active languages for the picker
  useEffect(() => {
    fetch(`${API_ORIGIN}/api/public/languages`).then((r) => r.json())
      .then((d) => { if (d.languages?.length) setLangs(d.languages); }).catch(() => {});
  }, []);

  // apply dir + load this language's DB overrides
  useEffect(() => {
    localStorage.setItem('lc_lang', lang);
    const rtl = langs.find((l) => l.slug === lang)?.is_rtl;
    const dir = rtl != null ? (rtl ? 'rtl' : 'ltr') : dirFor(lang);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', dir);
    fetch(`${API_ORIGIN}/api/public/translations/${dbSlug(lang)}`).then((r) => r.json())
      .then((d) => setOverrides(d.strings || {})).catch(() => setOverrides({}));
  }, [lang, langs]);

  const rtl = langs.find((l) => l.slug === lang)?.is_rtl;
  const dir = rtl != null ? (rtl ? 'rtl' : 'ltr') : dirFor(lang);
  const base = baseOf(lang);
  const t = (key) => {
    const o = overrides[key];
    return (o != null && o !== '') ? o : translate(base, key);
  };

  return <LangContext.Provider value={{ lang, setLang, langs, dir, t }}>{children}</LangContext.Provider>;
}
