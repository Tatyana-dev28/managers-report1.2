import './style.css';
import { startApp } from './app';
import { startDetail } from './detail';

function getDetailParamsFromUrl(): Record<string, string> | null {
  const urlParams = new URLSearchParams(window.location.search);
  const empId = urlParams.get('employee_id');
  const metric = urlParams.get('metric');
  if (empId && metric) {
    return {
      employee_id: empId,
      date_from: urlParams.get('date_from') || '',
      date_to: urlParams.get('date_to') || '',
      metric: metric,
      metric_title: urlParams.get('metric_title') || '',
    };
  }
  return null;
}

function runApp() {
  if (window.BX24 && typeof window.BX24.init === 'function') {
    window.BX24.init(() => {
      // Пытаемся получить параметры из placement (слайдер)
      let params: Record<string, string> | null = null;
      try {
        if (window.BX24?.placement) {
          const info = window.BX24.placement.info();
          const options = info?.options as Record<string, string> | undefined;
          if (options?.employee_id && options?.metric) {
            params = options;
          }
        }
      } catch {
        // placement.info может выбросить ошибку
      }

      // Fallback: проверяем URL параметры
      if (!params) {
        params = getDetailParamsFromUrl();
      }

      if (params) {
        void startDetail(params);
      } else {
        void startApp();
      }
    });
  } else {
    console.warn('BX24 не найден, запускаем без авторизации (только локально)');
    const params = getDetailParamsFromUrl();
    if (params) {
      void startDetail(params);
    } else {
      void startApp();
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runApp);
} else {
  runApp();
}
