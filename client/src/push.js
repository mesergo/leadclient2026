// Browser Web Push helpers: register the service worker, subscribe/unsubscribe,
// and report status. The subscription is sent to our server which pushes to it.
import { api } from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// idempotent — safe to call on every app load
export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); } catch { return null; }
}

export async function enableBrowserPush(token) {
  if (!pushSupported()) throw new Error('הדפדפן לא תומך בהתראות דחיפה');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('ההרשאה להתראות נדחתה');
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const { key } = await api.vapidKey(token);
  if (!key) throw new Error('בשרת אין מפתח VAPID');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  await api.pushSubscribe(sub.toJSON(), token);
  return true;
}

export async function disableBrowserPush(token) {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) { await api.pushUnsubscribe(sub.endpoint, token).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
  return true;
}

// 'unsupported' | 'denied' | 'on' | 'off'
export async function browserPushStatus() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub ? 'on' : 'off';
}
