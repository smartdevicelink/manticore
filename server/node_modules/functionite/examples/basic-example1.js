//Goal: chain multiple functions with no callbacks using functionite
var functionite = require('../index.js');

//functions that add and multiply two numbers with synchronous behavior
function add (a, b) {
	return a + b;
}
function mul (a, b) {
	return a * b;
}
//convert them into functions that can be used by functionite
//these new functions use a callback to return the values,
//which are required for functionite to chain these together
var addCallback = functionite(add);
var mulCallback = functionite(mul);
//add the number 3 and 5, then take the result of it and multiply it by 7
//notice how in the second "to" function only the function name and the second
//parameter is necessary. The result of addCallback will pass it to mulCallback's
//first argument for you
functionite().to(addCallback, 3, 5).to(mulCallback, 7).then(function (results) {
	//this function always has an array as a parameter, in case multiple values are returned
	console.log(results[0]); //(3+5) * 7 = 56
});