module.exports = {
	//constant string values used throughout manticore
	strings: {
		manticoreServiceName: "manticore-service",
		coreServicePrefix: "core-service-",
		hmiServicePrefix: "hmi-service-",
		coreHmiJobPrefix: "core-hmi-",
		coreGroupPrefix: "core-group-",
		hmiGroupPrefix: "hmi-group-",
		coreTaskPrefix: "core-task-",
		hmiTaskPrefix: "hmi-task-",
		hmiAliveHealth: "hmi-alive",
		manticoreAliveHealth: "manticore-alive",
		baseImageSdlCore: "smartdevicelink/manticore-sdl-core",
		baseImageGenericHmi: "smartdevicelink/manticore-generic-hmi",
		imageTagMaster: ":master",
		imageTagDevelop: ":develop",
		imageTagManticore: ":manticore",
		//string constants for AWS CloudWatch metrics
		requestCount: "RequestCount",
		allocationCount: "AllocationCount",
		userDuration: "UserDuration"
	},
	//keys in the KV store
	keys: {
		//locations of pieces of data meant for a certain purpose
		request: "manticore/requests",
		waiting: "manticore/waiting",
		allocation: "manticore/allocations",
		//data keys store actual data related to users
		data: {
			request: "manticore/requests/data",
			waiting: "manticore/waiting/data",
			allocation: "manticore/allocations/data",
			haproxy: "haproxy/data"
		},
		//filler keys that are kept next to a list so that we receive change notifications if the list is empty
		fillers: {
			request: "manticore/requests/filler",
			waiting: "manticore/waiting/filler",
			allocation: "manticore/allocations/filler"
		},
		//information specific to the construction of the config file
		haproxy: {
			//port that reverse proxy opens to access manticore web app
			mainPort: "haproxy/mainPort",
			domainName: "haproxy/domainName",
			webApp: "haproxy/webAppAddresses",
			tcpMaps: "haproxy/data/tcpMaps",
			httpFront: "haproxy/data/httpFront",
			httpBack: "haproxy/data/httpBack"
		}
	}
}