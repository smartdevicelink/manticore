<template>
    <div>
        <div class="dev-page-header">
            <p class="dev-page-title">Manticore Developer Page</p>
        </div>
        <div class="dev-page-actions-container">
            <CreateJob />
            <DeleteJob />
        </div>
    </div>
</template>

<script>
import CreateJob from './components/CreateJob.vue';
import DeleteJob from './components/DeleteJob.vue';

export default {
    name: 'App',
    components: {
        CreateJob,
        DeleteJob
    }
}
</script>

<style>
@import './assets/styles/main.css';
</style>
