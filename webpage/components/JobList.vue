<!-- Copyright (c) 2018, Livio, Inc. -->
<template>
    <div class="job-list-container">
        <JobListItem v-for="jobId in Object.keys($root.$data.state.jobs)"
            v-bind:jobId="jobId"
            v-bind:key="jobId"
            v-bind:selectJob="selectJob"/>
    </div>
</template>

<script>
import JobListItem from './JobListItem.vue';

export default {
    name: 'JobList',
    props: {
        selectJob: Function
    },
    components: {
        JobListItem
    }
}
</script>
