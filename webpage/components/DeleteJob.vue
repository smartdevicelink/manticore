<template>
    <div>
        <h2>Delete Job</h2>
        <div v-if="errorMessage != null">
            <p>Error:</p>
            <p>{{ errorMessage }}</p>
        </div>
        <label>ID: </label>
        <input type="text" v-model="idText">
        <button v-on:click="deleteJob">Delete</button>
        <div v-if="manticoreResponse != null">
            <p>Response {{ responseTime }} :</p>
            <p>{{ manticoreResponse }}</p>
        </div>
    </div>
</template>

<script>
import axios from 'axios';

export default {
    name: 'DeleteJob',
    props: {
        manticoreAddress: String
    },
    data() {
        return {
            idText: '',
            errorMessage: null,
            manticoreResponse: null,
            responseTime: ''
        }
    },
    methods: {
        deleteJob() {
            axios.delete(this.manticoreAddress + '/api/v2/job', {
                    data: {
                        id: this.idText
                    }
                })
                .then((response) => {
                    this.manticoreResponse = response.data;
                    this.responseTime = new Date().toTimeString();
                    this.errorMessage = null;
                })
                .catch((error) => {
                    this.errorMessage = error;
                    this.manticoreResponse = null;
                });
        }
    }
}
</script>
