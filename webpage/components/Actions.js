// Copyright (c) 2019, Livio, Inc.
import CreateJob from './CreateJob.js';
import DeleteJob from './DeleteJob.js';

export default {
    props: ['jobs'],
    methods: {
        createJob: function (id, code, ip) {
            this.jobs[id] = {
                id,
                code,
                ip,
                messages: [],
                status: 'disconnected'
            };
        },
        removeJob: function (id) {
            if (this.jobs[id] == undefined) {
                console.log(`${id} does not exist to delete`);
                return false;
            }
            this.jobs[id].status = 'deleted';
            if (this.jobs[id].webSocket != undefined) {
                console.log(`Closing websocket for ${id}`);
                this.jobs[id].webSocket.close();
            }
            return true;
        },
        createWebSocket: function (id, data) {
            const {path, protocol, passcode, port, domain} = data;
            console.log(`Creating web socket with code ${passcode} for ${id}`);

            const baseUrl = this.jobs[id].ip.match(/[^\/]+/g)[1];
            let wsUrl = `${protocol}://${domain}:${port}${path}${passcode}`;
            if (!domain) {
                wsUrl = `${protocol}://${baseUrl}${path}${passcode}`;
            }

            const ws = new WebSocket(wsUrl);
            this.jobs[id].webSocket = ws;

            ws.onopen = function ()  {
                console.log(`${id} connected to /api/v2/job/${passcode}`);
                this.jobs[id].status = 'connected';
            }.bind(this);

            ws.onmessage = function (message) {
                console.log(`${id} received a message`);
                const dataObj = JSON.parse(message.data);
                this.jobs[id].messages.push(dataObj);

                if (dataObj.type == 'activity') {
                    const msg = {
                        type: 'activity'
                    };
                    ws.send(JSON.stringify(msg));
                }
            }.bind(this);

            ws.onclose = function (data) {
                console.log(`${id} closed websocket connection`);
                this.jobs[id].webSocket = null;
                if (this.jobs[id].status != 'deleted') {
                    this.jobs[id].status = 'disconnected';
                }
            }.bind(this);
        },
    },
    components: {
        CreateJob,
        DeleteJob
	},
    template: `
    <div class="content flex-row">
        <CreateJob :create-job="createJob" :create-web-socket="createWebSocket"/>
        <DeleteJob :remove-job="removeJob"/>
    </div>
    `,
};