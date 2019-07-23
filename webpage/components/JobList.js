// Copyright (c) 2019, Livio, Inc.
export default {
    props: {
        selectJob: Function,
        jobs: Object
    },
    template: `
    <div class="job-list-container">
        <div v-for="job in jobs">
            <div v-on:click="selectJob(job.id)" class="job-list-item-container">
                <span v-if="job.status == 'connected'" class="dot dot-green"></span>
                <span v-else-if="job.status == 'disconnected'" class="dot dot-red"></span>
                <span v-else-if="job.status == 'deleted'" class="dot dot-gray"></span>
                <p class="job-list-item-text">{{ job.id }}</p>
            </div>
        </div>
    </div>
    `,
};