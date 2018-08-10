import Vue from 'vue';
import App from './App.vue';
import router from './router';
import store from './store';

new Vue({
    render: h => h(App),
    router,
    data: store
}).$mount('#app');
