//Goal: deal with conditionals using functionite
var functionite = require('../index.js');

//functionite's equalTo method will keep calling functions
//as long as the result returned is the same as the first
//argument passed in equalTo. The callback function gives
//a boolean as to whether all the functions's result values
//matched the target value passed in
function isEven (num) {
	return (num % 2 === 0);
}
function isOdd (num) {
	return (num % 2 !== 0);
}

//convert the above into functions usable by functionite
var isEvenCb = functionite(isEven);
var isOddCb = functionite(isOdd);

//note that in this case the results of one function
//are NOT passed to the next one
functionite()
	.to(isEvenCb, 6) //check if 6 is even
	.to(isOddCb, 5) //check if 5 is odd
	.to(isEvenCb, 6) //check if 6 is even
	//check if all the results of the functions above
	//give back a "true" value
	.equalTo(true, function (completed) {
		//completed is the boolean of whether this operation
		//was successful
		console.log(completed);
	});

function lessThanFive (num, cb) {
	console.log("parameter used: " + num);
	cb(num < 5);
}
//here is an example of completed being false
//as soon as a function doesn't return the correct result
//the callback function in equalTo is invoked
//note that in the console only 4 and 5 were passed in
//to lessThanFive
functionite()
	.to(lessThanFive, 4)
	.to(lessThanFive, 5) //will fail here
	.to(lessThanFive, 6)
	.equalTo(true, function (completed) {
		console.log(completed);
	});