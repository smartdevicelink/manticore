import Vue from 'vue';
import Router from 'vue-router';
import Actions from '../components/Actions.vue';
import Monitor from '../components/Monitor.vue';

Vue.use(Router);

export default new Router({
    routes: [
        {
            path: '/',
            redirect: '/actions'
        },
        {
            path: '/actions',
            name: 'Actions',
            component: Actions
        },
        {
            path: '/monitor',
            name: 'Monitor',
            component: Monitor
        }
    ]
});
