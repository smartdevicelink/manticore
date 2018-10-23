<!-- Copyright (c) 2018, Livio, Inc. -->
<template>
    <div class="content flex-row">
        <CreateJob />
        <DeleteJob />
    </div>
</template>

<script>
import CreateJob from './CreateJob.vue';
import DeleteJob from './DeleteJob.vue';

export default {
    name: 'Actions',
    components: {
        CreateJob,
        DeleteJob
    }
}
</script>
