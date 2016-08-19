(function() {

	var root = this;

	//given an object, converts it to an array and returns the array
	function objToArray (obj) {
		var arr = [];
		for (var key in obj) {
			arr.push(obj[key]);
		}
		return arr;
	}

	//given a function, can convert it into one with a callback
	//given nothing, will expose the stack and some functions to deal
	//with chaining
	function functionite (func) {
		//the stack is the array where stack function objects are stored
		//each object in this array contains the following:
		//f: a function. it is passed as a parameter when calling "to"
		//args: arguments for the function, passed in after the function
		var stack = [];

		//push a function and its parameters onto the stack
		stack.to = function () {
			var stackFunc = {
				f: arguments[0],
				args: objToArray(arguments).slice(1)
			};
			stack.push(stackFunc);
			return stack;
		};

		//call all the functions in the stack, passing the results of
		//previous functions to the next one as arguments. the callback 
		//returns an array of the results of the final function called
		stack.then = function (cb) {
			var funcObj = stack.shift(); //remove the next function in stack
			for (var arg in funcObj.args) { //apply args without invocation
				funcObj.f = funcObj.f.bind(this, funcObj.args[arg]);
			}
			funcObj.f(function () {//call the function. this is the callback
				if (stack.length !== 0) {
					//this is how the results of values, passed from the callback
					//are pushed to the next function. repeat this process
					stack[0].args = objToArray(arguments).concat(stack[0].args);
					stack.then(cb);
				}
				else {
					//finished calling the functions. pass in the final
					//function's callback values
					cb(objToArray(arguments));
				}
			});
		};

		//continue calling functions in the stack as long as each function
		//returns the same value specified in <target>. results are NOT
		//passed to the next function
		stack.equalTo = function (target, cb) {
			var funcObj = stack.shift(); //remove the next function in stack
			for (var arg in funcObj.args) { //apply args without invocation
				funcObj.f = funcObj.f.bind(this, funcObj.args[arg]);
			}
			funcObj.f(function (result) { //call the function. this is the callback
				//each callback should return some result to be checked against the target
				if (result === target) {
					if (stack.length !== 0) { //continue this process
						stack.equalTo(target, cb);
					}
					else { //done calling functions and all results matched the target
						cb(true);
					}
				}
				else { //as soon as a result doesn't match the target, callback false
					cb(false);
				}
			});
		};
		//if a function is passed in, convert the function into something that can be used with functionite
		if (func) {
			var newFunc = function () {
				//move this apply function's result into this variable. 
				//subtituting the result variable in the second line causes a bug for browsers
				var result = func.apply(this, objToArray(arguments).slice(0, -1));
				arguments[arguments.length - 1](result);
			}
			return newFunc;
		}
		else {
			return stack;
		}
	}
	//add compatability with browser and with nodejs
	//from http://underscorejs.org/docs/underscore.html
	if (typeof exports !== 'undefined') {
		if (typeof module !== 'undefined' && module.exports) {
		  	exports = module.exports = functionite;
		}
		exports.functionite = functionite;
	} else {
		root.functionite = functionite;
	}
})();