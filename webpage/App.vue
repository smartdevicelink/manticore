<template>
    <div>
        <h1>Manticore Developer Page</h1>
        <CreateJob v-bind:manticoreAddress="manticoreAddress"/>
        <DeleteJob v-bind:manticoreAddress="manticoreAddress"/>
    </div>
</template>

<script>
import CreateJob from './components/CreateJob.vue';
import DeleteJob from './components/DeleteJob.vue';
import config from './config';

export default {
    name: 'App',
    components: {
        CreateJob,
        DeleteJob
    },
    data() {
        return {
            manticoreAddress: config.manticoreAddress
        }
    }
}
</script>
