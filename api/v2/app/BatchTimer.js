//used for bundling many small requests into one large request after a period of inactivity

function BatchTimer () {
    this.commandBatchTimer;
    this.data = [];
    this.delay = 0; //how much time to wait between calls to "add" before running funcApply
    this.invocationDate = 0; //used internally
    this.funcApply = () => {}; //default function
}

BatchTimer.prototype.add = function (element, invocationDate) {
    if (this.invocationDate - Date.now() <= 0) { //new invocation date needed
        this.invocationDate = invocationDate; //set the max delay date to the passed in date
    }
    const timeUntilDate = this.invocationDate - Date.now();
    const selectedDelay = Math.min(this.delay, timeUntilDate);

    this.data.push(element);
    clearTimeout(this.commandBatchTimer);
    this.commandBatchTimer = setTimeout(async () => {
        await this.funcApply(this.data); //send the batched data to the function passed in
        //do not clear the data here, or else issues can happen where data comes in while the funcApply
        //is doing asynchronous things, and thus misses any new data pushed in, losing that data after execution 
        //do not delete the command batch timer, either, as the async function messes with the ordering of events;
        //at this point a different timer could be running already
    }, selectedDelay);
}

BatchTimer.prototype.setDelay = function (num) {
    this.delay = num;
}

BatchTimer.prototype.setFunction = function (f) {
    this.funcApply = f;
}

module.exports = BatchTimer;