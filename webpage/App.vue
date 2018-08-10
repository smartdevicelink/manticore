<template>
    <div class="main-container">
        <div class="header">
            <p class="header-title">Manticore Developer Page</p>
            <router-link to="/actions" class="header-link">Actions</router-link>
            <router-link to="/monitor" class="header-link">Monitor</router-link>
        </div>
        <router-view></router-view>
    </div>
</template>

<script>
export default {
    name: 'App'
}
</script>

<style>
@import './assets/styles/main.css';
</style>
