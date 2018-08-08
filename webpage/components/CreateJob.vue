<template>
    <div>
        <h2>Create Job</h2>
        <div v-if="errorMessage != null">
            <p>Error:</p>
            <p>{{ errorMessage }}</p>
        </div>
        <label>Job Object: </label>
        <textarea v-model="jobText"></textarea>
        <button v-on:click="submitJob">Create</button>
        <div v-if="manticoreResponse != null">
            <p>Response {{ responseTime }} :</p>
            <p>{{ manticoreResponse }}</p>
        </div>
    </div>
</template>

<script>
import axios from 'axios';

export default {
    name: 'CreateJob',
    props: {
        manticoreAddress: String
    },
    data() {
        return {
            genericJob: {
                id: '1',
                core: {
                    version: '4.5.1',
                    build: 'default'
                },
                hmi: {
                    type: 'generic',
                    version: 'minimal'
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

            axios.post(this.manticoreAddress + '/api/v2/job', job)
                .then((response) => {
                    this.manticoreResponse = response.data;
                    this.responseTime = new Date().toTimeString();
                })
                .catch((error) => {
                    this.errorMessage = error;
                    this.manticoreResponse = null;
                });
        }
    }
}
</script>
