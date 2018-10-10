//used for bundling many small requests into one large request after a period of inactivity

function BatchTimer () {
    this.commandBatchTimer;
    this.data = [];
    this.delay = 0; //default delay
    this.funcApply = () => {}; //default function
}

BatchTimer.prototype.add = function (element) {
    this.data.push(element);
    clearTimeout(this.commandBatchTimer);
    this.commandBatchTimer = setTimeout(async () => {
        await this.funcApply(this.data); //send the batched data to the function passed in
        //do not clear the data here, or else issues can happen where data comes in while the funcApply
        //is doing asynchronous things, and thus misses any new data pushed in, losing that data after execution 
        //do not delete the command batch timer, either, as the async function messes with the ordering of events;
        //at this point a different timer could be running already
    }, this.delay);
}

BatchTimer.prototype.setDelay = function (num) {
    this.delay = num;
}

BatchTimer.prototype.setFunction = function (f) {
    this.funcApply = f;
}

module.exports = BatchTimer;