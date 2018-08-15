// Copyright (c) 2018, Livio, Inc.
export default  {
    state: {
        jobs: {}
    },
    createJob(id, code, ip) {
        this.state.jobs[id] = {
            code,
            ip,
            messages: [],
            status: 'disconnected'
        };
    },
    deleteJob(id) {
        if (this.state.jobs[id] == undefined) {
            console.log(`${id} does not exist to delete`);
            return false;
        }
        this.state.jobs[id].status = 'deleted';
        if (this.state.jobs[id].webSocket != undefined) {
            console.log(`Closing websocket for ${id}`);
            this.state.jobs[id].webSocket.close();
        }
        return true;
    },
    createWebSocket(id, code) {
        console.log(`Creating web socket with code ${code} for ${id}`);
        const wsUrl = this.state.jobs[id].ip.replace('http', 'ws') + '/' + code;
        const ws = new WebSocket(wsUrl);
        this.state.jobs[id].webSocket = ws;

        ws.onopen = function ()  {
            console.log(`${id} connected to /api/v2/job/${code}`);
            this.state.jobs[id].status = 'connected';
        }.bind(this);

        ws.onmessage = function (message) {
            console.log(`${id} received a message`);
            const dataObj = JSON.parse(message.data);
            this.state.jobs[id].messages.push(dataObj);

            if (dataObj.type == 'activity') {
                const msg = {
                    type: 'activity'
                };
                ws.send(JSON.stringify(msg));
            }
        }.bind(this);

        ws.onclose = function (data) {
            console.log(`${id} closed websocket connection`);
            this.state.jobs[id].webSocket = null;
            if (this.state.jobs[id].status != 'deleted') {
                this.state.jobs[id].status = 'disconnected';
            }
        }.bind(this);
    }
}
