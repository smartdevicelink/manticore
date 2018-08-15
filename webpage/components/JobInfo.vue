<!-- Copyright (c) 2018, Livio, Inc. -->
<template>
    <div class="job-info-container">
        <div class="job-info-buffer"></div>
        <p v-if="jobId == '' || jobId == null" class="flex-align-center">Select a job to view its info</p>
        <template v-else>
            <div class="job-info-section">
                <label class="job-info-label">Job ID: </label>
                <p class="action-text">{{ jobId }}</p>
            </div>
            <div class="job-info-section">
                <label class="job-info-label">Code: </label>
                <p class="action-text">{{ job.code }}</p>
            </div>
            <div class="job-info-section">
                <label class="job-info-label">Status: </label>
                <p class="action-text">{{ job.status }}</p>
            </div>

            <div class="job-info-section">
                <label class="job-info-label">Messages: </label>
            </div>
            <div class="message-container">
                <p v-for="message in job.messages" class="message">{{ message }}</p>
            </div>
        </template>
        <div class="job-info-buffer"></div>
    </div>
</template>

<script>
export default {
    name: 'JobInfo',
    props: {
        jobId: String
    },
    computed: {
        job() {
            return this.$root.$data.state.jobs[this.jobId];
        }
    }
}
</script>
