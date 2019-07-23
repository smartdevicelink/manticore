// Copyright (c) 2019, Livio, Inc.
export default {
    props: {
        selectedJob: Object
    },
    template: `
    <div v-if="selectedJob" class="job-info-container">
        <div class="job-info-buffer"></div>
        <p v-if="selectedJob.id == '' || selectedJob.id == null" class="flex-align-center">Select a job to view its info</p>
        <template v-else>
            <div class="job-info-section">
                <label class="job-info-label">Job ID: </label>
                <p class="action-text">{{ selectedJob.id }}</p>
            </div>
            <div class="job-info-section">
                <label class="job-info-label">Code: </label>
                <p class="action-text">{{ selectedJob.code }}</p>
            </div>
            <div class="job-info-section">
                <label class="job-info-label">Status: </label>
                <p class="action-text">{{ selectedJob.status }}</p>
            </div>

            <div class="job-info-section">
                <label class="job-info-label">Messages: </label>
            </div>
            <div class="message-container">
                <p v-for="message in selectedJob.messages" class="message">{{ message }}</p>
            </div>
        </template>
        <div class="job-info-buffer"></div>
    </div>
    `,
};
