/**
 * GlobalToggle - 总开关，Material 风格开关
 */

import { t } from '../i18n';

interface Props {
  enabled: boolean;
  onToggle: () => void;
}

export function GlobalToggle({ enabled, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      type="button"
      className={`switch ${enabled ? 'on' : ''}`}
      aria-label={t.globalToggle}
      title={`${t.globalToggle}: ${enabled ? t.on : t.off}`}
    >
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">{enabled ? t.on : t.off}</span>
    </button>
  );
}
