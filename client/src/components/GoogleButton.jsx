import { useEffect, useRef } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

let gisPromise;
function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.id) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gis_load_failed'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

// Renders the official Google Sign-In button. Hidden entirely when no client id
// is configured (VITE_GOOGLE_CLIENT_ID). Calls onCredential(credential) on success.
export default function GoogleButton({ onCredential, onError }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!CLIENT_ID) return undefined;
    let cancelled = false;
    loadGis().then(() => {
      if (cancelled || !ref.current || !(window.google && window.google.accounts && window.google.accounts.id)) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (resp) => { if (resp && resp.credential) onCredential(resp.credential); },
      });
      window.google.accounts.id.renderButton(ref.current, {
        theme: 'outline', size: 'large', type: 'standard', shape: 'rectangular',
        width: ref.current.offsetWidth || 320,
      });
    }).catch(() => onError && onError());
    return () => { cancelled = true; };
  }, []);
  if (!CLIENT_ID) return null;
  return <div ref={ref} style={{ display: 'flex', justifyContent: 'center' }} />;
}
