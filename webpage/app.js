// Copyright (c) 2019, Livio, Inc.

import Actions from './components/Actions.js';
import Monitor from './components/Monitor.js';

const jobs = {}

const router = new VueRouter({
    routes: [
        {
            path: '/',
            redirect: '/actions'
        },
        {
            path: '/actions',
            name: 'Actions',
            component: Actions,
            props: { jobs: jobs }
        },
        {
            path: '/monitor',
            name: 'Monitor',
            component: Monitor,
            props: { jobs: jobs }
        }
    ]
})

const app = new Vue({
    router,
    el: '#app',
    data: {
    },
    methods: {
        
    },
    components: {  },
    template: `
        <div class="main-container">
        <div class="header">
            <p class="header-title">Manticore Developer Page</p>
            <router-link to="/actions" class="header-link">Actions</router-link>
            <router-link to="/monitor" class="header-link">Monitor</router-link>
        </div>
        <router-view></router-view>
    </div>
`
})