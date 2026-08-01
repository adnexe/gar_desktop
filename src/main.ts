import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { initializeTheme } from './composables/useAppearance';
import { initialiserCalibrationImpression } from './lib/calibrationImpression';
import './assets/app.css';

initializeTheme();
void initialiserCalibrationImpression();

createApp(App).use(createPinia()).use(router).mount('#app');
