## Functionite

Pass arguments and return values to function chains in an asynchronous manner

Characteristics:
 * lightweight
 * no dependencies
 * run on browser and nodejs
 * chain asynchronous functions to prevent the pyramid of doom
 * convert functions without a callback into ones compatible for functionite
 
Demonstrations can be found in /examples

Basic usage:
```javascript
//initializes an array object with "to" and "then" methods
var func = functionite(); 
//use the "to" method to pass in functions with a callback as 
//the last parameter
function async1 (a, b, cb) {
    setTimeout(function () {
        cb(a + b);
    }, 100);
}
//add async1 as the first function to be called, passing in 2 and 3
func = func.to(async1, 2, 3);
//add async1 as the second function to be called. the result of async1's method
//and 4 will both be passed to this function automatically
func = func.to(async1, 4);
//when all the functions are done being chained, call "then" to execute them
//the final value(s) will be passed back as an array
func.then(function (results) {
    console.log(results[0]); //prints "9"
});
//or combine all of the above into one step
functionite().to(async1, 2, 3).to(async1, 4).then(function (results) {
    console.log(results[0]); //prints "9"
});
```