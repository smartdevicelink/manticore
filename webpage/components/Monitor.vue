<!-- Copyright (c) 2018, Livio, Inc. -->
<template>
    <div class="content flex-row">
        <JobList v-bind:selectJob="selectJob"/>
        <JobInfo v-bind:jobId="selectedJobId"/>
    </div>
</template>

<script>
import JobList from './JobList.vue';
import JobInfo from './JobInfo.vue';

export default {
    name: 'Monitor',
    components: {
        JobList,
        JobInfo
    },
    data() {
        return {
            selectedJobId: null
        }
    },
    methods: {
        selectJob(jobId) {
            console.log(`Selected to view ${jobId}`);
            this.selectedJobId = jobId;
        }
    }
}
</script>
