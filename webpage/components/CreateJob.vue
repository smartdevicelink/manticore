<!-- Copyright (c) 2018, Livio, Inc. -->
<template>
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
</template>

<script>
import axios from 'axios';

export default {
    name: 'CreateJob',
    data() {
        return {
            genericJob: {
                id: '1',
                core: {
                    version: '5.1.0',
                    build: 'default'
                },
                hmi: {
                    type: 'generic',
                    version: 'minimal-0.5.2'
                }
            },
            jobText: '',
            manticoreResponse: null,
            responseTime: '',
            errorMessage: null
        }
    },
    created() {
        this.jobText = JSON.stringify(this.genericJob, null, 2);
    },
    methods: {
        submitJob() {
            var job;
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
                    this.$root.$data.createJob(job.id, response.data.passcode, response.request.responseURL);
                    this.$root.$data.createWebSocket(job.id, response.data);
                })
                .catch((error) => {
                    this.errorMessage = error.response.data;
                    this.manticoreResponse = null;
                    console.log(error);
                });
        }
    }
}
</script>
