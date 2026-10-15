import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TooltipSettings, ZoomMethod, RotationHandleType, ElementPlacementStrategy } from '../types';
import { api } from '../services/api';

export interface RulerSettings {
  showHorizontal: boolean;
  showVertical: boolean;
  showSheet: boolean;
  showHud: boolean;
}

export interface UIPreferences {
  defaultZoom: number;
  zoomMethod: ZoomMethod;
  autoSaveIntervalSec: number;
  rulerMode: 'sheet_margins' | 'window_frame' | 'floating' | 'hidden';
  rulerOffsetPx: number;
  showTopRuler: boolean;
  showLeftRuler: boolean;
  showSheetRulers: boolean;
  showFloatingHud: boolean;
  hudPosition: { x: number; y: number } | null;
  lockPropertyInspector: boolean;
  lockLeftSidebar: boolean;
  rotationHandleType?: RotationHandleType;
  rotationSnapEnabled?: boolean;
  rotationSnapAngle?: number;
  elementPlacementStrategy?: ElementPlacementStrategy;
}

interface TooltipContextType {
  tooltipSettings: TooltipSettings;
  gridSnapSensitivityMm: number;
  themeMode: 'light' | 'dark' | 'eink_high_contrast';
  uiPreferences: UIPreferences;
  rulerSettings: RulerSettings;
  isPreferencesModalOpen: boolean;
  openPreferencesModal: () => void;
  closePreferencesModal: () => void;
  updateTooltipSettings: (settings: Partial<TooltipSettings>) => void;
  updateUIPreferences: (prefs: Partial<UIPreferences>) => void;
  updateRulerSettings: (settings: Partial<RulerSettings>) => void;
  setGridSnapSensitivityMm: (val: number) => void;
  setThemeMode: (mode: 'light' | 'dark' | 'eink_high_contrast') => void;
}

const DEFAULT_SETTINGS: TooltipSettings = {
  enabled: true,
  hoverDelayMs: 300,
  opacityPercent: 95,
  autoDismissSec: 6,
};

const DEFAULT_RULER_SETTINGS: RulerSettings = {
  showHorizontal: true,
  showVertical: true,
  showSheet: true,
  showHud: true,
};

const DEFAULT_UI_PREFERENCES: UIPreferences = {
  defaultZoom: 1.25,
  zoomMethod: 'pointer',
  autoSaveIntervalSec: 30,
  rulerMode: 'window_frame',
  rulerOffsetPx: 40,
  showTopRuler: true,
  showLeftRuler: true,
  showSheetRulers: true,
  showFloatingHud: true,
  hudPosition: null,
  lockPropertyInspector: true,
  lockLeftSidebar: true,
  rotationHandleType: 'top_stem',
  rotationSnapEnabled: true,
  rotationSnapAngle: 15,
  elementPlacementStrategy: 'ergonomic_smart',
};

const TooltipContext = createContext<TooltipContextType | undefined>(undefined);

export const TooltipProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tooltipSettings, setTooltipSettings] = useState<TooltipSettings>(DEFAULT_SETTINGS);
  const [uiPreferences, setUiPreferences] = useState<UIPreferences>(DEFAULT_UI_PREFERENCES);
  const [rulerSettings, setRulerSettings] = useState<RulerSettings>(DEFAULT_RULER_SETTINGS);
  const [gridSnapSensitivityMm, setGridSnapSensitivityMmState] = useState<number>(1.0);
  const [themeMode, setThemeModeState] = useState<'light' | 'dark' | 'eink_high_contrast'>('light');
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);

  // Load preferences from SQLite kv on startup
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [ttVal, uiVal, rulerVal, gridVal, themeVal] = await Promise.all([
          api.prefsGet('estudio_tooltip_settings_v1'),
          api.prefsGet('estudio_ui_preferences_v1'),
          api.prefsGet('estudio_ruler_settings_v1'),
          api.prefsGet('estudio_grid_snap_mm'),
          api.prefsGet('estudio_theme_mode'),
        ]);
        if (!isMounted) return;
        if (ttVal) {
          try { setTooltipSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(ttVal) }); } catch {}
        }
        if (uiVal) {
          try { setUiPreferences({ ...DEFAULT_UI_PREFERENCES, ...JSON.parse(uiVal) }); } catch {}
        }
        if (rulerVal) {
          try { setRulerSettings({ ...DEFAULT_RULER_SETTINGS, ...JSON.parse(rulerVal) }); } catch {}
        }
        if (gridVal) {
          const num = Number(gridVal);
          if (!isNaN(num) && num > 0) setGridSnapSensitivityMmState(num);
        }
        if (themeVal && ['light', 'dark', 'eink_high_contrast'].includes(themeVal)) {
          setThemeModeState(themeVal as any);
        }
      } catch (err) {
        console.warn('Failed to load preferences from SQLite', err);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    api.prefsSet('estudio_tooltip_settings_v1', JSON.stringify(tooltipSettings)).catch(() => {});
  }, [tooltipSettings]);

  useEffect(() => {
    api.prefsSet('estudio_ui_preferences_v1', JSON.stringify(uiPreferences)).catch(() => {});
  }, [uiPreferences]);

  useEffect(() => {
    api.prefsSet('estudio_ruler_settings_v1', JSON.stringify(rulerSettings)).catch(() => {});
  }, [rulerSettings]);

  useEffect(() => {
    api.prefsSet('estudio_grid_snap_mm', String(gridSnapSensitivityMm)).catch(() => {});
  }, [gridSnapSensitivityMm]);

  useEffect(() => {
    api.prefsSet('estudio_theme_mode', themeMode).catch(() => {});
  }, [themeMode]);

  const updateTooltipSettings = (partial: Partial<TooltipSettings>) => {
    setTooltipSettings((prev) => ({ ...prev, ...partial }));
  };

  const updateUIPreferences = (partial: Partial<UIPreferences>) => {
    setUiPreferences((prev) => ({ ...prev, ...partial }));
  };

  const updateRulerSettings = (partial: Partial<RulerSettings>) => {
    setRulerSettings((prev) => ({ ...prev, ...partial }));
  };

  const setGridSnapSensitivityMm = (val: number) => {
    setGridSnapSensitivityMmState(val);
  };

  const setThemeMode = (mode: 'light' | 'dark' | 'eink_high_contrast') => {
    setThemeModeState(mode);
  };

  return (
    <TooltipContext.Provider
      value={{
        tooltipSettings,
        gridSnapSensitivityMm,
        themeMode,
        uiPreferences,
        rulerSettings,
        isPreferencesModalOpen,
        openPreferencesModal: () => setIsPreferencesModalOpen(true),
        closePreferencesModal: () => setIsPreferencesModalOpen(false),
        updateTooltipSettings,
        updateUIPreferences,
        updateRulerSettings,
        setGridSnapSensitivityMm,
        setThemeMode,
      }}
    >
      {children}
    </TooltipContext.Provider>
  );
};

