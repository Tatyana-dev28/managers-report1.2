import './style.css';
import { startApp } from './app';
import { startDetail } from './detail';

function runApp() {
  // Проверяем, открыто ли приложение как слайдер детализации
  // BX24.openApplication() передаёт параметры через placement.info()
  let isDetailView = false;

  if (window.BX24?.placement) {
    try {
      const info = window.BX24.placement.info();
      const options = info?.options as Record<string, unknown> | undefined;
      if (options?.employee_id && options?.metric) {
        isDetailView = true;
      }
    } catch {
      // placement.info может выбросить ошибку
    }
  }

  // Fallback: проверяем URL параметры
  if (!isDetailView) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('employee_id') && urlParams.get('metric')) {
      isDetailView = true;
    }
  }

  if (window.BX24 && typeof window.BX24.init === 'function') {
    window.BX24.init(() => {
      if (isDetailView) {
        void startDetail();
      } else {
        void startApp();
      }
    });
  } else {
    console.warn('BX24 не найден, запускаем без авторизации (только локально)');
    if (isDetailView) {
      void startDetail();
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
