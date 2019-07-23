// Copyright (c) 2019, Livio, Inc.

export default {
    props: {
        createJob: Function,
        createWebSocket: Function,
    },
    data: function () {
        return {
            genericJob: {
                id: '1',
                core: {
                    version: '5.1.3',
                    build: 'default'
                },
                hmi: {
                    type: 'generic',
                    version: 'minimal-0.6.1'
                }
            },
            jobText: '',
            manticoreResponse: null,
            responseTime: '',
            errorMessage: null            
        }
    },
    created: function () {
        this.jobText = JSON.stringify(this.genericJob, null, 2);
    },
    methods: {
        submitJob: function () {
            let job;
            try {
                job = JSON.parse(this.jobText);
                this.errorMessage = null;
            } catch(e) {
                this.errorMessage = e.message;
                this.manticoreResponse = null;
                return;
            }

            axios.post('/api/v2/job', job)
                .then((response) => {
                    this.manticoreResponse = response.data;
                    this.responseTime = new Date().toTimeString();
                    this.createJob(job.id, response.data.passcode, response.request.responseURL);
                    this.createWebSocket(job.id, response.data);
                })
                .catch((error) => {
                    console.log(error);
                    this.errorMessage = error.response.data;
                    this.manticoreResponse = null;
                });
        }
    },
    template: `
    <div class="action-container">
        <h2 class="action-title">Create Job</h2>
        <div v-if="errorMessage != null" class="error-container">
            <p class="action-text">Error: {{ errorMessage }}</p>
        </div>
        <label class="action-label">Job Object: </label>
        <textarea v-model="jobText" class="action-text-area"></textarea>
        <button v-on:click="submitJob" class="action-button">Create</button>
        <div v-if="manticoreResponse != null" class="response-container">
            <p class="action-text">Response [{{ responseTime }}] : {{ manticoreResponse }}</p>
        </div>
    </div>
    `,
};