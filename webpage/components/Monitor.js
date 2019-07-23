// Copyright (c) 2019, Livio, Inc.
import JobList from './JobList.js';
import JobInfo from './JobInfo.js';

export default {
    props: {
        jobs: Object
    },
    components: {
		JobList,
        JobInfo
    },
    data: function () {
        return {
            selectedJob: null
        }
    },
    methods: {
        selectJob: function (jobId) {
            console.log(`Selected to view ${jobId}`);
            this.selectedJob = this.jobs[jobId];
        }
    },
    template: `
    <div class="content flex-row">
        <JobList :jobs="jobs" v-bind:selectJob="selectJob"/>
        <JobInfo :selectedJob="selectedJob"/>
    </div>
    `,
};