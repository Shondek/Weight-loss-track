import type { KeyboardEvent, ReactNode } from 'react';
import Icon, { type IconComponent } from './Icon';

export type TabItem<Id extends string> = {
  id: Id;
  label: string;
  icon: IconComponent;
  /** נקודת "ממתין" ליד התווית (צ'ק-אין שטרם מולא). */
  dot?: boolean | undefined;
  /** טקסט לקורא מסך עבור הנקודה. */
  dotLabel?: string | undefined;
};

type Props<Id extends string> = {
  tabs: readonly TabItem<Id>[];
  selected: Id;
  onSelect: (id: Id) => void;
  /** ref לכל כפתור, לניהול הפוקוס בניווט בחצים. */
  tabRef?: ((id: Id, el: HTMLButtonElement | null) => void) | undefined;
  onKeyDown?: ((e: KeyboardEvent<HTMLDivElement>) => void) | undefined;
  /** `aria-label` של ה-nav ושל ה-tablist. */
  navLabel: string;
  listLabel: string;
  /** מזהה הפאנל שכל טאב שולט בו: `panel-${id}`. */
  panelId?: ((id: Id) => string) | undefined;
  tabId?: ((id: Id) => string) | undefined;
  children?: ReactNode;
};

/**
 * ניווט תחתון: משטח, אייקון 24 + תווית 11, הטאב הפעיל במבטא. אותם טאבים,
 * אותם שמות, אותו סדר ואותה נגישות (role=tablist, חצים, tabIndex) כמו היום.
 */
export default function TabBar<Id extends string>({ tabs, selected, onSelect, tabRef, onKeyDown, navLabel, listLabel, panelId, tabId }: Props<Id>) {
  return (
    <nav className="tabs" aria-label={navLabel}>
      <div
        className="tabs__inner"
        role="tablist"
        aria-label={listLabel}
        onKeyDown={onKeyDown}
        style={{ ['--tabs-count' as string]: tabs.length }}
      >
        {tabs.map((t) => {
          const isSelected = selected === t.id;
          return (
            <button
              key={t.id}
              id={tabId ? tabId(t.id) : `tab-${t.id}`}
              ref={(el) => tabRef?.(t.id, el)}
              type="button"
              role="tab"
              className="tab"
              aria-selected={isSelected}
              aria-controls={panelId ? panelId(t.id) : `panel-${t.id}`}
              // רק הטאב הפעיל בסדר ה-Tab; החצים מזיזים בין הטאבים.
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(t.id)}
            >
              <span className="tab__icon">
                <Icon icon={t.icon} size={24} />
              </span>
              <span className="tab__label">
                {t.label}
                {t.dot && (
                  <>
                    <span className="tab__dot" aria-hidden="true" />
                    <span className="visually-hidden">{t.dotLabel ?? 'ממתין'}</span>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
