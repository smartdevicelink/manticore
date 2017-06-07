var mocha = require('mocha');
var assert = require('assert');
var HAProxyTemplate = require('./HAProxyTemplate.js');


describe("#constructor()", function () {
	it("should return an object with appropriate parameters initialized", function () {
		var template = HAProxyTemplate();
		assert.notStrictEqual(template.webAppAddresses, undefined);
		assert.strictEqual(template.webAppAddresses.length, 0);
		assert.notStrictEqual(template.tcpMaps, undefined);
		assert.strictEqual(template.tcpMaps.length, 0);
		assert.notStrictEqual(template.httpMaps, undefined);
		assert.strictEqual(template.httpMaps.length, 0);
	});
});

describe("#setMainPort()", function () {
	it("should set the mainPort parameter of the template", function () {
		var template = HAProxyTemplate();
		template.setMainPort(4000);
		assert.strictEqual(template.mainPort, 4000);
	});
});

describe("#addWebAppAddress()", function () {
	it("should add addresses to the template", function () {
		var template = HAProxyTemplate();
		template.addWebAppAddress("127.0.0.1");
		template.addWebAppAddress("127.0.0.2");
		assert.strictEqual(template.webAppAddresses[0], "127.0.0.1");
		assert.strictEqual(template.webAppAddresses[1], "127.0.0.2");
	});
});

describe("#addHttpRoute()", function () {
	it("should add an http route to the template", function () {
		var template = HAProxyTemplate();
		template.addHttpRoute("127.0.0.1", "asdf");
		template.addHttpRoute("127.0.0.2", "zxcv");
		assert.strictEqual(template.httpMaps[0].from, "127.0.0.1");
		assert.strictEqual(template.httpMaps[0].to, "asdf");
		assert.strictEqual(template.httpMaps[1].from, "127.0.0.2");
		assert.strictEqual(template.httpMaps[1].to, "zxcv");
	});
});

describe("#addTcpRoute()", function () {
	it("should add an http route to the template", function () {
		var template = HAProxyTemplate();
		template.addTcpRoute(1234, "asdf");
		template.addTcpRoute(2345, "zxcv");
		assert.strictEqual(template.tcpMaps[0].port, 1234);
		assert.strictEqual(template.tcpMaps[0].to, "asdf");
		assert.strictEqual(template.tcpMaps[1].port, 2345);
		assert.strictEqual(template.tcpMaps[1].to, "zxcv");
	});
});

//I am not testing that generate function....