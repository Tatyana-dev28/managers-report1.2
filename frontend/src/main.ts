import './style.css';
import { startApp } from './app';

function runApp() {
    console.log('Запуск приложения...');
    console.log('window.BX24:', window.BX24);
    console.log('window.name:', window.name);
    
    if (window.BX24 && typeof window.BX24.init === 'function') {
        console.log('Инициализация BX24...');
        window.BX24.init(() => {
            console.log('BX24 инициализирован, запускаем приложение');
            void startApp();
        });
    } else {
        console.warn('BX24 не найден, запускаем без авторизации (только локально)');
        void startApp();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runApp);
} else {
    runApp();
}
