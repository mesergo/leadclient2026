function I({ children, size = 18, fill = 'none', ...p }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>);
}
export const Grid = (p) => <I {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></I>;
export const Building = (p) => <I {...p}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01"/></I>;
export const Users = (p) => <I {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></I>;
export const Inbox = (p) => <I {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></I>;
export const Upload = (p) => <I {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></I>;
export const Phone = (p) => <I {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></I>;
export const Chart = (p) => <I {...p}><path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/></I>;
export const User = (p) => <I {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></I>;
export const Globe = (p) => <I {...p}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></I>;
export const Card = (p) => <I {...p}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></I>;
export const Contacts = (p) => <I {...p}><path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2M4 4h16v16H4zM12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></I>;
export const Code = (p) => <I {...p}><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></I>;
export const Bell = (p) => <I {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></I>;
export const Menu = (p) => <I {...p}><path d="M4 6h16M4 12h16M4 18h16"/></I>;
export const X = (p) => <I {...p}><path d="M18 6 6 18M6 6l12 12"/></I>;
export const Check = (p) => <I {...p}><path d="M20 6 9 17l-5-5"/></I>;
export const Pencil = (p) => <I {...p}><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></I>;
export const Lock = (p) => <I {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></I>;
export const Swap = (p) => <I {...p}><path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/></I>;
export const Trash = (p) => <I {...p}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></I>;
export const Star = ({ filled, ...p }) => <I {...p} fill={filled ? 'currentColor' : 'none'}><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></I>;
