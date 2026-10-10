import { useLang } from '../context/LangContext';
import { checkPassword } from '../passwordPolicy';

// Live checklist of the password rules under a "new password" field.
// ctx = { username, email, display_name } of the account (for the "personal" rule).
export default function PasswordRules({ password, ctx }) {
  const { t } = useLang();
  const results = checkPassword(password, ctx);
  return (
    <ul className="pw-rules" aria-live="polite">
      {results.map((r) => (
        <li key={r.key} className={r.ok ? 'ok' : password ? 'bad' : ''}>
          <span className="pw-rule-mark">{r.ok ? '✓' : '•'}</span> {t(`pw.rule.${r.key}`)}
        </li>
      ))}
    </ul>
  );
}
