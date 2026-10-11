import { useState } from 'react';
import { useLang } from '../context/LangContext';

// Top-of-page banner on phones: Android -> the Play Store app, iPhone -> the installable
// web app at /m (Add to Home Screen). Dismissed for 14 days per browser.
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.leadclient.crm';
// the Play listing is still internal-testing only — flip to true once the app is public
const ANDROID_APP_PUBLIC = false;
const DISMISS_KEY = 'lc_app_banner_dismissed';
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

function platform() {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  // iPadOS reports a Mac user agent — tell it apart by touch support
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return null;
}

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

export default function MobileAppBanner() {
  const { t } = useLang();
  const [os] = useState(platform);
  const [hidden, setHidden] = useState(dismissedRecently);
  const [iosHelp, setIosHelp] = useState(false);
  if (!os || hidden) return null;

  const close = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
    setHidden(true);
  };

  // Android -> the Play app once it is public, until then the same installable web app as iPhone
  const androidHref = ANDROID_APP_PUBLIC ? PLAY_URL : '/m/';

  return (
    <>
      <div className="app-banner" role="region" aria-label="LeadClient app">
        <img src="/m/icon-192.png" alt="" className="app-banner-icon" />
        {os === 'android'
          ? <a className="app-banner-link" href={androidHref} {...(ANDROID_APP_PUBLIC ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{t('app.banner.cta')}</a>
          : <button type="button" className="app-banner-link" onClick={() => setIosHelp(true)}>{t('app.banner.cta')}</button>}
        <button type="button" className="app-banner-close" aria-label={t('app.banner.close')} onClick={close}>×</button>
      </div>
      {iosHelp && (
        <div className="app-ios-overlay" onClick={() => setIosHelp(false)}>
          <div className="app-ios-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>{t('app.ios.title')}</h3>
            <ol>
              <li>{t('app.ios.step1')}</li>
              <li>{t('app.ios.step2')}</li>
              <li>{t('app.ios.step3')}</li>
            </ol>
            <p className="muted">{t('app.ios.note')}</p>
            <a className="btn btn-primary" style={{ width: '100%', textAlign: 'center' }} href="/m/">{t('app.ios.open')}</a>
            <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => setIosHelp(false)}>{t('app.banner.close')}</button>
          </div>
        </div>
      )}
    </>
  );
}
