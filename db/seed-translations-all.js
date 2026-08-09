// Translate the core UI (navigation, common terms, buttons, page titles/labels)
// into every listed language. en/en_UK stay English and he_IL stays Hebrew
// (already seeded); this fills ar/de/es/fr/pt/ru. Keys not listed keep the
// English fallback. Usage: node db/seed-translations-all.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

// Canonical key order (for reference); each language block below uses these keys.
const T = {
  ar: {
    'nav.dashboard': 'لوحة التحكم', 'nav.agencies': 'الوكالات', 'nav.companies': 'الشركات', 'nav.leads': 'العملاء المحتملون', 'nav.import': 'استيراد عملاء', 'nav.virtual': 'الأرقام الافتراضية', 'nav.reports': 'التقارير', 'nav.contacts': 'جهات الاتصال', 'nav.users': 'المستخدمون', 'nav.billing': 'مركز الفوترة', 'nav.language': 'ترجمات النظام', 'nav.profile': 'الملف الشخصي', 'nav.developers': 'المطورون',
    'header.welcome': 'مرحبًا', 'header.logout': 'تسجيل الخروج',
    'login.username': 'اسم المستخدم', 'login.password': 'كلمة المرور', 'login.signin': 'تسجيل الدخول', 'login.signing': 'جارٍ الدخول...',
    'common.search': 'بحث', 'common.add': 'إضافة', 'common.save': 'حفظ', 'common.back': 'رجوع', 'common.loading': 'جارٍ التحميل...', 'common.none': 'لا توجد بيانات.', 'common.yes': 'نعم', 'common.no': 'لا', 'common.phone': 'هاتف', 'common.email': 'بريد إلكتروني', 'common.company': 'شركة', 'common.agency': 'وكالة', 'common.status': 'الحالة', 'common.name': 'الاسم', 'common.amount': 'الكمية', 'common.date': 'التاريخ', 'common.all': 'الكل',
    'dp.allTime': 'كل الأوقات', 'dp.today': 'اليوم', 'dp.yesterday': 'أمس', 'dp.last7': 'آخر 7 أيام', 'dp.thisMonth': 'هذا الشهر', 'dp.last30': 'آخر 30 يومًا', 'dp.prevMonth': 'الشهر الماضي',
    'dash.show': 'عرض', 'dash.recent': 'الإجراءات الأخيرة', 'dash.online': 'المستخدمون المتصلون',
    'lead.name': 'اسم المتصل', 'lead.channel': 'قناة', 'lead.received': 'ورد في', 'lead.status': 'الحالة', 'lead.tags': 'الوسوم', 'lead.export': 'تصدير', 'lead.na': 'غير متاح',
    'con.details': 'تفاصيل جهة الاتصال', 'con.leads': 'العملاء المستلمون', 'con.add': 'إضافة جهة اتصال', 'con.back': 'رجوع', 'con.save': 'حفظ',
    'usr.total': 'كل المستخدمين', 'usr.online': 'متصلون الآن', 'usr.role': 'الدور', 'usr.lastSeen': 'آخر ظهور', 'usr.active': 'نشط', 'usr.actions': 'إجراءات', 'usr.loginAs': 'الدخول بصفة',
    'vir.number': 'رقم افتراضي', 'vir.target': 'الوجهة', 'vir.provider': 'مزوّد IVR', 'vir.leads': 'عملاء', 'vir.unassigned': 'غير مُسند',
    'rep.total': 'إجمالي العملاء', 'rep.statuses': 'الحالات', 'rep.campaigns': 'الحملات', 'rep.devices': 'حسب الجهاز', 'rep.grandTotal': 'الإجمالي',
    'es.title': 'تعديل القناة', 'es.save': 'حفظ القناة', 'es.back': 'رجوع', 'pr.title': 'الملف الشخصي', 'lng.title': 'الترجمات', 'imp.doImport': 'استيراد',
  },
  de: {
    'nav.dashboard': 'Übersicht', 'nav.agencies': 'Agenturen', 'nav.companies': 'Firmen', 'nav.leads': 'Leads', 'nav.import': 'Leads importieren', 'nav.virtual': 'Virtuelle Nummern', 'nav.reports': 'Berichte', 'nav.contacts': 'Kontakte', 'nav.users': 'Benutzer', 'nav.billing': 'Abrechnung', 'nav.language': 'Übersetzungen', 'nav.profile': 'Profil', 'nav.developers': 'Entwickler',
    'header.welcome': 'Willkommen', 'header.logout': 'Abmelden',
    'login.username': 'Benutzername', 'login.password': 'Passwort', 'login.signin': 'Anmelden', 'login.signing': 'Anmeldung...',
    'common.search': 'Suchen', 'common.add': 'Hinzufügen', 'common.save': 'Speichern', 'common.back': 'Zurück', 'common.loading': 'Wird geladen...', 'common.none': 'Keine Daten.', 'common.yes': 'Ja', 'common.no': 'Nein', 'common.phone': 'Telefon', 'common.email': 'E-Mail', 'common.company': 'Firma', 'common.agency': 'Agentur', 'common.status': 'Status', 'common.name': 'Name', 'common.amount': 'Anzahl', 'common.date': 'Datum', 'common.all': 'Alle',
    'dp.allTime': 'Gesamter Zeitraum', 'dp.today': 'Heute', 'dp.yesterday': 'Gestern', 'dp.last7': 'Letzte 7 Tage', 'dp.thisMonth': 'Dieser Monat', 'dp.last30': 'Letzte 30 Tage', 'dp.prevMonth': 'Letzter Monat',
    'dash.show': 'Anzeigen', 'dash.recent': 'Letzte Aktionen', 'dash.online': 'Online-Benutzer',
    'lead.name': 'Anrufername', 'lead.channel': 'Kanal', 'lead.received': 'Erhalten', 'lead.status': 'Status', 'lead.tags': 'Tags', 'lead.export': 'Export', 'lead.na': 'N/V',
    'con.details': 'Kontaktdetails', 'con.leads': 'Eingegangene Leads', 'con.add': 'Kontakt hinzufügen', 'con.back': 'Zurück', 'con.save': 'Speichern',
    'usr.total': 'Alle Benutzer', 'usr.online': 'Jetzt online', 'usr.role': 'Rolle', 'usr.lastSeen': 'Zuletzt gesehen', 'usr.active': 'Aktiv', 'usr.actions': 'Aktionen', 'usr.loginAs': 'Anmelden als',
    'vir.number': 'Virtuelle Nummer', 'vir.target': 'Ziel', 'vir.provider': 'IVR-Anbieter', 'vir.leads': 'Leads', 'vir.unassigned': 'Nicht zugewiesen',
    'rep.total': 'Leads gesamt', 'rep.statuses': 'Status', 'rep.campaigns': 'Kampagnen', 'rep.devices': 'Nach Gerät', 'rep.grandTotal': 'Gesamt',
    'es.title': 'Kanal bearbeiten', 'es.save': 'Kanal speichern', 'es.back': 'Zurück', 'pr.title': 'Profil', 'lng.title': 'Übersetzungen', 'imp.doImport': 'Importieren',
  },
  es: {
    'nav.dashboard': 'Panel de control', 'nav.agencies': 'Agencias', 'nav.companies': 'Empresas', 'nav.leads': 'Prospectos', 'nav.import': 'Importar prospectos', 'nav.virtual': 'Números virtuales', 'nav.reports': 'Informes', 'nav.contacts': 'Contactos', 'nav.users': 'Usuarios', 'nav.billing': 'Facturación', 'nav.language': 'Traducciones', 'nav.profile': 'Perfil', 'nav.developers': 'Desarrolladores',
    'header.welcome': 'Bienvenido', 'header.logout': 'Cerrar sesión',
    'login.username': 'Usuario', 'login.password': 'Contraseña', 'login.signin': 'Iniciar sesión', 'login.signing': 'Iniciando...',
    'common.search': 'Buscar', 'common.add': 'Agregar', 'common.save': 'Guardar', 'common.back': 'Volver', 'common.loading': 'Cargando...', 'common.none': 'Sin datos.', 'common.yes': 'Sí', 'common.no': 'No', 'common.phone': 'Teléfono', 'common.email': 'Correo', 'common.company': 'Empresa', 'common.agency': 'Agencia', 'common.status': 'Estado', 'common.name': 'Nombre', 'common.amount': 'Cantidad', 'common.date': 'Fecha', 'common.all': 'Todos',
    'dp.allTime': 'Todo el tiempo', 'dp.today': 'Hoy', 'dp.yesterday': 'Ayer', 'dp.last7': 'Últimos 7 días', 'dp.thisMonth': 'Este mes', 'dp.last30': 'Últimos 30 días', 'dp.prevMonth': 'Mes anterior',
    'dash.show': 'Mostrar', 'dash.recent': 'Acciones recientes', 'dash.online': 'Usuarios conectados',
    'lead.name': 'Nombre del contacto', 'lead.channel': 'Canal', 'lead.received': 'Recibido', 'lead.status': 'Estado', 'lead.tags': 'Etiquetas', 'lead.export': 'Exportar', 'lead.na': 'N/D',
    'con.details': 'Detalles del contacto', 'con.leads': 'Prospectos recibidos', 'con.add': 'Agregar contacto', 'con.back': 'Volver', 'con.save': 'Guardar',
    'usr.total': 'Todos los usuarios', 'usr.online': 'En línea ahora', 'usr.role': 'Rol', 'usr.lastSeen': 'Última conexión', 'usr.active': 'Activo', 'usr.actions': 'Acciones', 'usr.loginAs': 'Entrar como',
    'vir.number': 'Número virtual', 'vir.target': 'Destino', 'vir.provider': 'Proveedor IVR', 'vir.leads': 'Prospectos', 'vir.unassigned': 'Sin asignar',
    'rep.total': 'Total de prospectos', 'rep.statuses': 'Estados', 'rep.campaigns': 'Campañas', 'rep.devices': 'Por dispositivo', 'rep.grandTotal': 'Total',
    'es.title': 'Editar canal', 'es.save': 'Guardar canal', 'es.back': 'Volver', 'pr.title': 'Perfil', 'lng.title': 'Traducciones', 'imp.doImport': 'Importar',
  },
  fr: {
    'nav.dashboard': 'Tableau de bord', 'nav.agencies': 'Agences', 'nav.companies': 'Entreprises', 'nav.leads': 'Prospects', 'nav.import': 'Importer des prospects', 'nav.virtual': 'Numéros virtuels', 'nav.reports': 'Rapports', 'nav.contacts': 'Contacts', 'nav.users': 'Utilisateurs', 'nav.billing': 'Facturation', 'nav.language': 'Traductions', 'nav.profile': 'Profil', 'nav.developers': 'Développeurs',
    'header.welcome': 'Bienvenue', 'header.logout': 'Déconnexion',
    'login.username': "Nom d'utilisateur", 'login.password': 'Mot de passe', 'login.signin': 'Se connecter', 'login.signing': 'Connexion...',
    'common.search': 'Rechercher', 'common.add': 'Ajouter', 'common.save': 'Enregistrer', 'common.back': 'Retour', 'common.loading': 'Chargement...', 'common.none': 'Aucune donnée.', 'common.yes': 'Oui', 'common.no': 'Non', 'common.phone': 'Téléphone', 'common.email': 'E-mail', 'common.company': 'Entreprise', 'common.agency': 'Agence', 'common.status': 'Statut', 'common.name': 'Nom', 'common.amount': 'Quantité', 'common.date': 'Date', 'common.all': 'Tous',
    'dp.allTime': 'Toute la période', 'dp.today': "Aujourd'hui", 'dp.yesterday': 'Hier', 'dp.last7': '7 derniers jours', 'dp.thisMonth': 'Ce mois-ci', 'dp.last30': '30 derniers jours', 'dp.prevMonth': 'Mois dernier',
    'dash.show': 'Afficher', 'dash.recent': 'Actions récentes', 'dash.online': 'Utilisateurs en ligne',
    'lead.name': "Nom de l'appelant", 'lead.channel': 'Canal', 'lead.received': 'Reçu', 'lead.status': 'Statut', 'lead.tags': 'Étiquettes', 'lead.export': 'Exporter', 'lead.na': 'N/D',
    'con.details': 'Détails du contact', 'con.leads': 'Prospects reçus', 'con.add': 'Ajouter un contact', 'con.back': 'Retour', 'con.save': 'Enregistrer',
    'usr.total': 'Tous les utilisateurs', 'usr.online': 'En ligne', 'usr.role': 'Rôle', 'usr.lastSeen': 'Dernière connexion', 'usr.active': 'Actif', 'usr.actions': 'Actions', 'usr.loginAs': 'Se connecter en tant que',
    'vir.number': 'Numéro virtuel', 'vir.target': 'Destination', 'vir.provider': 'Fournisseur IVR', 'vir.leads': 'Prospects', 'vir.unassigned': 'Non attribué',
    'rep.total': 'Total des prospects', 'rep.statuses': 'Statuts', 'rep.campaigns': 'Campagnes', 'rep.devices': 'Par appareil', 'rep.grandTotal': 'Total',
    'es.title': 'Modifier le canal', 'es.save': 'Enregistrer le canal', 'es.back': 'Retour', 'pr.title': 'Profil', 'lng.title': 'Traductions', 'imp.doImport': 'Importer',
  },
  pt: {
    'nav.dashboard': 'Painel', 'nav.agencies': 'Agências', 'nav.companies': 'Empresas', 'nav.leads': 'Leads', 'nav.import': 'Importar leads', 'nav.virtual': 'Números virtuais', 'nav.reports': 'Relatórios', 'nav.contacts': 'Contatos', 'nav.users': 'Usuários', 'nav.billing': 'Faturação', 'nav.language': 'Traduções', 'nav.profile': 'Perfil', 'nav.developers': 'Desenvolvedores',
    'header.welcome': 'Bem-vindo', 'header.logout': 'Sair',
    'login.username': 'Usuário', 'login.password': 'Senha', 'login.signin': 'Entrar', 'login.signing': 'Entrando...',
    'common.search': 'Buscar', 'common.add': 'Adicionar', 'common.save': 'Salvar', 'common.back': 'Voltar', 'common.loading': 'Carregando...', 'common.none': 'Sem dados.', 'common.yes': 'Sim', 'common.no': 'Não', 'common.phone': 'Telefone', 'common.email': 'E-mail', 'common.company': 'Empresa', 'common.agency': 'Agência', 'common.status': 'Status', 'common.name': 'Nome', 'common.amount': 'Quantidade', 'common.date': 'Data', 'common.all': 'Todos',
    'dp.allTime': 'Todo o período', 'dp.today': 'Hoje', 'dp.yesterday': 'Ontem', 'dp.last7': 'Últimos 7 dias', 'dp.thisMonth': 'Este mês', 'dp.last30': 'Últimos 30 dias', 'dp.prevMonth': 'Mês anterior',
    'dash.show': 'Mostrar', 'dash.recent': 'Ações recentes', 'dash.online': 'Usuários online',
    'lead.name': 'Nome do contato', 'lead.channel': 'Canal', 'lead.received': 'Recebido', 'lead.status': 'Status', 'lead.tags': 'Etiquetas', 'lead.export': 'Exportar', 'lead.na': 'N/D',
    'con.details': 'Detalhes do contato', 'con.leads': 'Leads recebidos', 'con.add': 'Adicionar contato', 'con.back': 'Voltar', 'con.save': 'Salvar',
    'usr.total': 'Todos os usuários', 'usr.online': 'Online agora', 'usr.role': 'Função', 'usr.lastSeen': 'Visto por último', 'usr.active': 'Ativo', 'usr.actions': 'Ações', 'usr.loginAs': 'Entrar como',
    'vir.number': 'Número virtual', 'vir.target': 'Destino', 'vir.provider': 'Provedor IVR', 'vir.leads': 'Leads', 'vir.unassigned': 'Não atribuído',
    'rep.total': 'Total de leads', 'rep.statuses': 'Status', 'rep.campaigns': 'Campanhas', 'rep.devices': 'Por dispositivo', 'rep.grandTotal': 'Total',
    'es.title': 'Editar canal', 'es.save': 'Salvar canal', 'es.back': 'Voltar', 'pr.title': 'Perfil', 'lng.title': 'Traduções', 'imp.doImport': 'Importar',
  },
  ru: {
    'nav.dashboard': 'Панель управления', 'nav.agencies': 'Агентства', 'nav.companies': 'Компании', 'nav.leads': 'Лиды', 'nav.import': 'Импорт лидов', 'nav.virtual': 'Виртуальные номера', 'nav.reports': 'Отчёты', 'nav.contacts': 'Контакты', 'nav.users': 'Пользователи', 'nav.billing': 'Биллинг', 'nav.language': 'Переводы', 'nav.profile': 'Профиль', 'nav.developers': 'Разработчики',
    'header.welcome': 'Добро пожаловать', 'header.logout': 'Выйти',
    'login.username': 'Имя пользователя', 'login.password': 'Пароль', 'login.signin': 'Войти', 'login.signing': 'Вход...',
    'common.search': 'Поиск', 'common.add': 'Добавить', 'common.save': 'Сохранить', 'common.back': 'Назад', 'common.loading': 'Загрузка...', 'common.none': 'Нет данных.', 'common.yes': 'Да', 'common.no': 'Нет', 'common.phone': 'Телефон', 'common.email': 'Эл. почта', 'common.company': 'Компания', 'common.agency': 'Агентство', 'common.status': 'Статус', 'common.name': 'Имя', 'common.amount': 'Количество', 'common.date': 'Дата', 'common.all': 'Все',
    'dp.allTime': 'За всё время', 'dp.today': 'Сегодня', 'dp.yesterday': 'Вчера', 'dp.last7': 'Последние 7 дней', 'dp.thisMonth': 'Этот месяц', 'dp.last30': 'Последние 30 дней', 'dp.prevMonth': 'Прошлый месяц',
    'dash.show': 'Показать', 'dash.recent': 'Последние действия', 'dash.online': 'Пользователи онлайн',
    'lead.name': 'Имя обратившегося', 'lead.channel': 'Канал', 'lead.received': 'Получено', 'lead.status': 'Статус', 'lead.tags': 'Теги', 'lead.export': 'Экспорт', 'lead.na': 'Н/Д',
    'con.details': 'Данные контакта', 'con.leads': 'Полученные лиды', 'con.add': 'Добавить контакт', 'con.back': 'Назад', 'con.save': 'Сохранить',
    'usr.total': 'Все пользователи', 'usr.online': 'Сейчас онлайн', 'usr.role': 'Роль', 'usr.lastSeen': 'Был(а) в сети', 'usr.active': 'Активен', 'usr.actions': 'Действия', 'usr.loginAs': 'Войти как',
    'vir.number': 'Виртуальный номер', 'vir.target': 'Назначение', 'vir.provider': 'IVR-провайдер', 'vir.leads': 'Лиды', 'vir.unassigned': 'Не назначено',
    'rep.total': 'Всего лидов', 'rep.statuses': 'Статусы', 'rep.campaigns': 'Кампании', 'rep.devices': 'По устройству', 'rep.grandTotal': 'Итого',
    'es.title': 'Редактировать канал', 'es.save': 'Сохранить канал', 'es.back': 'Назад', 'pr.title': 'Профиль', 'lng.title': 'Переводы', 'imp.doImport': 'Импорт',
  },
};

const ns = (k) => (k.includes('.') ? k.split('.')[0] : 'general');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  let total = 0;
  for (const [slug, dict] of Object.entries(T)) {
    for (const [k, v] of Object.entries(dict)) {
      await conn.query(
        `INSERT INTO translation_strings (lang_slug, string_key, namespace, string_value)
         VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE string_value = VALUES(string_value)`,
        [slug, k, ns(k), v]);
      total++;
    }
    console.log(`  ${slug}: ${Object.keys(dict).length} strings`);
  }
  console.log(`✅ ${total} translated strings upserted.`);
  await conn.end();
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