export function useTooltip() {
  const context = useContext(TooltipContext);
  if (!context) {
    return {
      tooltipSettings: DEFAULT_SETTINGS,
      gridSnapSensitivityMm: 1.0,
      themeMode: 'light' as const,
      uiPreferences: DEFAULT_UI_PREFERENCES,
      rulerSettings: DEFAULT_RULER_SETTINGS,
      isPreferencesModalOpen: false,
      openPreferencesModal: () => {},
      closePreferencesModal: () => {},
      updateTooltipSettings: () => {},
      updateUIPreferences: () => {},
      updateRulerSettings: () => {},
      setGridSnapSensitivityMm: () => {},
      setThemeMode: () => {},
    };
  }
  return context;
}

interface ContextTooltipProps {
  title: string;
  content?: string;
  category?: string;
  shortcut?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
}

export const ContextTooltip: React.FC<ContextTooltipProps> = ({
  title,
  content,
  category,
  shortcut,
  placement,
  position,
  children,
}) => {
  const { tooltipSettings } = useTooltip();
  const [isVisible, setIsVisible] = useState(false);
  const [timerId, setTimerId] = useState<any>(null);
  const [dismissTimerId, setDismissTimerId] = useState<any>(null);

  if (!tooltipSettings.enabled) {
    return children;
  }

  const handleMouseEnter = () => {
    if (timerId) clearTimeout(timerId);
    if (dismissTimerId) clearTimeout(dismissTimerId);

    const id = setTimeout(() => {
      setIsVisible(true);
      if (tooltipSettings.autoDismissSec > 0) {
        const autoId = setTimeout(() => {
          setIsVisible(false);
        }, tooltipSettings.autoDismissSec * 1000);
        setDismissTimerId(autoId);
      }
    }, tooltipSettings.hoverDelayMs);

    setTimerId(id);
  };

  const handleMouseLeave = () => {
    if (timerId) clearTimeout(timerId);
    if (dismissTimerId) clearTimeout(dismissTimerId);
    setIsVisible(false);
  };

  const effectivePosition = placement || position || 'top';

  const posClass =
    effectivePosition === 'top'
      ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
      : effectivePosition === 'bottom'
      ? 'top-full mt-2 left-1/2 -translate-x-1/2'
      : effectivePosition === 'left'
      ? 'right-full mr-2 top-1/2 -translate-y-1/2'
      : 'left-full ml-2 top-1/2 -translate-y-1/2';

  return (
    <div className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {isVisible && (
        <div
          style={{ opacity: tooltipSettings.opacityPercent / 100 }}
          className={`absolute z-50 ${posClass} pointer-events-none w-max max-w-xs bg-slate-900 text-white rounded-lg p-2 shadow-xl border border-slate-700 text-xs animate-in fade-in zoom-in-95 duration-150`}
        >
          <div className="font-bold flex items-center justify-between gap-2">
            <span>{title}</span>
            <div className="flex items-center gap-1">
              {shortcut && (
                <span className="text-[9px] font-mono px-1 py-0.2 bg-indigo-900/80 text-indigo-200 border border-indigo-700/60 rounded">
                  {shortcut}
                </span>
              )}
              {category && (
                <span className="text-[9px] uppercase px-1 py-0.2 bg-slate-800 text-indigo-300 rounded font-semibold">
                  {category}
                </span>
              )}
            </div>
          </div>
          {content && <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">{content}</p>}
        </div>
      )}
    </div>
  );
};
