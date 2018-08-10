<template>
    <div v-on:click="selectJob(jobId)" class="job-list-item-container">
        <span v-if="job.status == 'connected'" class="dot dot-green"></span>
        <span v-else-if="job.status == 'disconnected'" class="dot dot-red"></span>
        <span v-else-if="job.status == 'deleted'" class="dot dot-gray"></span>
        <p class="job-list-item-text">{{ jobId }}</p>
    </div>
</template>

<script>
export default {
    name: 'JobListItem',
    props: {
        jobId: String,
        selectJob: Function
    },
    data() {
        return {
            job: this.$root.$data.state.jobs[this.jobId]
        }
    }
}
</script>
